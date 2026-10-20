import type {
  AvatarConfig,
  ChatEvent,
  DirectMessageEvent,
  InteractionEndedEvent,
  InteractionRequestedEvent,
  InteractionRespondedEvent,
  InteractionStartedEvent,
  InvitedEvent,
  LoungeState,
  PlayerAction,
  PoseAction,
  Role,
  RoomPrivacy,
  RoomScene,
  UserNotifyEvent,
} from '@3dx/contracts';
import { isPoseAction } from '@3dx/contracts';
import { SEATS, nearestFreeSeat, type Vec2 } from '@3dx/game-core';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { worldDirection } from '../movement/direction';
import { createKeyboardInput, isEditable } from '../movement/keyboard';
import { createPointerInput } from '../movement/pointer';
import {
  connectToLounge,
  type ConnectionStatus,
  type RoomTarget,
} from '../network/lounge-connection';
import { createWorld } from './world';

export interface PlayerListEntry {
  /** sessionId na sala. */
  id: string;
  /** Id público do usuário (para bloquear e denunciar). */
  userId: string;
  name: string;
  /** Papel da conta (a interface marca a equipe). */
  role: Role;
  connected: boolean;
  isLocal: boolean;
}

export interface RoomInfo {
  roomId: string;
  title: string;
  privacy: RoomPrivacy;
  /** Cenário/tema da sala. */
  scene: RoomScene;
  /** O jogador local é o dono (sala privada): pode convidar amigos e trocar a senha. */
  isOwner: boolean;
}

/** O que a interface (React) precisa saber do jogo. Muda raramente, não a cada quadro. */
export interface GameView {
  status: ConnectionStatus;
  players: PlayerListEntry[];
  room?: RoomInfo;
  localAction: PlayerAction;
}

/** Números de desempenho, publicados uma vez por segundo. */
export interface GameStats {
  fps: number;
  /** Malhas ativas na cena (aproxima as chamadas de desenho do passo principal). */
  activeMeshes: number;
  avatarMeshes: number;
}

export interface GameOptions {
  realtimeUrl: string;
  /** Sala inicial (ex.: sala escolhida ao entrar); padrão: uma sala pública. */
  initialRoom?: RoomTarget;
  /** Ticket da API para entrar na sala; `null` se não há mais sessão. */
  getTicket: () => Promise<string | null>;
  /** Shaders e texturas prontos (antes disso a tela fica vazia). */
  onReady: () => void;
  onViewChange: (view: GameView) => void;
  onChat: (event: ChatEvent) => void;
  onChatRejected: (reason: string) => void;
  onDirectMessage: (event: DirectMessageEvent) => void;
  onDirectMessageRejected: (to: string, reason: string) => void;
  /** Convite recebido para uma sala privada (aceitar entra sem senha). */
  onInvited: (event: InvitedEvent) => void;
  /** Convite não entregue (não é amigo, offline…): motivo pronto para mostrar. */
  onInviteRejected: (to: string, reason: string) => void;
  /** Alguém solicitou uma interação social consentida com o jogador local. */
  onInteractionRequested: (event: InteractionRequestedEvent) => void;
  /** Resposta a uma solicitação de interação enviada pelo jogador local. */
  onInteractionResponded: (event: InteractionRespondedEvent) => void;
  /** Uma interação consentida começou. */
  onInteractionStarted: (event: InteractionStartedEvent) => void;
  /** Uma interação consentida terminou. */
  onInteractionEnded: (event: InteractionEndedEvent) => void;
  /** Avisos curtos para o jogador (ex.: nenhum assento por perto, sala indisponível). */
  onNotice: (message: string) => void;
  /** A sessão na API acabou: a interface deve voltar para a tela de entrada. */
  onUnauthorized: () => void;
  /** Um dado do usuário mudou fora da sala: a interface recarrega os dados correspondentes. */
  onUserNotify?: (event: UserNotifyEvent) => void;
  onStats: (stats: GameStats) => void;
}

export type GameAction = 'sit' | 'stand' | 'wave' | 'dance' | PoseAction;

export interface Game {
  /** Envia ao chat da sala; `false` se inválida ou sem conexão. */
  sendChat(text: string): boolean;
  sendDirectMessage(to: string, text: string): boolean;
  /** Sentar, dançar e poses alternam (escolher de novo = parar); acenar é enviado como está. */
  act(action: GameAction): void;
  /** Marca no servidor que o avatar está no closet (cabide acima da cabeça). */
  setCloset(open: boolean): void;
  /** Solicita uma interação consentida com outro jogador da sala. */
  interact(targetUserId: string, type: string): void;
  /** Responde a uma solicitação de interação recebida (aceitar/recusar). */
  respondInteraction(targetUserId: string, accept: boolean): void;
  switchRoom(target: RoomTarget): void;
  /** Dono de sala privada: convida um amigo (chega na hora, se ele estiver online). */
  invite(userId: string): void;
  /** Dono de sala privada: troca a senha da sala. */
  changePassword(password: string): void;
  /** Reapresenta o ticket à sala (ex.: depois de bloquear ou desbloquear alguém). */
  refreshTicket(): Promise<void>;
  /** Mostra uma aparência no próprio avatar antes de salvar; `null` cancela a prévia. */
  previewAvatar(avatar: AvatarConfig | null): void;
  /**
   * Para o loop de renderização sem mexer na conexão (ex.: o vestiário assume a tela com o próprio
   * palco 3D). A sala continua atualizando o estado; nada é desenhado até `setPaused(false)`.
   */
  setPaused(paused: boolean): void;
  dispose(): void;
}

