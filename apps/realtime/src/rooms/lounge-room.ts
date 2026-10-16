import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ACTION_MESSAGE,
  ActionMessage,
  CHAT_EVENT,
  CHAT_MESSAGE,
  CHAT_REJECTED_EVENT,
  CHANGE_PASSWORD_MESSAGE,
  ChangePasswordMessage,
  ChatMessage,
  conversationKey,
  DM_EVENT,
  DM_MESSAGE,
  DM_REJECTED_EVENT,
  DirectMessage,
  HIDDEN_PLAYERS,
  INVITE_MESSAGE,
  INVITE_REJECTED_EVENT,
  INVITED_EVENT,
  InviteMessage,
  INTERACTION_REQUEST_MESSAGE,
  INTERACTION_RESPONSE_MESSAGE,
  INTERACTION_REQUESTED_EVENT,
  INTERACTION_RESPONDED_EVENT,
  INTERACTION_STARTED_EVENT,
  INTERACTION_ENDED_EVENT,
  INTERACTION_MAX_DURATION_MS,
  InteractionRequest,
  InteractionResponse,
  type InteractionType,
  LoungeJoinOptions,
  LoungeState,
  MOVE_MESSAGE,
  MoveMessage,
  PROTOCOL_VERSION,
  PlayerState,
  REFRESH_TICKET_MESSAGE,
  ROOM_PRIVACIES,
  RefreshTicketMessage,
  RoomPassword,
  RoomTitle,
  STATE_PATCH_INTERVAL_MS,
  USER_NOTIFY,
  WAVE_DURATION_MS,
  type ChatEvent,
  type ChatRejectedEvent,
  type DirectMessageEvent,
  type DirectMessageRejectedEvent,
  type HiddenPlayersEvent,
  type InteractionEndedEvent,
  type InteractionStartedEvent,
  type InviteRejectedEvent,
  type InvitedEvent,
  type PlayerAction,
  type UserNotifyEvent,
  type UserNotifyKind,
} from '@3dx/contracts';
import {
  LOUNGE,
  SCENE_NAMES,
  sceneByName,
  obstaclesOf,
  pickSpawnScene,
  nearestFreeSeatScene,
  stepMovement,
  type MovementState,
  type Vec2,
  type RoomLayout,
} from '@3dx/game-core';
import { logEvent } from '@3dx/observability';
import { CloseCode, Room, ServerError, validate, type Client, type Deferred } from '@colyseus/core';
import { z } from 'zod';
import { createTicketVerifier, type Identity, type TicketVerifier } from '../auth/ticket.ts';
import { ChatRateLimit } from './chat-rate-limit.ts';
import { noopMessageLog, type MessageLog } from './message-log.ts';

/** Meta inicial de teste (spec: 8–16), não capacidade garantida. Lotada, o matchmaker abre outra sala. */
export const MAX_PLAYERS = 16;

/** O cliente envia no máximo uma direção por intervalo de patch (20/s); acima disso é abuso. */
const MAX_MESSAGES_PER_SECOND = 30;

/** Chat: até 5 mensagens a cada 10 s por usuário. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;

export const DEFAULT_ROOM_TITLE = 'Lounge';

/** Cenário padrão quando o cliente não especifica. */
export const DEFAULT_ROOM_SCENE = 'lounge';

/**
 * Mensagens privadas atravessam salas pela presença do Colyseus: cada sala assina o canal de quem
 * está nela, e a contagem de sessões por usuário diz se o destinatário está online. Em memória,
 * vale para um processo; com várias instâncias, a presença precisa ser compartilhada (Redis).
 */
const ONLINE_KEY = 'dm:online';
const dmTopic = (userId: string) => `dm:${userId}`;

/** Convite para sala privada: entrega imediata pelo mesmo canal de presença das mensagens privadas. */
const inviteTopic = (userId: string) => `invite:${userId}`;

/**
 * Aviso de dado do usuário alterado fora da sala (amizades/bloqueios na API, fila da moderação).
 * Mesmo canal de presença: a API publica, as salas que têm o usuário assinam e entregam.
 */
const notifyTopic = (userId: string) => `notify:${userId}`;

/** Convites: até 10 a cada 30 s por usuário (evita assédio de convite em massa). */
export const INVITE_BURST = 10;
export const INVITE_WINDOW_MS = 30_000;

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
  /** Onde registrar as conversas (chat e MP) para a administração. Sem ele, nada é guardado. */
  messageLog?: MessageLog;
  /** Cenário/tema da sala (padrão: 'lounge'). */
  scene?: string;
}

