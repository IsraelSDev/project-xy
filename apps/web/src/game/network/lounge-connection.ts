import {
  ACTION_MESSAGE,
  CHAT_EVENT,
  CHAT_MESSAGE,
  CHAT_REJECTED_EVENT,
  CHANGE_PASSWORD_MESSAGE,
  ChangePasswordMessage,
  ChatMessage,
  CLOSET_MESSAGE,
  DM_EVENT,
  DM_MESSAGE,
  DM_REJECTED_EVENT,
  DirectMessage,
  HIDDEN_PLAYERS,
  INVITE_MESSAGE,
  INVITE_REJECTED_EVENT,
  INVITED_EVENT,
  INTERACTION_REQUEST_MESSAGE,
  INTERACTION_RESPONSE_MESSAGE,
  INTERACTION_REQUESTED_EVENT,
  INTERACTION_RESPONDED_EVENT,
  INTERACTION_STARTED_EVENT,
  INTERACTION_ENDED_EVENT,
  type InteractionRequestedEvent,
  type InteractionRespondedEvent,
  type InteractionStartedEvent,
  type InteractionEndedEvent,
  LOUNGE_ROOM,
  LoungeState,
  MOVE_MESSAGE,
  PROTOCOL_VERSION,
  REFRESH_TICKET_MESSAGE,
  STATE_PATCH_INTERVAL_MS,
  TICKET_REFRESH_INTERVAL_MS,
  USER_NOTIFY,
  type ActionMessage,
  type ChatEvent,
  type ChatRejectedEvent,
  type DirectMessageEvent,
  type DirectMessageRejectedEvent,
  type HiddenPlayersEvent,
  type InviteRejectedEvent,
  type InvitedEvent,
  type MoveMessage,
  type RoomPrivacy,
  type RoomScene,
  type UserNotifyEvent,
} from '@3dx/contracts';
import type { Vec2 } from '@3dx/game-core';
import { Client, CloseCode, ErrorCode, MatchMakeError, type Room } from '@colyseus/sdk';

export type ConnectionStatus =
  | { state: 'connecting' }
  | { state: 'connected' }
  /** Caiu; o SDK está tentando voltar para a mesma sessão. */
  | { state: 'reconnecting' }
  | { state: 'offline'; reason: string; retryAt: number };

/** Para qual sala ir. */
export type RoomTarget =
  /** Uma sala pública com vaga (ou uma nova). */
  | { kind: 'default' }
  /** Sala existente; `password` é exigida quando ela é privada (salvo para o dono e convidados). */
  | { kind: 'join'; roomId: string; password?: string }
  /** Sala nova; sala privada exige senha. */
  | { kind: 'create'; privacy: RoomPrivacy; title: string; scene: RoomScene; password?: string };

export interface LoungeConnectionHandlers {
  /** Ticket da API para entrar na sala; `null` se o usuário não tem mais sessão. */
  getTicket: () => Promise<string | null>;
  onStatus: (status: ConnectionStatus) => void;
  /** Estado autoritativo após cada atualização do servidor. */
  onState: (state: LoungeState, localId: string, roomId: string) => void;
  /** A sessão na sala acabou (o próximo join é outra sessão, com outro sessionId). */
  onSessionEnded: () => void;
  onChat: (event: ChatEvent) => void;
  onChatRejected: (reason: string) => void;
  /** Mensagem privada recebida (ou o eco de uma enviada). */
  onDirectMessage: (event: DirectMessageEvent) => void;
  /** Mensagem privada não enviada, com o motivo pronto para mostrar. */
  onDirectMessageRejected: (to: string, reason: string) => void;
  /** Convite recebido para uma sala privada (aceitar entra sem senha). */
  onInvited: (event: InvitedEvent) => void;
  /** Convite não entregue (não é amigo, offline, limite…): motivo pronto para mostrar. */
  onInviteRejected: (to: string, reason: string) => void;
  /**
   * Um dado do usuário mudou fora da sala (amizades/bloqueios ou fila da moderação): a interface
   * recarrega o endpoint correspondente na hora em vez de esperar o polling.
   */
  onUserNotify?: (event: UserNotifyEvent) => void;
  /**
   * Ids de usuário cujo avatar não deve ser exibido (bloqueio nos dois sentidos, decidido pelo
   * servidor). Chega ao entrar e sempre que o conjunto muda.
   */
  onHiddenPlayers: (hidden: readonly string[]) => void;
  /** A sala pedida não aceitou (não existe, servidor caiu…): voltou para a sala padrão. */
  onRoomUnavailable: (reason: string) => void;
  /** A sala pedida recusou (senha errada, sala cheia…): voltou para a sala anterior. */
  onJoinRefused: (reason: string) => void;
  /** Sem sessão na API: não adianta tentar de novo, é preciso entrar novamente. */
  onUnauthorized: () => void;
  /** Alguém solicitou uma interação social consentida com o jogador local. */
  onInteractionRequested?: (event: InteractionRequestedEvent) => void;
  /** Resposta a uma solicitação de interação enviada pelo jogador local. */
  onInteractionResponded?: (event: InteractionRespondedEvent) => void;
  /** Uma interação consentida começou ou terminou. */
  onInteractionStarted?: (event: InteractionStartedEvent) => void;
  onInteractionEnded?: (event: InteractionEndedEvent) => void;
}