/** Atalhos de ação (posição física da tecla, como o movimento). */
const ACTION_KEYS: Readonly<Record<string, GameAction>> = {
  KeyE: 'sit',
  Digit1: 'wave',
  Digit2: 'dance',
};

/** Quadros mais longos que isso (aba em segundo plano, travada) são truncados. */
const MAX_FRAME_SECONDS = 0.1;

/** Nitidez em telas de alta densidade, limitada a 2x para não estourar o custo de fill rate. */
const MAX_PIXEL_RATIO = 2;

const hardwareScalingLevel = () => 1 / Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);

export function isWebGLSupported(): boolean {
  return Engine.IsSupported;
}

/** Lista para depuração: o jogador local primeiro, os demais por nome. */
export function playerList(state: LoungeState, localId: string): PlayerListEntry[] {
  return [...state.players.entries()]
    .map(([id, player]) => ({
      id,
      userId: player.userId,
      name: player.name,
      role: player.role as Role,
      connected: player.connected,
      isLocal: id === localId,
    }))
    .sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.name.localeCompare(b.name));
}

const sameList = (a: PlayerListEntry[], b: PlayerListEntry[]) =>
  a.length === b.length &&
  a.every((entry, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      entry.id === other.id &&
      entry.name === other.name &&
      entry.role === other.role &&
      entry.connected === other.connected
    );
  });

/** Assentos ocupados, deduzidos de quem está sentado exatamente sobre um assento. */
function occupiedSeats(state: LoungeState): Set<number> {
  const occupied = new Set<number>();
  for (const player of state.players.values()) {
    if (player.action !== 'sit') continue;
    const index = SEATS.findIndex(
      (seat) =>
        Math.abs(seat.position.x - player.x) < 0.01 && Math.abs(seat.position.z - player.z) < 0.01,
    );
    if (index >= 0) occupied.add(index);
  }
  return occupied;
}

/**
 * Cria engine, cena, loop de renderização e conexão com a sala sobre `canvas`. Quem cria é dono
 * do ciclo de vida: `dispose()` sai da sala, para o loop, solta os listeners e libera a GPU.
 */
