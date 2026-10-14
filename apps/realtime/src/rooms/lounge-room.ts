import {
  LoungeJoinOptions,
  LoungeState,
  MOVE_MESSAGE,
  MoveMessage,
  PlayerState,
  STATE_PATCH_INTERVAL_MS,
} from '@3dx/contracts';
import { OBSTACLES, pickSpawn, stepMovement, type MovementState, type Vec2 } from '@3dx/game-core';
import { Room, ServerError, validate, type Client } from '@colyseus/core';

/** Meta inicial de teste (spec: 8–16), não capacidade garantida. Lotada, o matchmaking abre outra sala. */
export const MAX_PLAYERS = 16;

/** O cliente envia no máximo uma direção por intervalo de patch (20/s); acima disso é abuso. */
const MAX_MESSAGES_PER_SECOND = 30;

export interface LoungeRoomOptions {
  /** Tempo que o lugar de quem caiu fica reservado antes de o avatar sair da sala. */
  reconnectSeconds: number;
}

interface Body {
  movement: MovementState;
  /** Última direção pedida pelo cliente; o servidor decide quanto o avatar anda. */
  direction: Vec2;
}

const STOPPED: Vec2 = { x: 0, z: 0 };

/**
 * Sala do lounge com estado autoritativo: o cliente só envia a direção desejada; posição e
 * rotação são calculadas aqui com a mesma simulação do cliente (`@3dx/game-core`).
 */
export class LoungeRoom extends Room<{ state: LoungeState }> {
  override maxClients = MAX_PLAYERS;
  override patchRate = STATE_PATCH_INTERVAL_MS;
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  override state = new LoungeState();

  private reconnectSeconds = 20;
  private readonly bodies = new Map<string, Body>();

  // Payload inválido ou tipo de mensagem desconhecido derrubam a conexão (comportamento do Colyseus).
  override messages = {
    [MOVE_MESSAGE]: validate(MoveMessage, (client: Client, direction: MoveMessage) => {
      const body = this.bodies.get(client.sessionId);
      if (body) body.direction = direction;
    }),
  };

  override onCreate(options: LoungeRoomOptions): void {
    this.reconnectSeconds = options.reconnectSeconds;
    this.setSimulationInterval((deltaMs) => {
      this.simulate(deltaMs / 1000);
    }, STATE_PATCH_INTERVAL_MS);
  }

  override onAuth(_client: Client, options: unknown): boolean {
    if (!LoungeJoinOptions.safeParse(options).success) {
      throw new ServerError(
        400,
        'Versão do cliente incompatível com o servidor. Recarregue a página.',
      );
    }
    return true;
  }

  override onJoin(client: Client): void {
    const occupied = [...this.bodies.values()].map((body) => body.movement.position);
    const movement = pickSpawn(occupied);
    this.bodies.set(client.sessionId, { movement, direction: STOPPED });
    this.state.players.set(
      client.sessionId,
      new PlayerState({
        name: displayName(client.sessionId),
        x: movement.position.x,
        z: movement.position.z,
        heading: movement.heading,
      }),
    );
    this.logPresence('entrou', client);
  }

  override onDrop(client: Client): void {
    const body = this.bodies.get(client.sessionId);
    if (body) body.direction = STOPPED;
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.logPresence('caiu, aguardando reconexão', client);

    // Sem reconexão no prazo, o Colyseus chama onLeave e o avatar sai da sala.
    void this.allowReconnection(client, this.reconnectSeconds);
  }

  override onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.logPresence('reconectou', client);
  }

  override onLeave(client: Client): void {
    this.bodies.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.logPresence('saiu', client);
  }

  private simulate(dt: number): void {
    for (const [sessionId, body] of this.bodies) {
      const next = stepMovement(body.movement, body.direction, dt, OBSTACLES);
      if (next === body.movement) continue;

      body.movement = next;
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

/** Nome de exibição provisório até existir perfil (Fase 3). Derivado do sessionId, que já é público. */
function displayName(sessionId: string): string {
  return `Visitante ${sessionId.slice(0, 4).toUpperCase()}`;
}
