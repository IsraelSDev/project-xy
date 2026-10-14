import { randomUUID } from 'node:crypto';
import {
  CHAT_EVENT,
  CHAT_MESSAGE,
  CHAT_REJECTED_EVENT,
  ChatMessage,
  LoungeJoinOptions,
  LoungeState,
  MOVE_MESSAGE,
  MoveMessage,
  PROTOCOL_VERSION,
  PlayerState,
  REFRESH_TICKET_MESSAGE,
  RefreshTicketMessage,
  STATE_PATCH_INTERVAL_MS,
  type ChatEvent,
  type ChatRejectedEvent,
} from '@3dx/contracts';
import { OBSTACLES, pickSpawn, stepMovement, type MovementState, type Vec2 } from '@3dx/game-core';
import { Room, ServerError, validate, type Client, type Deferred } from '@colyseus/core';
import { createTicketVerifier, type Identity, type TicketVerifier } from '../auth/ticket.ts';
import { ChatRateLimit } from './chat-rate-limit.ts';

/** Meta inicial de teste (spec: 8–16), não capacidade garantida. Lotada, o matchmaking abre outra sala. */
export const MAX_PLAYERS = 16;

/** O cliente envia no máximo uma direção por intervalo de patch (20/s); acima disso é abuso. */
const MAX_MESSAGES_PER_SECOND = 30;

/** Chat: até 5 mensagens a cada 10 s por usuário. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;

export interface LoungeRoomOptions {
  /** Tempo que o lugar de quem caiu fica reservado antes de o avatar sair da sala. */
  reconnectSeconds: number;
  /** Chave pública Ed25519 (SPKI DER em base64) que confere os tickets emitidos pela API. */
  ticketPublicKey: string;
}

interface Member {
  identity: Identity;
  movement: MovementState;
  /** Última direção pedida pelo cliente; o servidor decide quanto o avatar anda. */
  direction: Vec2;
}

const STOPPED: Vec2 = { x: 0, z: 0 };

/** Bloqueio vale nos dois sentidos: nenhum dos dois recebe as mensagens do outro. */
const blockedBetween = (a: Identity, b: Identity) =>
  a.blocked.has(b.userId) || b.blocked.has(a.userId);

/**
 * Sala do lounge com estado autoritativo. Só entra quem apresenta um ticket assinado pela API;
 * nome e id vêm do ticket. O cliente envia só a direção desejada e mensagens de chat; posição,
 * rotação, limites e filtro de bloqueio são decididos aqui.
 */
export class LoungeRoom extends Room<{ state: LoungeState }> {
  override maxClients = MAX_PLAYERS;
  override patchRate = STATE_PATCH_INTERVAL_MS;
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  override state = new LoungeState();

  private reconnectSeconds = 20;
  private verifyTicket: TicketVerifier = () => Promise.resolve(undefined);
  private readonly members = new Map<string, Member>();
  private readonly chatLimit = new ChatRateLimit(CHAT_BURST, CHAT_WINDOW_MS);
  /** Vagas reservadas para quem caiu, por sessionId (canceláveis). */
  private readonly pendingReconnections = new Map<string, Deferred<Client>>();

  // Payload inválido ou tipo de mensagem desconhecido derrubam a conexão (comportamento do Colyseus).
  override messages = {
    [MOVE_MESSAGE]: validate(MoveMessage, (client: Client, direction: MoveMessage) => {
      const member = this.members.get(client.sessionId);
      if (member) member.direction = direction;
    }),
    [CHAT_MESSAGE]: validate(ChatMessage, (client: Client, message: { text: string }) => {
      this.chat(client, message.text);
    }),
    [REFRESH_TICKET_MESSAGE]: validate(
      RefreshTicketMessage,
      (client: Client, message: RefreshTicketMessage) => {
        void this.refreshTicket(client, message.ticket);
      },
    ),
  };

  override onCreate(options: LoungeRoomOptions): void {
    this.reconnectSeconds = options.reconnectSeconds;
    this.verifyTicket = createTicketVerifier(options.ticketPublicKey);
    this.setSimulationInterval((deltaMs) => {
      this.simulate(deltaMs / 1000);
    }, STATE_PATCH_INTERVAL_MS);
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
    return identity;
  }

  override onJoin(client: Client): void {
    const identity = client.auth as Identity;
    this.dropStaleSessionsOf(identity.userId);
    const occupied = [...this.members.values()].map((member) => member.movement.position);
    const movement = pickSpawn(occupied);
    this.members.set(client.sessionId, { identity, movement, direction: STOPPED });
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
    this.logPresence('entrou', client);
  }

  override onDrop(client: Client): void {
    const member = this.members.get(client.sessionId);
    if (member) member.direction = STOPPED;
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.logPresence('caiu, aguardando reconexão', client);

    // Sem reconexão no prazo, o Colyseus chama onLeave e o avatar sai da sala.
    const pending = this.allowReconnection(client, this.reconnectSeconds);
    this.pendingReconnections.set(client.sessionId, pending);
    const settle = () => this.pendingReconnections.delete(client.sessionId);
    void pending.then(settle, settle);
  }

  override onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.logPresence('reconectou', client);
  }

  override onLeave(client: Client): void {
    const member = this.members.get(client.sessionId);
    if (member) this.chatLimit.forget(member.identity.userId);
    this.members.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.logPresence('saiu', client);
  }

  /**
   * A mesma conta entrou de novo (ex.: recarregou a página): a sessão antiga que caiu e espera
   * reconexão nunca vai voltar. Cancela a reserva para o avatar fantasma sair agora.
   */
  private dropStaleSessionsOf(userId: string): void {
    for (const [sessionId, member] of this.members) {
      const pending = this.pendingReconnections.get(sessionId);
      // `Deferred.reject` é tipado como `Function` no Colyseus; rejeitar faz o Colyseus chamar onLeave.
      if (member.identity.userId === userId && pending)
        Reflect.apply(pending.reject, pending, [false]);
    }
  }

  private chat(client: Client, text: string): void {
    const sender = this.members.get(client.sessionId);
    if (!sender) return;

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
   * Atualiza bloqueios, nome e avatar a partir de um ticket novo, que precisa ser do mesmo usuário.
   */
  private async refreshTicket(client: Client, ticket: string): Promise<void> {
    const identity = await this.verifyTicket(ticket);
    const member = this.members.get(client.sessionId);
    if (!member) return;
    if (!identity || identity.userId !== member.identity.userId) {
      console.warn(`[lounge ${this.roomId}] ${client.sessionId} enviou ticket inválido ou alheio`);
      return;
    }
    member.identity = identity;
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.name = identity.name;
      player.avatar = JSON.stringify(identity.avatar);
    }
  }

  private simulate(dt: number): void {
    for (const [sessionId, member] of this.members) {
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
    console.info(
      `[lounge ${this.roomId}] ${client.sessionId} ${event} (${this.state.players.size}/${MAX_PLAYERS})`,
    );
  }
}
