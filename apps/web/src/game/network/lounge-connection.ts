import {
  LOUNGE_ROOM,
  LoungeState,
  MOVE_MESSAGE,
  PROTOCOL_VERSION,
  STATE_PATCH_INTERVAL_MS,
  type MoveMessage,
} from '@3dx/contracts';
import type { Vec2 } from '@3dx/game-core';
import { Client, MatchMakeError, type Room } from '@colyseus/sdk';

export type ConnectionStatus =
  | { state: 'connecting' }
  | { state: 'connected' }
  /** Caiu; o SDK está tentando voltar para a mesma sessão. */
  | { state: 'reconnecting' }
  | { state: 'offline'; reason: string; retryAt: number };

export interface LoungeConnectionHandlers {
  onStatus(status: ConnectionStatus): void;
  /** Estado autoritativo após cada atualização do servidor. */
  onState(state: LoungeState, localId: string): void;
  /** A sessão acabou (o próximo join é outra sessão, com outro sessionId). */
  onSessionEnded(): void;
}

export interface LoungeConnection {
  /** Informa a direção desejada (mundo). O envio é limitado a um por intervalo de patch. */
  setDirection(direction: Vec2, now: number): void;
  /**
   * Para o avatar imediatamente, sem limite de frequência. Para quando o loop de render deixa de
   * rodar (aba em segundo plano) e não haveria um próximo quadro para mandar a parada.
   */
  stop(now: number): void;
  dispose(): void;
}

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15_000;
/** Diferença mínima entre direções para valer um novo envio. */
const DIRECTION_EPSILON = 0.01;

/** Espera antes da tentativa `attempt` (0, 1, 2…): 1 s, 2 s, 4 s… até 15 s. */
export function retryDelay(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
}

/** Mensagem para o jogador a partir do erro de entrada na sala. */
export function describeJoinError(error: unknown): string {
  // Recusas do servidor (4xx, ex.: versão incompatível) já trazem texto para o usuário.
  // Falha de rede chega com código não numérico (ex.: ECONNREFUSED) ou 5xx do proxy.
  const refused =
    error instanceof MatchMakeError &&
    typeof error.code === 'number' &&
    error.code >= 400 &&
    error.code < 500;
  return refused ? error.message : 'Servidor de tempo real indisponível.';
}

/**
 * Prepara a direção para o contrato: o servidor rejeita (e derruba a conexão) eixos fora de [-1, 1],
 * e arredondamento de ponto flutuante pode passar disso por um fio.
 */
export function toMoveMessage(direction: Vec2): MoveMessage {
  const clamp = (value: number) => Math.min(1, Math.max(-1, value));
  return { x: clamp(direction.x), z: clamp(direction.z) };
}

/**
 * Mantém o jogador conectado à sala do lounge: entra, repassa o estado, envia a direção com
 * limite de frequência e, quando a sessão acaba, tenta entrar de novo com espera crescente.
 * Quedas curtas são cobertas pela reconexão automática do SDK (mesma sessão).
 */
export function connectToLounge(url: string, handlers: LoungeConnectionHandlers): LoungeConnection {
  const client = new Client(url);
  let room: Room<unknown, LoungeState> | undefined;
  let disposed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  let desired: MoveMessage = { x: 0, z: 0 };
  let sent: MoveMessage = desired;
  let lastSentAt = -Infinity;

  const scheduleRetry = (reason: string) => {
    const delay = retryDelay(attempt++);
    handlers.onStatus({ state: 'offline', reason, retryAt: Date.now() + delay });
    retryTimer = setTimeout(() => void join(), delay);
  };

  const join = async () => {
    handlers.onStatus({ state: 'connecting' });
    try {
      const joined = await client.joinOrCreate<LoungeState>(
        LOUNGE_ROOM,
        { protocol: PROTOCOL_VERSION },
        LoungeState,
      );
      if (disposed) {
        void joined.leave();
        return;
      }
      room = joined;
      attempt = 0;
      sent = { x: 0, z: 0 };
      handlers.onStatus({ state: 'connected' });

      joined.onStateChange((state) => {
        handlers.onState(state, joined.sessionId);
      });
      joined.onDrop(() => {
        handlers.onStatus({ state: 'reconnecting' });
      });
      joined.onReconnect(() => {
        // O servidor zera a direção de quem cai; reenvia a atual.
        sent = { x: 0, z: 0 };
        handlers.onStatus({ state: 'connected' });
      });
      joined.onLeave(() => {
        room = undefined;
        if (disposed) return;
        handlers.onSessionEnded();
        scheduleRetry('Conexão com o servidor perdida.');
      });
      joined.onError((code, message) => {
        console.warn(`[lounge] erro ${code}: ${message ?? ''}`);
      });
    } catch (error) {
      if (disposed) return;
      scheduleRetry(describeJoinError(error));
    }
  };

  void join();

  return {
    setDirection(direction, now) {
      desired = toMoveMessage(direction);
      const changed =
        Math.abs(desired.x - sent.x) > DIRECTION_EPSILON ||
        Math.abs(desired.z - sent.z) > DIRECTION_EPSILON;
      if (!room || !changed || now - lastSentAt < STATE_PATCH_INTERVAL_MS) return;

      room.send(MOVE_MESSAGE, desired);
      sent = desired;
      lastSentAt = now;
    },
    stop(now) {
      desired = { x: 0, z: 0 };
      if (!room || (sent.x === 0 && sent.z === 0)) return;
      room.send(MOVE_MESSAGE, desired);
      sent = desired;
      lastSentAt = now;
    },
    dispose() {
      disposed = true;
      clearTimeout(retryTimer);
      void room?.leave();
      room = undefined;
    },
  };
}
