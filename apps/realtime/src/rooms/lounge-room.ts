import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ACTION_MESSAGE,
  ActionMessage,
  CHAT_EVENT,
  CHAT_MESSAGE,
  CHAT_REJECTED_EVENT,
  ChatMessage,
  DM_EVENT,
  DM_MESSAGE,
  DM_REJECTED_EVENT,
  DirectMessage,
  INVITE_EVENT,
  LoungeJoinOptions,
  LoungeState,
  MOVE_MESSAGE,
  MoveMessage,
  PROTOCOL_VERSION,
  PlayerState,
  REFRESH_TICKET_MESSAGE,
  ROOM_PRIVACIES,
  ROTATE_INVITE_MESSAGE,
  RefreshTicketMessage,
  RoomTitle,
  STATE_PATCH_INTERVAL_MS,
  WAVE_DURATION_MS,
  type ChatEvent,
  type ChatRejectedEvent,
  type DirectMessageEvent,
  type DirectMessageRejectedEvent,
  type InviteEvent,
  type PlayerAction,
  type RoomPrivacy,
} from '@3dx/contracts';
import {
  OBSTACLES,
  SEATS,
  nearestFreeSeat,
  pickSpawn,
  stepMovement,
  type MovementState,
  type Vec2,
} from '@3dx/game-core';
import { logEvent } from '@3dx/observability';
import { CloseCode, Room, ServerError, validate, type Client, type Deferred } from '@colyseus/core';
import { z } from 'zod';
import { createTicketVerifier, type Identity, type TicketVerifier } from '../auth/ticket.ts';
import { ChatRateLimit } from './chat-rate-limit.ts';

/** Meta inicial de teste (spec: 8–16), não capacidade garantida. Lotada, o matchmaking abre outra sala. */
export const MAX_PLAYERS = 16;

/** O cliente envia no máximo uma direção por intervalo de patch (20/s); acima disso é abuso. */
const MAX_MESSAGES_PER_SECOND = 30;

/** Chat: até 5 mensagens a cada 10 s por usuário. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;

export const DEFAULT_ROOM_TITLE = 'Lounge';

/**
 * Mensagens privadas atravessam salas pela presença do Colyseus: cada sala assina o canal de quem
 * está nela, e a contagem de sessões por usuário diz se o destinatário está online. Em memória,
 * vale para um processo; com várias instâncias, a presença precisa ser compartilhada (Redis).
 */
const ONLINE_KEY = 'dm:online';
const dmTopic = (userId: string) => `dm:${userId}`;

/** Frequência da conferência de tickets vencidos. */
const LEASE_CHECK_MS = 1000;

/** Ao levantar, o avatar sai este tanto (m) para a frente do assento. */
const STAND_UP_DISTANCE = 0.6;

export interface LoungeRoomOptions {
  /** Tempo que o lugar de quem caiu fica reservado antes de o avatar sair da sala. */
  reconnectSeconds: number;
  /** Chave pública Ed25519 (SPKI DER em base64) que confere os tickets emitidos pela API. */
  ticketPublicKey: string;
  /**
   * Folga depois do vencimento do ticket antes de tirar a pessoa da sala. O cliente renova a cada
   * 20 s, mas aba em segundo plano pode ter timers limitados a um por minuto pelo navegador.
   */
  ticketGraceSeconds: number;
}

/** Opções que quem cria a sala pode escolher (o resto vem do servidor e prevalece). */
const CreateOptions = z.object({
  privacy: z.enum(ROOM_PRIVACIES).optional(),
  title: RoomTitle.optional(),
});

interface Member {
  identity: Identity;
  movement: MovementState;
  /** Última direção pedida pelo cliente; o servidor decide quanto o avatar anda. */
  direction: Vec2;
  action: PlayerAction;
  /** Assento ocupado (índice em SEATS) enquanto `action === 'sit'`. */
  seat?: number;
  /** Fim do aceno (epoch ms). */
  actionUntil?: number;
}

const STOPPED: Vec2 = { x: 0, z: 0 };

/** Bloqueio vale nos dois sentidos: nenhum dos dois recebe as mensagens do outro. */
const blockedBetween = (a: Identity, b: Identity) =>
  a.blocked.has(b.userId) || b.blocked.has(a.userId);

const sameSecret = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const newInviteCode = () => randomBytes(18).toString('base64url');