/** Ler um campo das opções de criação sem que um valor inválido derrube os outros. */
const pickOption = <T>(schema: z.ZodType<T>, fallback: T, value: unknown): T => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

/** Compara dois segredos (senha de sala) em tempo constante. */
const sameSecret = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

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

/**
 * Sala do lounge com estado autoritativo. Só entra quem apresenta um ticket assinado pela API;
 * nome e id vêm do ticket. Sala privada exige a senha (ou convite do dono). O cliente envia só
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
  private messageLog: MessageLog = noopMessageLog;
  private readonly members = new Map<string, Member>();
  private readonly chatLimit = new ChatRateLimit(CHAT_BURST, CHAT_WINDOW_MS);
  private readonly dmLimit = new ChatRateLimit(CHAT_BURST, CHAT_WINDOW_MS);
  private readonly inviteLimit = new ChatRateLimit(INVITE_BURST, INVITE_WINDOW_MS);
  /** Assinatura do canal de mensagens privadas de cada usuário presente nesta sala. */
  private readonly dmSubscriptions = new Map<string, (event: DirectMessageEvent) => void>();
  /** Assinatura do canal de convites de cada usuário presente nesta sala. */
  private readonly inviteSubscriptions = new Map<string, (event: InvitedEvent) => void>();
  /** Assinatura do canal de avisos de cada usuário presente nesta sala. */
  private readonly notifySubscriptions = new Map<string, (event: UserNotifyEvent) => void>();
  /** Vagas reservadas para quem caiu, por sessionId (canceláveis). */
  private readonly pendingReconnections = new Map<string, Deferred<Client>>();
  /** Senha da sala privada; nunca vai para o estado público. '' = só entra convidado. */
  private password = '';
  /** Ids convidados pelo dono: cada convite vale UMA entrada (some ao ser usado). */
  private readonly invited = new Set<string>();
  /** Identidade do dono (bloqueios dele valem para quem tenta entrar). */
  private owner?: Identity;
  /** Cenário/tema da sala: define obstáculos, assentos e pontos de spawn. */
  private scene: RoomLayout = LOUNGE;
  /** Solicitações de interação pendentes: remetente -> { to, type, expiresAt }. */
  private readonly pendingInteractions = new Map<
    string,
    { to: string; type: InteractionType; expiresAt: number }
  >();
  /** Interações ativas: userId -> { with, type }. Ambas as partes têm a mesma entrada. */
  private readonly activeInteractions = new Map<string, { with: string; type: InteractionType }>();

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
    [INVITE_MESSAGE]: validate(InviteMessage, (client: Client, message: InviteMessage) => {
      void this.inviteFriend(client, message.to);
    }),
    [CHANGE_PASSWORD_MESSAGE]: validate(
      ChangePasswordMessage,
      (client: Client, message: ChangePasswordMessage) => {
        this.changePassword(client, message.password);
      },
    ),
    [INTERACTION_REQUEST_MESSAGE]: validate(
      InteractionRequest,
      (client: Client, message: InteractionRequest) => {
        void this.requestInteraction(client.sessionId, message);
      },
    ),
    [INTERACTION_RESPONSE_MESSAGE]: validate(
      InteractionResponse,
      (client: Client, message: InteractionResponse) => {
        void this.respondInteraction(client.sessionId, message);
      },
    ),
  };

  override async onCreate(options: LoungeRoomOptions): Promise<void> {
    this.reconnectSeconds = options.reconnectSeconds;
    this.ticketGraceMs = options.ticketGraceSeconds * 1000;
    this.verifyTicket = createTicketVerifier(options.ticketPublicKey);
    // Options vêm do servidor (o cliente não as envia: onAuth recusa campos desconhecidos). Guarda
    // só se for um `MessageLog` de verdade, para um valor inesperado não quebrar o chat.
    this.messageLog =
      typeof options.messageLog?.record === 'function' ? options.messageLog : noopMessageLog;

    // O Colyseus junta aqui as opções do cliente (privacy, title, password) com as do servidor.
    // Cada campo é lido por conta própria: um valor inválido não derruba os outros.
    const raw = (typeof options === 'object' && options !== null ? options : {}) as Record<
      string,
      unknown
    >;
    const privacy = pickOption(z.enum(ROOM_PRIVACIES), 'public', raw.privacy);
    const title = pickOption(RoomTitle, DEFAULT_ROOM_TITLE, raw.title);
    const sceneName = pickOption(z.enum(SCENE_NAMES), DEFAULT_ROOM_SCENE, raw.scene);
    this.state.title = title;
    this.state.privacy = privacy;
    this.state.scene = sceneName;
    this.scene = sceneByName(sceneName) ?? LOUNGE;
    await this.setMetadata({ title, privacy, scene: sceneName });
    if (privacy === 'private') {
      // Sem senha válida, a sala vira só-convidados (o dono define uma depois).
      this.password = pickOption(RoomPassword, '', raw.password);
      // Fora do joinOrCreate (ninguém cai nela por acaso), mas ainda aparece na lista, com senha.
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
    if (this.state.privacy === 'private') this.admitToPrivateRoom(identity, parsed.data.password);
    return identity;
  }

  override onJoin(client: Client): void {
    const identity = client.auth as Identity;
    this.dropStaleSessionsOf(identity.userId);
    const occupied = [...this.members.values()].map((member) => member.movement.position);
    const movement = pickSpawnScene(this.scene, occupied);
    this.members.set(client.sessionId, { identity, movement, direction: STOPPED, action: '' });
    this.state.players.set(
      client.sessionId,
      new PlayerState({
        userId: identity.userId,
        name: identity.name,
        role: identity.role,
        avatar: JSON.stringify(identity.avatar),
        x: movement.position.x,
        z: movement.position.z,
        heading: movement.heading,
      }),
    );
    this.enterDirectMessages(identity.userId);
    this.enterInvites(identity.userId);
    this.enterNotifications(identity.userId);
    this.broadcastHiddenPlayers();
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
    this.logPresence('reconnected', client);
  }

  override onLeave(client: Client): void {
    const member = this.members.get(client.sessionId);
    this.members.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (member) {
      this.chatLimit.forget(member.identity.userId);
      this.dmLimit.forget(member.identity.userId);
      this.inviteLimit.forget(member.identity.userId);
      this.leaveDirectMessages(member.identity.userId);
      this.leaveInvites(member.identity.userId);
      this.leaveNotifications(member.identity.userId);
      // Encerra qualquer interação consentida ativa deste jogador.
      this.endInteraction(member.identity.userId, true);
      // Também remove solicitações pendentes enviadas por este jogador.
      this.pendingInteractions.delete(client.sessionId);
    }
    this.broadcastHiddenPlayers();
    this.logPresence('left', client);
  }

  override onDispose(): void {
    for (const [userId, deliver] of this.dmSubscriptions) {
      this.presence.unsubscribe(dmTopic(userId), deliver);
    }
    this.dmSubscriptions.clear();
    for (const [userId, deliver] of this.inviteSubscriptions) {
      this.presence.unsubscribe(inviteTopic(userId), deliver);
    }
    this.inviteSubscriptions.clear();
    for (const [userId, deliver] of this.notifySubscriptions) {
      this.presence.unsubscribe(notifyTopic(userId), deliver);
    }
    this.notifySubscriptions.clear();
  }

  /**
   * Diz a cada cliente quem ele não deve ver: qualquer par mutuamente bloqueado (o bloqueio vale
   * nos dois sentidos). O cliente esconde o avatar; o servidor continua mandando o estado a todos.
   * Reenvia quando entra/sai alguém e quando um ticket novo muda os bloqueios.
   */
  private broadcastHiddenPlayers(): void {
    for (const client of this.clients) {
      const member = this.members.get(client.sessionId);
      if (!member) continue;
      const hidden = new Set<string>();
      for (const other of this.members.values()) {
        if (other !== member && blockedBetween(member.identity, other.identity)) {
          hidden.add(other.identity.userId);
        }
      }
      const event: HiddenPlayersEvent = { hidden: [...hidden] };
      client.send(HIDDEN_PLAYERS, event);
    }
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

  /** Assina o canal de convites do usuário nesta sala (uma vez por sala). */
  private enterInvites(userId: string): void {
    if (this.inviteSubscriptions.has(userId)) return;
    const deliver = (event: InvitedEvent) => {
      this.deliverInvite(userId, event);
    };
    this.inviteSubscriptions.set(userId, deliver);
    void this.presence.subscribe(inviteTopic(userId), deliver);
  }

  /** Sem outra sessão do usuário nesta sala, cancela a assinatura do canal de convites. */
  private leaveInvites(userId: string): void {
    const stillHere = [...this.members.values()].some((other) => other.identity.userId === userId);
    const deliver = this.inviteSubscriptions.get(userId);
    if (stillHere || !deliver) return;
    this.inviteSubscriptions.delete(userId);
    this.presence.unsubscribe(inviteTopic(userId), deliver);
  }

  /** Assina o canal de avisos do usuário nesta sala (uma vez por sala). */
  private enterNotifications(userId: string): void {
    if (this.notifySubscriptions.has(userId)) return;
    const deliver = (event: UserNotifyEvent) => {
      this.deliverNotify(userId, event);
    };
    this.notifySubscriptions.set(userId, deliver);
    void this.presence.subscribe(notifyTopic(userId), deliver);
  }

  /** Sem outra sessão do usuário nesta sala, cancela a assinatura do canal de avisos. */
  private leaveNotifications(userId: string): void {
    const stillHere = [...this.members.values()].some((other) => other.identity.userId === userId);
    const deliver = this.notifySubscriptions.get(userId);
    if (stillHere || !deliver) return;
    this.notifySubscriptions.delete(userId);
    this.presence.unsubscribe(notifyTopic(userId), deliver);
  }

  /**
   * Avisa as sessões de cada usuário (em qualquer sala) que os dados dele mudaram. Chamado pela API
   * e pelas ações internas da sala; o canal de presença leva o aviso a quem estiver em outra sala.
   */
  notifyUsers(users: string[], kind: UserNotifyKind): void {
    const event: UserNotifyEvent = { kind };
    for (const userId of new Set(users)) this.presence.publish(notifyTopic(userId), event);
  }

  /** Entrega o aviso às sessões de `userId` nesta sala. */
  private deliverNotify(userId: string, event: UserNotifyEvent): void {
    for (const client of this.clients) {
      const member = this.members.get(client.sessionId);
      if (member && member.identity.userId === userId) client.send(USER_NOTIFY, event);
    }
  }

  /** Entrega o convite às sessões de `userId` nesta sala, se ele não estiver já na sala convidada. */
  private deliverInvite(userId: string, event: InvitedEvent): void {
    if (event.roomId === this.roomId) return;
    for (const client of this.clients) {
      const member = this.members.get(client.sessionId);
      if (member && member.identity.userId === userId) client.send(INVITED_EVENT, event);
    }
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

    const { userId, name, role, friends, blocked, mutedUntil } = sender.identity;
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
      from: { id: userId, name, role },
      to,
      text,
      sentAt: Date.now(),
    };
    this.messageLog.record({
      id: event.id,
      kind: 'DIRECT',
      senderId: userId,
      recipientId: to,
      conversationKey: conversationKey(userId, to),
      text: event.text,
      sentAt: event.sentAt,
    });
    this.presence.publish(dmTopic(to), event);
    this.presence.publish(dmTopic(userId), event);
  }

  /**
   * Sala privada: o primeiro a entrar é quem a criou (só ele conhece o id nesse momento) e vira o
   * dono. Os demais entram com a senha ou por um convite do dono. Bloqueio entre dono e visitante
   * impede a entrada. O convite é de entrada única: vale uma vez e some (usar de novo pede senha).
   */
  private admitToPrivateRoom(identity: Identity, password: string | undefined): void {
    if (!this.owner) {
      this.owner = identity;
      this.state.ownerId = identity.userId;
      return;
    }
    if (this.isOwner(identity)) return;
    if (blockedBetween(this.owner, identity)) {
      throw new ServerError(403, 'Você não pode entrar nesta sala.');
    }
    if (this.invited.delete(identity.userId)) return;
    if (!password || !sameSecret(password, this.password)) {
      throw new ServerError(403, 'Senha incorreta.');
    }
  }

  private isOwner(identity: Identity): boolean {
    return this.state.privacy === 'private' && identity.userId === this.state.ownerId;
  }

  /** Só o dono troca a senha; quem já foi convidado continua entrando sem ela. */
  private changePassword(client: Client, password: string): void {
    const member = this.members.get(client.sessionId);
    if (!member || !this.isOwner(member.identity)) return;
    this.password = password;
    // Senha nova invalida convites pendentes: sem isso, quem foi convidado antes furaria a senha.
    this.invited.clear();
  }

  /**
   * Convite para a sala privada: só o dono, só para um amigo online, e com limite de frequência.
   * Entregue na hora pelo canal de presença do convidado; só o direito de uma entrada fica guardado.
   */
  private async inviteFriend(client: Client, to: string): Promise<void> {
    const sender = this.members.get(client.sessionId);
    if (!sender) return;
    const reject = (reason: string) => {
      const event: InviteRejectedEvent = { to, reason };
      client.send(INVITE_REJECTED_EVENT, event);
    };
    if (!this.isOwner(sender.identity)) {
      reject('Só o dono da sala pode convidar.');
      return;
    }
    if (to === sender.identity.userId || !sender.identity.friends.has(to)) {
      reject('Você só pode convidar amigos.');
      return;
    }
    if (!this.inviteLimit.allow(sender.identity.userId, Date.now())) {
      reject('Muitos convites seguidos. Aguarde alguns segundos.');
      return;
    }
    if (Number((await this.presence.hget(ONLINE_KEY, to)) ?? 0) <= 0) {
      reject('Seu amigo não está online.');
      return;
    }
    this.invited.add(to);
    const event: InvitedEvent = {
      roomId: this.roomId,
      title: this.state.title,
      from: sender.identity.name,
    };
    this.presence.publish(inviteTopic(to), event);
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
      const seatIndex = nearestFreeSeatScene(this.scene, member.movement.position, occupied);
      const seat = seatIndex === undefined ? undefined : this.scene.seats[seatIndex];
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

  /**
   * Solicita uma interação consentida com outro jogador da sala.
   * Bloqueados não conseguem iniciar interações. Só uma solicitação pendente por remetente.
   */
  private requestInteraction(sessionId: string, input: InteractionRequest): void {
    const sender = this.members.get(sessionId);
    if (!sender) return;

    const clientReject = (sid: string) => {
      const client = this.clients.find((c) => c.sessionId === sid);
      if (client) {
        client.send(INTERACTION_RESPONDED_EVENT, {
          to: { id: input.to, name: '' },
          accept: false,
          type: input.type,
        });
      }
    };

    // Não pode solicitar para si mesmo.
    if (input.to === sender.identity.userId) {
      clientReject(sessionId, 'Não é possível solicitar interação para si mesmo.');
      return;
    }

    // Não pode solicitar se já tem uma pendente ou ativa.
    if (this.pendingInteractions.has(sessionId)) {
      clientReject(sessionId);
      return;
    }
    if (this.activeInteractions.has(sender.identity.userId)) {
      clientReject(sessionId);
      return;
    }

    // O destinatário deve estar na sala e não estar bloqueado.
    const recipient = [...this.members.values()].find((m) => m.identity.userId === input.to);
    if (!recipient) {
      clientReject(sessionId);
      return;
    }
    if (
      sender.identity.blocked.has(input.to) ||
      recipient.identity.blocked.has(sender.identity.userId)
    ) {
      clientReject(sessionId);
      return;
    }
    if (this.activeInteractions.has(input.to)) {
      clientReject(sessionId);
      return;
    }

    // Registra a solicitação pendente (expira em 30 s).
    const expiresAt = Date.now() + 30_000;
    this.pendingInteractions.set(sessionId, { to: input.to, type: input.type, expiresAt });

    // Avisa o destinatário.
    const recipientClient = this.clients.find(
      (c) => this.members.get(c.sessionId)?.identity.userId === input.to,
    );
    if (recipientClient) {
      recipientClient.send(INTERACTION_REQUESTED_EVENT, {
        from: { id: sender.identity.userId, name: sender.identity.name },
        type: input.type,
      });
    }

    // Limpa a solicitação expirada.
    setTimeout(() => {
      if (this.pendingInteractions.get(sessionId)?.expiresAt === expiresAt) {
        this.pendingInteractions.delete(sessionId);
      }
    }, 30_000);
  }

  /**
   * Responde a uma solicitação de interação (aceitar ou recusar).
   */
  private respondInteraction(sessionId: string, input: InteractionResponse): void {
    const responder = this.members.get(sessionId);
    if (!responder) return;

    // Encontra a solicitação pendente direcionada a este responder.
    let requesterSessionId: string | undefined;
    let requestType: InteractionType | undefined;
    for (const [sid, req] of this.pendingInteractions) {
      if (req.to === responder.identity.userId) {
        requesterSessionId = sid;
        requestType = req.type;
        break;
      }
    }
    if (!requesterSessionId || !requestType) {
      return; // Nenhuma solicitação pendente para este usuário.
    }

    const requester = this.members.get(requesterSessionId);
    if (!requester) {
      this.pendingInteractions.delete(requesterSessionId);
      return;
    }

    this.pendingInteractions.delete(requesterSessionId);

    if (!input.accept) {
      // Recusada: avisa apenas o solicitante.
      const requesterClient = this.clients.find((c) => c.sessionId === requesterSessionId);
      if (requesterClient) {
        requesterClient.send(INTERACTION_RESPONDED_EVENT, {
          to: { id: responder.identity.userId, name: responder.identity.name },
          accept: false,
          type: requestType,
        });
      }
      return;
    }

    // Aceita: inicia a interação para ambos.
    this.activeInteractions.set(responder.identity.userId, {
      with: requester.identity.userId,
      type: requestType,
    });
    this.activeInteractions.set(requester.identity.userId, {
      with: responder.identity.userId,
      type: requestType,
    });

    // Avisa ambos que a interação começou.
    const startedEvent: InteractionStartedEvent = {
      with: { id: requester.identity.userId, name: requester.identity.name },
      type: requestType,
    };
    const requesterClient = this.clients.find((c) => c.sessionId === requesterSessionId);
    const responderClient = this.clients.find(
      (c) => this.members.get(c.sessionId)?.identity.userId === responder.identity.userId,
    );
    if (requesterClient) {
      requesterClient.send(INTERACTION_STARTED_EVENT, {
        ...startedEvent,
        with: { id: responder.identity.userId, name: responder.identity.name },
      });
    }
    if (responderClient) {
      responderClient.send(INTERACTION_STARTED_EVENT, startedEvent);
    }

    // Avisa o solicitante que a resposta foi aceita.
    if (requesterClient) {
      requesterClient.send(INTERACTION_RESPONDED_EVENT, {
        to: { id: responder.identity.userId, name: responder.identity.name },
        accept: true,
        type: requestType,
      });
    }

    // Termina automaticamente após a duração máxima.
    setTimeout(() => {
      this.endInteraction(responder.identity.userId, true);
    }, INTERACTION_MAX_DURATION_MS);
  }

  /**
   * Encerra uma interação consentida ativa. Se `broadcast` for verdadeiro, avisa ambos os
   * participantes.
   */
  private endInteraction(userId: string, broadcast: boolean): void {
    const interaction = this.activeInteractions.get(userId);
    if (!interaction) return;

    this.activeInteractions.delete(userId);
    this.activeInteractions.delete(interaction.with);

    if (broadcast) {
      const endedEvent: InteractionEndedEvent = {
        with: { id: interaction.with, name: '' },
        type: interaction.type,
      };
      // Preenche os nomes pelas identidades.
      const withMember = [...this.members.values()].find(
        (m) => m.identity.userId === interaction.with,
      );
      const userMember = [...this.members.values()].find((m) => m.identity.userId === userId);
      if (withMember) endedEvent.with.name = withMember.identity.name;

      const userClient = this.clients.find(
        (c) => this.members.get(c.sessionId)?.identity.userId === userId,
      );
      const withClient = this.clients.find(
        (c) => this.members.get(c.sessionId)?.identity.userId === interaction.with,
      );
      if (userClient) {
        userClient.send(INTERACTION_ENDED_EVENT, {
          ...endedEvent,
          with: { id: interaction.with, name: endedEvent.with.name },
        });
      }
      if (withClient) {
        withClient.send(INTERACTION_ENDED_EVENT, {
          ...endedEvent,
          with: { id: userId, name: userMember?.identity.name ?? '' },
        });
      }
    }
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
      role: sender.identity.role,
      text,
      sentAt: Date.now(),
    };
    this.messageLog.record({
      id: event.id,
      kind: 'ROOM',
      roomId: this.roomId,
      roomTitle: this.state.title,
      senderId: event.userId,
      text: event.text,
      sentAt: event.sentAt,
    });
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
      player.role = identity.role;
      player.avatar = JSON.stringify(identity.avatar);
    }
    // Bloqueios podem ter mudado (este é o caminho do "bloquear agora"): reavalia quem se esconde.
    this.broadcastHiddenPlayers();
  }

  private simulate(dt: number): void {
    const now = Date.now();
    for (const [sessionId, member] of this.members) {
      if (member.actionUntil !== undefined && now >= member.actionUntil) {
        this.endAction(sessionId, member);
      }
      if (member.action === 'sit') continue;

      const next = stepMovement(member.movement, member.direction, dt, obstaclesOf(this.scene));
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