export interface LoungeConnection {
  /** Informa a direção desejada (mundo). O envio é limitado a um por intervalo de patch. */
  setDirection(direction: Vec2, now: number): void;
  /**
   * Para o avatar imediatamente, sem limite de frequência. Para quando o loop de render deixa de
   * rodar (aba em segundo plano) e não haveria um próximo quadro para mandar a parada.
   */
  stop(now: number): void;
  /** Envia ao chat; `false` se a mensagem é inválida ou não há conexão. */
  sendChat(text: string): boolean;
  /** Mensagem privada para um amigo; `false` se a mensagem é inválida ou não há conexão. */
  sendDirectMessage(to: string, text: string): boolean;
  /** Pede uma ação (sentar, acenar…); o servidor decide se vale. */
  act(type: ActionMessage['type']): void;
  /** Marca no servidor que o avatar entrou/saiu do closet (cabide acima da cabeça). */
  setCloset(open: boolean): void;
  /** Solicita uma interação consentida com outro jogador da sala. */
  interact(targetUserId: string, type: string): void;
  /** Responde a uma solicitação de interação recebida (aceitar/recusar). */
  respondInteraction(targetUserId: string, accept: boolean): void;
  /** Dono de sala privada: convida um amigo (chega na hora, se ele estiver online). */
  invite(userId: string): void;
  /** Dono de sala privada: troca a senha; quem já foi convidado continua entrando. */
  changePassword(password: string): void;
  /** Sai da sala atual e vai para outra. */
  switchRoom(target: RoomTarget): void;
  /** Pede um ticket novo à API e entrega à sala (ex.: para valer um bloqueio recém-feito). */
  refreshTicket(): Promise<void>;
  dispose(): void;
}

const untilFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15_000;
/** Diferença mínima entre direções para valer um novo envio. */
const DIRECTION_EPSILON = 0.01;

/** Espera antes da tentativa `attempt` (0, 1, 2…): 1 s, 2 s, 4 s… até 15 s. */
export function retryDelay(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
}

/** O servidor respondeu e recusou (não adianta insistir na mesma sala). */
function isRefusal(error: unknown): error is MatchMakeError {
  return (
    error instanceof MatchMakeError &&
    typeof error.code === 'number' &&
    ((error.code >= 400 && error.code < 500) ||
      error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID ||
      error.code === ErrorCode.MATCHMAKE_EXPIRED)
  );
}