/**
 * Sala do lounge com estado autoritativo. Só entra quem apresenta um ticket assinado pela API;
 * nome e id vêm do ticket. Sala privada exige convite (exceto para o dono). O cliente envia só
 * intenções (direção, chat, ação); posição, assentos, limites e filtros são decididos aqui.
 */
export class LoungeRoom extends Room<{ state: LoungeState }> {
  override maxClients = MAX_PLAYERS;
  override patchRate = STATE_PATCH_INTERVAL_MS;
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  override state = new LoungeState();

  private reconnectSeconds = 20;
  private ticketGraceMs = 30_000;
  private verifyTicket: TicketVerifier = () => Promise.resolve(undefined);
  private readonly members = new Map<string, Member>();
  private readonly chatLimit = new ChatRateLimit(CHAT_BURST, CHAT_WINDOW_MS);
  private readonly dmLimit = new ChatRateLimit(CHAT_BURST, CHAT_WINDOW_MS);
  /** Assinatura do canal de mensagens privadas de cada usuário presente nesta sala. */
  private readonly dmSubscriptions = new Map<string, (event: DirectMessageEvent) => void>();
  /** Vagas reservadas para quem caiu, por sessionId (canceláveis). */
  private readonly pendingReconnections = new Map<string, Deferred<Client>>();
  /** Convite da sala privada; nunca vai para o estado público. */
  private inviteCode = '';
  /** Identidade do dono (bloqueios dele valem para quem tenta entrar). */
  private owner?: Identity;

  // Payload inválido ou tipo de mensagem desconhecido derrubam a conexão (comportamento do Colyseus).
  override messages = {
    [MOVE_MESSAGE]: validate(MoveMessage, (client: Client, direction: MoveMessage) => {
      const member = this.members.get(client.sessionId);
      if (!member) return;
      if ((direction.x !== 0 || direction.z !== 0) && member.action !== '') {
        this.endAction(client.sessionId, member);
      }
      member.direction = direction;
    }),
    [CHAT_MESSAGE]: validate(ChatMessage, (client: Client, message: { text: string }) => {
      this.chat(client, message.text);
    }),
    [DM_MESSAGE]: validate(
      DirectMessage,
      (client: Client, message: { to: string; text: string }) => {
        void this.directMessage(client, message);
      },
    ),
    [REFRESH_TICKET_MESSAGE]: validate(
      RefreshTicketMessage,
      (client: Client, message: RefreshTicketMessage) => {
        void this.refreshTicket(client, message.ticket);
      },
    ),
    [ACTION_MESSAGE]: validate(ActionMessage, (client: Client, message: ActionMessage) => {
      this.act(client.sessionId, message.type);
    }),
    [ROTATE_INVITE_MESSAGE]: (client: Client) => {
      this.rotateInvite(client);
    },
  };

  override async onCreate(options: LoungeRoomOptions): Promise<void> {
    this.reconnectSeconds = options.reconnectSeconds;
    this.ticketGraceMs = options.ticketGraceSeconds * 1000;
    this.verifyTicket = createTicketVerifier(options.ticketPublicKey);

    // O Colyseus junta aqui as opções do cliente (privacy, title) com as do servidor.
    // Opções inválidas não criam nada útil: a entrada do criador é recusada em onAuth.
    const create = CreateOptions.safeParse(options);
    const privacy: RoomPrivacy = create.success ? (create.data.privacy ?? 'public') : 'public';
    const title = create.success ? (create.data.title ?? DEFAULT_ROOM_TITLE) : DEFAULT_ROOM_TITLE;
    this.state.title = title;
    this.state.privacy = privacy;
    await this.setMetadata({ title });
    if (privacy === 'private') {
      this.inviteCode = newInviteCode();
      // Fora da listagem e do joinOrCreate: só entra quem tem o id da sala (e o convite).
      await this.setPrivate(true);
    }

    this.setSimulationInterval((deltaMs) => {
      this.simulate(deltaMs / 1000);
    }, STATE_PATCH_INTERVAL_MS);
    this.clock.setInterval(() => {
      this.expireTickets(Date.now());
    }, LEASE_CHECK_MS);
  }