export function createGame(canvas: HTMLCanvasElement, options: GameOptions): Game {
  const engine = new Engine(canvas, true, { stencil: true });
  engine.setHardwareScalingLevel(hardwareScalingLevel());

  const scene = new Scene(engine);
  const world = createWorld(scene);
  world.camera.camera.attachControl();
  scene.executeWhenReady(options.onReady);

  let view: GameView = { status: { state: 'connecting' }, players: [], localAction: '' };
  const publish = (next: GameView) => {
    view = next;
    options.onViewChange(view);
  };
  let latest: { state: LoungeState; localId: string } | undefined;
  /** Ids de usuário cujo avatar não deve ser exibido (bloqueio nos dois sentidos, do servidor). */
  let hiddenUsers: ReadonlySet<string> = new Set();
  /** Loop parado (ver `setPaused`): o vestiário assume a tela e o mundo não desenha nem ouve teclas. */
  let paused = false;

  const connection = connectToLounge(
    options.realtimeUrl,
    {
      getTicket: options.getTicket,
      onChat: (event) => {
        // Fala do chat vira balão acima de quem falou; a interface continua recebendo o evento.
        world.sayChat(event.userId, event.text);
        options.onChat(event);
      },
      onChatRejected: options.onChatRejected,
      onDirectMessage: options.onDirectMessage,
      onDirectMessageRejected: options.onDirectMessageRejected,
      onUnauthorized: options.onUnauthorized,
      onUserNotify: options.onUserNotify,
      onRoomUnavailable: (reason) => {
        options.onNotice(`${reason} Você foi para uma sala pública.`);
      },
      onJoinRefused: (reason) => {
        options.onNotice(reason);
      },
      onInvited: options.onInvited,
      onInviteRejected: options.onInviteRejected,
      onInteractionRequested: options.onInteractionRequested,
      onInteractionResponded: options.onInteractionResponded,
      onInteractionStarted: options.onInteractionStarted,
      onInteractionEnded: options.onInteractionEnded,
      onHiddenPlayers: (hidden) => {
        hiddenUsers = new Set(hidden);
        // Some/aparece na hora, sem esperar a próxima atualização do servidor (o jogador pode estar
        // parado e não haver patch).
        if (latest) {
          world.syncPlayers(latest.state.players, latest.localId, performance.now(), hiddenUsers);
        }
      },
      onStatus(status) {
        publish({ ...view, status });
      },
      onState(state, localId, roomId) {
        latest = { state, localId };
        world.syncPlayers(state.players, localId, performance.now(), hiddenUsers);
        const players = playerList(state, localId);
        const local = state.players.get(localId);
        const room: RoomInfo = {
          roomId,
          title: state.title,
          privacy: state.privacy === 'private' ? 'private' : 'public',
          scene: (state.scene as RoomScene) ?? 'lounge',
          isOwner: state.privacy === 'private' && local?.userId === state.ownerId,
        };
        const localAction = (local?.action ?? '') as PlayerAction;
        const roomChanged =
          view.room?.roomId !== room.roomId ||
          view.room.title !== room.title ||
          view.room.scene !== room.scene ||
          view.room.isOwner !== room.isOwner;
        if (!sameList(players, view.players) || roomChanged || localAction !== view.localAction) {
          publish({ ...view, players, room, localAction });
        }
      },
      onSessionEnded() {
        latest = undefined;
        hiddenUsers = new Set();
        world.clearPlayers();
        publish({ ...view, players: [], room: undefined, localAction: '' });
      },
    },
    options.initialRoom,
  );

  const act = (action: GameAction) => {
    if (action === 'sit') {
      if (view.localAction === 'sit') {
        connection.act('stand');
        return;
      }
      const local = latest?.state.players.get(latest.localId);
      if (!latest || !local) return;
      // O servidor decide; a checagem local só evita pedir à toa e explica o motivo.
      if (nearestFreeSeat({ x: local.x, z: local.z }, occupiedSeats(latest.state)) === undefined) {
        options.onNotice('Nenhum assento livre por perto. Chegue mais perto de um sofá.');
        return;
      }
      connection.act('sit');
      return;
    }
    // `stand` encerra. Escolher a mesma ação persistente de novo também encerra; o aceno, por ser
    // curto, é reenviado como está.
    const persistent = action === 'dance' || isPoseAction(action);
    if (action === 'stand' || (persistent && view.localAction === action)) {
      connection.act('stand');
      return;
    }
    connection.act(action);
  };

  const keyboard = createKeyboardInput(window);
  // Toque/clique no piso marca o destino do avatar (essencial no celular, onde não há teclado).
  const pointer = createPointerInput(scene, canvas);
  const onActionKey = (event: KeyboardEvent) => {
    const action = ACTION_KEYS[event.code];
    if (paused || !action || event.repeat || isEditable(event.target)) return;
    act(action);
  };
  window.addEventListener('keydown', onActionKey);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') connection.stop(performance.now());
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const renderLoop = () => {
    const dt = Math.min(engine.getDeltaTime() / 1000, MAX_FRAME_SECONDS);
    const now = performance.now();
    const axis = keyboard.axis();
    let direction: Vec2;
    if (axis.x !== 0 || axis.z !== 0) {
      // Teclado manda: cancela um destino de toque que estivesse pendente.
      pointer.clear();
      direction = worldDirection(axis, world.camera.forward());
    } else {
      // Sem teclado, o avatar segue o destino marcado por toque/clique.
      direction = pointer.direction(world.localPosition());
    }
    connection.setDirection(direction, now);
    world.update(dt, now);
    scene.render();
  };
  engine.runRenderLoop(renderLoop);

  const statsTimer = setInterval(() => {
    options.onStats({
      fps: Math.round(engine.getFps()),
      activeMeshes: scene.getActiveMeshes().length,
      avatarMeshes: world.avatarMeshCount(),
    });
  }, 1000);

  // Zoom do navegador muda o devicePixelRatio junto com o tamanho em CSS: recalcula a escala
  // (setHardwareScalingLevel já redimensiona o buffer).
  const resizeObserver = new ResizeObserver(() => {
    engine.setHardwareScalingLevel(hardwareScalingLevel());
  });
  resizeObserver.observe(canvas);

  return {
    sendChat: (text) => connection.sendChat(text),
    sendDirectMessage: (to, text) => connection.sendDirectMessage(to, text),
    act,
    setCloset: (open) => connection.setCloset(open),
    interact: (targetUserId: string, type: string) => connection.interact(targetUserId, type),
    respondInteraction: (targetUserId: string, accept: boolean) =>
      connection.respondInteraction(targetUserId, accept),
    switchRoom: (target) => connection.switchRoom(target),
    invite: (userId) => connection.invite(userId),
    changePassword: (password) => connection.changePassword(password),
    refreshTicket: () => connection.refreshTicket(),
    previewAvatar: (avatar) => world.previewLocalAvatar(avatar),
    setPaused(value) {
      if (value === paused) return;
      paused = value;
      if (value) engine.stopRenderLoop(renderLoop);
      else engine.runRenderLoop(renderLoop);
    },
    dispose() {
      clearInterval(statsTimer);
      connection.dispose();
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onActionKey);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      keyboard.dispose();
      pointer.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