/** Mensagem para o jogador a partir do erro de entrada na sala. */
export function describeJoinError(error: unknown): string {
  // Recusas do servidor (4xx, ex.: versão incompatível) já trazem texto para o usuário.
  // Falha de rede chega com código não numérico (ex.: ECONNREFUSED) ou 5xx do proxy.
  if (!isRefusal(error)) return 'Servidor de tempo real indisponível.';
  if (error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) return 'Essa sala não existe mais.';
  if (error.code === ErrorCode.MATCHMAKE_EXPIRED) return 'A sala não aceitou a entrada a tempo.';
  return error.message;
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
 * Mantém o jogador conectado a uma sala do lounge: entra com ticket da API, repassa estado, chat
 * e convites, envia intenções com limite de frequência e, quando a sessão acaba, tenta voltar
 * para a mesma sala com espera crescente. Quedas curtas são cobertas pela reconexão do SDK.
 */
export function connectToLounge(
  url: string,
  handlers: LoungeConnectionHandlers,
  initialTarget: RoomTarget = { kind: 'default' },
): LoungeConnection {
  const client = new Client(url);
  let room: Room<unknown, LoungeState> | undefined;
  let target = initialTarget;
  /** Para onde voltar se a próxima sala recusar (ex.: senha errada), em vez de cair na pública. */
  let revertTo: RoomTarget | undefined;
  let disposed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Incrementa a cada troca de sala: respostas de entradas antigas são descartadas. */
  let generation = 0;

  let desired: MoveMessage = { x: 0, z: 0 };
  let sent: MoveMessage = desired;
  let lastSentAt = -Infinity;
  let closetOpen = false;

  const scheduleRetry = (reason: string) => {
    const delay = retryDelay(attempt++);
    handlers.onStatus({ state: 'offline', reason, retryAt: Date.now() + delay });
    retryTimer = setTimeout(() => void join(), delay);
  };

  const enter = async (ticket: string) => {
    const options = { protocol: PROTOCOL_VERSION, ticket };
    switch (target.kind) {
      case 'default':
        return client.joinOrCreate<LoungeState>(LOUNGE_ROOM, options, LoungeState);
      case 'join':
        return client.joinById<LoungeState>(
          target.roomId,
          { ...options, ...(target.password ? { password: target.password } : {}) },
          LoungeState,
        );
      case 'create':
        return client.create<LoungeState>(
          LOUNGE_ROOM,
          {
            ...options,
            privacy: target.privacy,
            title: target.title,
            scene: target.scene,
            ...(target.password ? { password: target.password } : {}),
          },
          LoungeState,
        );
    }
  };

  const join = async () => {
    const myGeneration = generation;
    handlers.onStatus({ state: 'connecting' });
    try {
      const ticket = await handlers.getTicket();
      if (disposed || myGeneration !== generation) return;
      if (ticket === null) {
        handlers.onUnauthorized();
        return;
      }

      const joined = await enter(ticket);
      if (disposed || myGeneration !== generation) {
        void joined.leave();
        return;
      }
      room = joined;
      if (closetOpen) room.send(CLOSET_MESSAGE, { open: true });
      attempt = 0;
      revertTo = undefined;
      sent = { x: 0, z: 0 };
      // Novas tentativas (sessão perdida) voltam para esta mesma sala.
      target = {
        kind: 'join',
        roomId: joined.roomId,
        password: target.kind === 'join' ? target.password : undefined,
      };
      handlers.onStatus({ state: 'connected' });

      joined.onStateChange((state) => {
        handlers.onState(state, joined.sessionId, joined.roomId);
      });
      joined.onMessage(CHAT_EVENT, (event: ChatEvent) => {
        handlers.onChat(event);
      });
      joined.onMessage(CHAT_REJECTED_EVENT, (event: ChatRejectedEvent) => {
        handlers.onChatRejected(
          event.until === undefined
            ? event.reason
            : `${event.reason} Até ${untilFormat.format(event.until)}.`,
        );
      });
      joined.onMessage(DM_EVENT, (event: DirectMessageEvent) => {
        handlers.onDirectMessage(event);
      });
      joined.onMessage(DM_REJECTED_EVENT, (event: DirectMessageRejectedEvent) => {
        handlers.onDirectMessageRejected(
          event.to,
          event.until === undefined
            ? event.reason
            : `${event.reason} Até ${untilFormat.format(event.until)}.`,
        );
      });
      joined.onMessage(INVITED_EVENT, (event: InvitedEvent) => {
        handlers.onInvited(event);
      });
      joined.onMessage(INVITE_REJECTED_EVENT, (event: InviteRejectedEvent) => {
        handlers.onInviteRejected(event.to, event.reason);
      });
      joined.onMessage(HIDDEN_PLAYERS, (event: HiddenPlayersEvent) => {
        handlers.onHiddenPlayers(event.hidden);
      });
      joined.onMessage(INTERACTION_REQUESTED_EVENT, (event: InteractionRequestedEvent) => {
        handlers.onInteractionRequested?.(event);
      });
      joined.onMessage(INTERACTION_RESPONDED_EVENT, (event: InteractionRespondedEvent) => {
        handlers.onInteractionResponded?.(event);
      });
      joined.onMessage(INTERACTION_STARTED_EVENT, (event: InteractionStartedEvent) => {
        handlers.onInteractionStarted?.(event);
      });
      joined.onMessage(INTERACTION_ENDED_EVENT, (event: InteractionEndedEvent) => {
        handlers.onInteractionEnded?.(event);
      });
      joined.onMessage(USER_NOTIFY, (event: UserNotifyEvent) => {
        handlers.onUserNotify?.(event);
      });
      joined.onDrop(() => {
        handlers.onStatus({ state: 'reconnecting' });
      });
      joined.onReconnect(() => {
        // O servidor zera a direção de quem cai; reenvia a atual.
        sent = { x: 0, z: 0 };
        handlers.onStatus({ state: 'connected' });
      });
      joined.onLeave((code) => {
        if (room !== joined) return; // saída pedida por switchRoom/dispose
        room = undefined;
        handlers.onSessionEnded();
        if (code === CloseCode.SERVER_SHUTDOWN) {
          // O servidor reiniciou (ex.: deploy). As salas ficam em memória e acabaram com ele:
          // tentar voltar para a mesma só daria "sala não existe".
          if (target.kind !== 'default') {
            target = { kind: 'default' };
            handlers.onRoomUnavailable('O servidor foi atualizado e a sala foi encerrada.');
          }
          scheduleRetry('Servidor reiniciando…');
          return;
        }
        scheduleRetry('Conexão com o servidor perdida.');
      });
      joined.onError((code, message) => {
        console.warn(`[lounge] erro ${code}: ${message ?? ''}`);
      });
    } catch (error) {
      if (disposed || myGeneration !== generation) return;
      if (target.kind !== 'default' && isRefusal(error)) {
        const reason = describeJoinError(error);
        if (revertTo) {
          // A sala pedida recusou (ex.: senha errada): volta para a anterior, sem cair na pública.
          target = revertTo;
          revertTo = undefined;
          handlers.onJoinRefused(reason);
        } else {
          // Sem sala anterior: volta para uma sala pública.
          handlers.onRoomUnavailable(reason);
          target = { kind: 'default' };
        }
        void join();
        return;
      }
      scheduleRetry(describeJoinError(error));
    }
  };

  const leaveCurrent = () => {
    const current = room;
    room = undefined;
    void current?.leave();
  };

  const refreshTicket = async () => {
    const ticket = await handlers.getTicket();
    if (ticket === null) {
      handlers.onUnauthorized();
      return;
    }
    room?.send(REFRESH_TICKET_MESSAGE, { ticket });
  };

  // O realtime tira da sala quem deixa o ticket vencer (é assim que a suspensão chega a quem está
  // conectado). Falha de rede passa: a próxima tentativa vem antes do prazo.
  const refreshTimer = setInterval(() => {
    if (room) refreshTicket().catch(() => undefined);
  }, TICKET_REFRESH_INTERVAL_MS);

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
    sendChat(text) {
      // Mensagem fora do contrato derrubaria a conexão: valida antes com o mesmo schema do servidor.
      if (!room || !ChatMessage.safeParse({ text }).success) return false;
      room.send(CHAT_MESSAGE, { text });
      return true;
    },
    sendDirectMessage(to, text) {
      if (!room || !DirectMessage.safeParse({ to, text }).success) return false;
      room.send(DM_MESSAGE, { to, text });
      return true;
    },
    act(type) {
      room?.send(ACTION_MESSAGE, { type });
    },
    setCloset(open) {
      closetOpen = open;
      room?.send(CLOSET_MESSAGE, { open });
    },
    interact(targetUserId, type) {
      room?.send(INTERACTION_REQUEST_MESSAGE, { to: targetUserId, type });
    },
    respondInteraction(targetUserId, accept) {
      room?.send(INTERACTION_RESPONSE_MESSAGE, { from: targetUserId, accept });
    },
    invite(userId) {
      room?.send(INVITE_MESSAGE, { to: userId });
    },
    changePassword(password) {
      // Fora do contrato derrubaria a conexão: valida antes com o mesmo schema do servidor.
      if (room && ChangePasswordMessage.safeParse({ password }).success) {
        room.send(CHANGE_PASSWORD_MESSAGE, { password });
      }
    },
    switchRoom(next) {
      generation++;
      clearTimeout(retryTimer);
      attempt = 0;
      // Guarda a sala atual para voltar caso a nova recuse (ex.: senha errada).
      revertTo = target.kind === 'join' ? target : undefined;
      target = next;
      leaveCurrent();
      handlers.onSessionEnded();
      void join();
    },
    refreshTicket,
    dispose() {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(refreshTimer);
      leaveCurrent();
    },
  };
}