  /** O retorno vira `client.auth` (e é mantido na reconexão, que não passa por aqui). */
  override async onAuth(_client: Client, options: unknown): Promise<Identity> {
    const parsed = LoungeJoinOptions.safeParse(options);
    if (!parsed.success) {
      const sameProtocol =
        typeof options === 'object' &&
        options !== null &&
        'protocol' in options &&
        options.protocol === PROTOCOL_VERSION;
      throw new ServerError(
        400,
        sameProtocol
          ? 'Pedido de entrada inválido.'
          : 'Versão do cliente incompatível com o servidor. Recarregue a página.',
      );
    }

    const identity = await this.verifyTicket(parsed.data.ticket);
    if (!identity) throw new ServerError(401, 'Sessão expirada ou inválida. Entre novamente.');
    if (this.state.privacy === 'private') this.admitToPrivateRoom(identity, parsed.data.invite);
    return identity;
  }

  override onJoin(client: Client): void {
    const identity = client.auth as Identity;
    this.dropStaleSessionsOf(identity.userId);
    const occupied = [...this.members.values()].map((member) => member.movement.position);
    const movement = pickSpawn(occupied);
    this.members.set(client.sessionId, { identity, movement, direction: STOPPED, action: '' });
    this.state.players.set(
      client.sessionId,
      new PlayerState({
        userId: identity.userId,
        name: identity.name,
        avatar: JSON.stringify(identity.avatar),
        x: movement.position.x,
        z: movement.position.z,
        heading: movement.heading,
      }),
    );
    if (this.isOwner(identity)) this.sendInvite(client);
    this.enterDirectMessages(identity.userId);
    this.logPresence('joined', client);
  }

  override onDrop(client: Client): void {
    const member = this.members.get(client.sessionId);
    if (member) member.direction = STOPPED;
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.logPresence('dropped', client);

    // Sem reconexão no prazo, o Colyseus chama onLeave e o avatar sai da sala.
    const pending = this.allowReconnection(client, this.reconnectSeconds);
    this.pendingReconnections.set(client.sessionId, pending);
    const settle = () => this.pendingReconnections.delete(client.sessionId);
    void pending.then(settle, settle);
  }

  override onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    const member = this.members.get(client.sessionId);
    if (member && this.isOwner(member.identity)) this.sendInvite(client);
    this.logPresence('reconnected', client);
  }

  override onLeave(client: Client): void {
    const member = this.members.get(client.sessionId);
    this.members.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (member) {
      this.chatLimit.forget(member.identity.userId);
      this.dmLimit.forget(member.identity.userId);
      this.leaveDirectMessages(member.identity.userId);
    }
    this.logPresence('left', client);
  }

  override onDispose(): void {
    for (const [userId, deliver] of this.dmSubscriptions) {
      this.presence.unsubscribe(dmTopic(userId), deliver);
    }
    this.dmSubscriptions.clear();
  }

  /** Conta a sessão como online e assina o canal do usuário (uma vez por sala). */
  private enterDirectMessages(userId: string): void {
    void this.presence.hincrby(ONLINE_KEY, userId, 1);
    if (this.dmSubscriptions.has(userId)) return;
    const deliver = (event: DirectMessageEvent) => {
      this.deliverDirectMessage(userId, event);
    };
    this.dmSubscriptions.set(userId, deliver);
    void this.presence.subscribe(dmTopic(userId), deliver);
  }

  /** Desconta a sessão; sem outra sessão do usuário nesta sala, cancela a assinatura. */
  private leaveDirectMessages(userId: string): void {
    void this.presence.hincrby(ONLINE_KEY, userId, -1);
    const stillHere = [...this.members.values()].some((other) => other.identity.userId === userId);
    const deliver = this.dmSubscriptions.get(userId);
    if (stillHere || !deliver) return;
    this.dmSubscriptions.delete(userId);
    this.presence.unsubscribe(dmTopic(userId), deliver);
  }

  /** Entrega às sessões de `userId` nesta sala (destinatário, ou eco para quem enviou). */
  private deliverDirectMessage(userId: string, event: DirectMessageEvent): void {
    for (const client of this.clients) {
      const member = this.members.get(client.sessionId);
      if (!member || member.identity.userId !== userId) continue;
      // No destinatário vale o bloqueio do ticket dele (renovado na hora em que bloqueia). A amizade
      // é conferida só no envio: logo depois de aceitar, o ticket do outro lado ainda não a tem, e
      // a mensagem sumiria sem aviso.
      if (event.from.id !== userId && member.identity.blocked.has(event.from.id)) continue;
      client.send(DM_EVENT, event);
    }
  }

  /**
   * Mensagem privada para um amigo, em qualquer sala. O conteúdo não é guardado (como no chat
   * público): vai para as sessões do destinatário e volta para as de quem enviou.
   */
  private async directMessage(client: Client, { to, text }: { to: string; text: string }) {
    const sender = this.members.get(client.sessionId);
    if (!sender) return;
    const reject = (reason: string, until?: number) => {
      const event: DirectMessageRejectedEvent = { to, reason, ...(until ? { until } : {}) };
      client.send(DM_REJECTED_EVENT, event);
    };

    const { userId, name, friends, blocked, mutedUntil } = sender.identity;
    if (mutedUntil !== null && Date.now() < mutedUntil) {
      reject('Você foi silenciado pela moderação.', mutedUntil);
      return;
    }
    if (to === userId || !friends.has(to) || blocked.has(to)) {
      reject('Mensagens privadas só entre amigos.');
      return;
    }
    if (!this.dmLimit.allow(userId, Date.now())) {
      reject('Muitas mensagens seguidas. Aguarde alguns segundos.');
      return;
    }
    if (Number((await this.presence.hget(ONLINE_KEY, to)) ?? 0) <= 0) {
      reject('Seu amigo não está online.');
      return;
    }

    const event: DirectMessageEvent = {
      id: randomUUID(),
      from: { id: userId, name },
      to,
      text,
      sentAt: Date.now(),
    };
    this.presence.publish(dmTopic(to), event);
    this.presence.publish(dmTopic(userId), event);
  }

  /**
   * Sala privada: o primeiro a entrar é quem a criou (só ele conhece o id nesse momento) e vira o
   * dono. Os demais precisam do convite atual. Bloqueio entre dono e visitante impede a entrada.
   */
  private admitToPrivateRoom(identity: Identity, invite: string | undefined): void {
    if (!this.owner) {
      this.owner = identity;
      this.state.ownerId = identity.userId;
      return;
    }
    if (this.isOwner(identity)) return;
    if (!invite || !sameSecret(invite, this.inviteCode)) {
      throw new ServerError(403, 'Convite inválido ou expirado.');
    }
    if (blockedBetween(this.owner, identity)) {
      throw new ServerError(403, 'Você não pode entrar nesta sala.');
    }
  }

  private isOwner(identity: Identity): boolean {
    return this.state.privacy === 'private' && identity.userId === this.state.ownerId;
  }

  private sendInvite(client: Client): void {
    const event: InviteEvent = { code: this.inviteCode };
    client.send(INVITE_EVENT, event);
  }

  /** Só o dono troca o convite; os links com o código antigo deixam de funcionar. */
  private rotateInvite(client: Client): void {
    const member = this.members.get(client.sessionId);
    if (!member || !this.isOwner(member.identity)) return;
    this.inviteCode = newInviteCode();
    for (const recipient of this.clients) {
      const other = this.members.get(recipient.sessionId);
      if (other && this.isOwner(other.identity)) this.sendInvite(recipient);
    }
  }

  private act(sessionId: string, type: ActionMessage['type']): void {
    const member = this.members.get(sessionId);
    if (!member) return;

    if (type === 'stand') {
      this.endAction(sessionId, member);
      return;
    }
    if (type === 'sit') {
      if (member.action === 'sit') return;
      const occupied = new Set(
        [...this.members.values()].flatMap((other) =>
          other.seat === undefined ? [] : [other.seat],
        ),
      );
      const seatIndex = nearestFreeSeat(member.movement.position, occupied);
      const seat = seatIndex === undefined ? undefined : SEATS[seatIndex];
      if (!seat) return; // Longe de assento livre: o cliente já avisa antes de pedir.
      member.seat = seatIndex;
      member.movement = { position: { ...seat.position }, heading: seat.heading };
      this.setAction(sessionId, member, 'sit');
      return;
    }
    // Gestos: não valem sentado (a pose de sentar prevalece).
    if (member.action === 'sit') return;
    member.actionUntil = type === 'wave' ? Date.now() + WAVE_DURATION_MS : undefined;
    this.setAction(sessionId, member, type);
  }

  private setAction(sessionId: string, member: Member, action: PlayerAction): void {
    member.action = action;
    member.direction = STOPPED;
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.action = action;
    player.x = member.movement.position.x;
    player.z = member.movement.position.z;
    player.heading = member.movement.heading;
  }

  /** Encerra a ação; quem estava sentado levanta para a frente do assento. */
  private endAction(sessionId: string, member: Member): void {
    if (member.action === 'sit') {
      const { position, heading } = member.movement;
      member.movement = {
        position: {
          x: position.x + Math.sin(heading) * STAND_UP_DISTANCE,
          z: position.z + Math.cos(heading) * STAND_UP_DISTANCE,
        },
        heading,
      };
    }
    member.seat = undefined;
    member.actionUntil = undefined;
    this.setAction(sessionId, member, '');
  }

  /**
   * A mesma conta entrou de novo (ex.: recarregou a página): a sessão antiga que caiu e espera
   * reconexão nunca vai voltar. Cancela a reserva para o avatar fantasma sair agora.
   */
  private dropStaleSessionsOf(userId: string): void {
    for (const [sessionId, member] of this.members) {
      const pending = this.pendingReconnections.get(sessionId);
      // `Deferred.reject` é tipado como `Function` no Colyseus; rejeitar faz o Colyseus chamar onLeave.
      if (member.identity.userId === userId && pending) {
        Reflect.apply(pending.reject, pending, [false]);
      }
    }
  }

  /**
   * Quem não renova o ticket sai da sala: a API para de emitir tickets para conta suspensa ou sem
   * sessão, e é assim que a suspensão alcança quem já estava conectado. Sai com CONSENTED: outro
   * código faria o Colyseus reservar a vaga para reconexão, que não passa pelo ticket.
   */
  private expireTickets(now: number): void {
    for (const client of this.clients) {
      const member = this.members.get(client.sessionId);
      if (!member || now < member.identity.expiresAt + this.ticketGraceMs) continue;
      logEvent('realtime', 'ticket.expired', { roomId: this.roomId, sessionId: client.sessionId });
      client.leave(CloseCode.CONSENTED, 'Sessão expirada.');
    }
  }

  private chat(client: Client, text: string): void {
    const sender = this.members.get(client.sessionId);
    if (!sender) return;

    const { mutedUntil } = sender.identity;
    if (mutedUntil !== null && Date.now() < mutedUntil) {
      const rejected: ChatRejectedEvent = {
        reason: 'Você foi silenciado pela moderação.',
        until: mutedUntil,
      };
      client.send(CHAT_REJECTED_EVENT, rejected);
      return;
    }

    if (!this.chatLimit.allow(sender.identity.userId, Date.now())) {
      const rejected: ChatRejectedEvent = {
        reason: 'Muitas mensagens seguidas. Aguarde alguns segundos.',
      };
      client.send(CHAT_REJECTED_EVENT, rejected);
      return;
    }

    const event: ChatEvent = {
      id: randomUUID(),
      userId: sender.identity.userId,
      name: sender.identity.name,
      text,
      sentAt: Date.now(),
    };
    for (const recipient of this.clients) {
      const member = this.members.get(recipient.sessionId);
      if (!member || blockedBetween(sender.identity, member.identity)) continue;
      recipient.send(CHAT_EVENT, event);
    }
  }

  /**
   * Atualiza bloqueios, nome, avatar, silenciamento e validade a partir de um ticket novo, que
   * precisa ser do mesmo usuário.
   */
  private async refreshTicket(client: Client, ticket: string): Promise<void> {
    const identity = await this.verifyTicket(ticket);
    const member = this.members.get(client.sessionId);
    if (!member) return;
    if (!identity || identity.userId !== member.identity.userId) {
      logEvent('realtime', 'ticket.rejected', { roomId: this.roomId, sessionId: client.sessionId });
      return;
    }
    member.identity = identity;
    if (this.isOwner(identity)) this.owner = identity;
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.name = identity.name;
      player.avatar = JSON.stringify(identity.avatar);
    }
  }

  private simulate(dt: number): void {
    const now = Date.now();
    for (const [sessionId, member] of this.members) {
      if (member.actionUntil !== undefined && now >= member.actionUntil) {
        this.endAction(sessionId, member);
      }
      if (member.action === 'sit') continue;

      const next = stepMovement(member.movement, member.direction, dt, OBSTACLES);
      if (next === member.movement) continue;

      member.movement = next;
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      player.x = next.position.x;
      player.z = next.position.z;
      player.heading = next.heading;
    }
  }

  private logPresence(event: string, client: Client): void {
    logEvent('realtime', `presence.${event}`, {
      roomId: this.roomId,
      privacy: this.state.privacy,
      sessionId: client.sessionId,
      players: this.state.players.size,
    });
  }
}
