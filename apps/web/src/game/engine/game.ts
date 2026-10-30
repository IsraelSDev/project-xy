import type {
  AvatarConfig,
  ChatEvent,
  DirectMessageEvent,
  InteractionEndedEvent,
  InteractionRequestedEvent,
  InteractionRespondedEvent,
  InteractionStartedEvent,
  InteractionType,
  InvitedEvent,
  LoungeState,
  PlayerAction,
  PoseAction,
  Role,
  RoomPrivacy,
  RoomScene,
  UserNotifyEvent,
} from '@3dx/contracts';
import { isPoseAction, parseAvatar } from '@3dx/contracts';
import {
  HOME,
  PAIR_POSES,
  coupleComposition,
  nearestFreeSeatScene,
  sceneByName,
  type Vec2,
} from '@3dx/game-core';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Tools } from '@babylonjs/core/Misc/tools';
import { prefetchPairClip } from '../characters/avatar-model';
import { worldDirection } from '../movement/direction';
import { createKeyboardInput, isEditable } from '../movement/keyboard';
import { createPointerInput } from '../movement/pointer';
import {
  connectToLounge,
  type ConnectionStatus,
  type RoomTarget,
} from '../network/lounge-connection';
import { idlePairActions, warmUpOnIdle } from './idle-warmup';
import { createWorld } from './world';

export interface PlayerListEntry {
  /** sessionId na sala. */
  id: string;
  /** Id público do usuário (para bloquear e denunciar). */
  userId: string;
  name: string;
  /** Papel da conta (a interface marca a equipe). */
  role: Role;
  /** Corpo do avatar: define quais pares (M/F, F/F, M/M) a interação aceita. */
  model: AvatarConfig['model'];
  /** Versão da foto do perfil (ISO); '' = sem foto. */
  photoUpdatedAt: string;
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
  /**
   * Toque/clique no corpo de outro jogador: a interface abre o menu de ações ali (perfil,
   * interações, bloqueio) sem precisar procurar na lista. `screen` é a posição do toque na tela.
   */
  onAvatarTap?: (userId: string, screen: { x: number; y: number }) => void;
  /** A sessão na API acabou: a interface deve voltar para a tela de entrada. */
  onUnauthorized: () => void;
  /** Um dado do usuário mudou fora da sala: a interface recarrega os dados correspondentes. */
  onUserNotify?: (event: UserNotifyEvent) => void;
  onStats: (stats: GameStats) => void;
}

export type GameAction = 'sit' | 'stand' | 'wave' | 'dance' | 'dance2' | 'beer' | PoseAction;

export interface Game {
  /** Envia ao chat da sala; `false` se inválida ou sem conexão. */
  sendChat(text: string): boolean;
  sendDirectMessage(to: string, text: string): boolean;
  /** Sentar, dançar e poses alternam (escolher de novo = parar); acenar é enviado como está. */
  act(action: GameAction): void;
  /** Marca no servidor que o avatar está no closet (cabide acima da cabeça). */
  setCloset(open: boolean): void;
  /** Abraça o jogador mais próximo (até 2 m) ou acena, se não houver ninguém perto. */
  greetNearest(): void;
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
   * Retrato do avatar `userId` (JPEG em data URL, 320×320), enquadrado de frente a partir da cena.
   * Fica em cache por avatar e só é refeito quando aparência/ação mudam. `undefined` quando o
   * avatar não está carregado (outra sala, offline ou bloqueado).
   */
  portraitOf(userId: string): Promise<string | undefined>;
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
  Digit3: 'beer',
  Digit4: 'dance2',
};

/** Quadros mais longos que isso (aba em segundo plano, travada) são truncados. */
const MAX_FRAME_SECONDS = 0.1;

/** Distância (m) do toque ao assento para o clique no sofá contar como "sentar aqui". */
const SEAT_TAP_RADIUS = 0.9;
/** Perto disso do assento o avatar senta sozinho, mesmo que a colisão do móvel o tenha parado. */
const SEAT_SIT_RADIUS = 1;
/** Quanto tempo o "sentar no assento tocado" espera o avatar chegar antes de desistir. */
const SEAT_TAP_TIMEOUT_MS = 8000;

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
      model: parseAvatar(player.avatar).model,
      photoUpdatedAt: player.photoUpdatedAt,
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
      entry.model === other.model &&
      entry.photoUpdatedAt === other.photoUpdatedAt &&
      entry.connected === other.connected
    );
  });

/** Assentos ocupados, deduzidos de quem está sentado exatamente sobre um assento. */
function occupiedSeats(state: LoungeState): Set<number> {
  const occupied = new Set<number>();
  const seats = sceneByName(state.scene)?.seats ?? HOME.seats;
  for (const player of state.players.values()) {
    if (player.action !== 'sit') continue;
    const index = seats.findIndex(
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

  /** Retratos por avatar (data URL), invalidados quando a versão do visual muda. */
  const portraits = new Map<string, { version: string; data: string }>();
  const PORTRAITS_MAX = 40;

  /**
   * Aquece o clipe do par antes de ele tocar: no pedido (quem convida) e no aceite (os dois). O
   * clipe de móvel/F-F/M-M é grande e vem de `clips/`; sem isso o primeiro toque esperaria o
   * download. Idempotente (o loader tem cache por cena/ação).
   */
  const prefetchPair = (type: string) => {
    const pair = PAIR_POSES[type];
    if (!pair) return;
    world.prefetchClip(pair.actor);
    if (pair.partner !== pair.actor) world.prefetchClip(pair.partner);
  };

  /** Economia de dados ou rede 2G: baixar clipes em segundo plano não é essencial. */
  const backgroundDataAllowed = () => {
    if (typeof navigator === 'undefined') return false;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (!connection) return true;
    if (connection.saveData) return false;
    return connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g';
  };

  /**
   * Em ociosidade, aquece a primeira opção de cada móvel (sofá, cadeira, cama e, no estúdio,
   * parede): é o caminho mais curto para um par e o clipe vem de `clips/` (0,7–2,5 MB cada). Um
   * por ocioso, depois do corpo carregado, sem competir com a entrada na sala. Só o modelo local:
   * cada cliente aquece o próprio corpo (o do parceiro é problema do cliente dele).
   */
  let stopIdleWarmup: (() => void) | undefined;
  let warmedScene: RoomScene | undefined;
  const startIdleWarmup = (room: RoomInfo) => {
    const local = latest?.state.players.get(latest.localId);
    if (!local || warmedScene === room.scene) return;
    warmedScene = room.scene;
    stopIdleWarmup?.();
    stopIdleWarmup = undefined;
    if (!backgroundDataAllowed()) return;
    const model = parseAvatar(local.avatar).model;
    stopIdleWarmup = warmUpOnIdle({
      actions: idlePairActions(room.scene),
      ready: () => !document.hidden && world.localModelReady(),
      prefetch: (action) => prefetchPairClip(scene, model, action),
    });
  };

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
      onInteractionStarted: (event) => {
        // Aceite recebido: baixa o clipe do par enquanto o estado (ação) chega e ancora a fase no
        // relógio do servidor (os dois clientes tocam o mesmo quadro).
        prefetchPair(event.type);
        world.notePairStart(event.type, event.startedAt);
        options.onInteractionStarted(event);
      },
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
          scene: (state.scene as RoomScene) ?? 'club',
          isOwner: state.privacy === 'private' && local?.userId === state.ownerId,
        };
        const localAction = (local?.action ?? '') as PlayerAction;
        const roomChanged =
          view.room?.roomId !== room.roomId ||
          view.room.title !== room.title ||
          view.room.scene !== room.scene ||
          view.room.isOwner !== room.isOwner;
        if (!sameList(players, view.players) || roomChanged || localAction !== view.localAction) {
          if (roomChanged) world.setScene(room.scene);
          publish({ ...view, players, room, localAction });
          // Em ociosidade, aquece os pares mais prováveis (só arma uma vez por cena).
          startIdleWarmup(room);
        }
      },
      onSessionEnded() {
        latest = undefined;
        hiddenUsers = new Set();
        // Sem sessão não há para quem aquecer; a próxima entrada agenda de novo.
        stopIdleWarmup?.();
        stopIdleWarmup = undefined;
        warmedScene = undefined;
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
      const layout = sceneByName(latest.state.scene) ?? HOME;
      if (
        nearestFreeSeatScene(layout, { x: local.x, z: local.z }, occupiedSeats(latest.state)) ===
        undefined
      ) {
        options.onNotice('Nenhum assento livre por perto. Chegue mais perto de um assento.');
        return;
      }
      connection.act('sit');
      return;
    }
    // `stand` encerra. Escolher a mesma ação persistente de novo também encerra; o aceno, por ser
    // curto, é reenviado como está.
    const persistent = action === 'dance' || action === 'dance2' || isPoseAction(action);
    if (action === 'stand' || (persistent && view.localAction === action)) {
      connection.act('stand');
      return;
    }
    connection.act(action);
  };

  /**
   * "Abraçar / cumprimentar": se houver outro jogador a até 2 m, pede o abraço
   * (interação consentida) na variante que combina com os corpos dos dois; sozinho, acena.
   */
  const greetNearest = () => {
    if (!latest) return;
    const local = latest.state.players.get(latest.localId);
    if (!local) return;
    const sideOf = (avatarJson: string): 'male' | 'female' =>
      parseAvatar(avatarJson).model === '3dx-female' ? 'female' : 'male';
    let nearest: { userId: string; composition: 'mf' | 'ff' | 'mm'; distance: number } | undefined;
    for (const player of latest.state.players.values()) {
      if (player.userId === local.userId || !player.connected) continue;
      const distance = Math.hypot(player.x - local.x, player.z - local.z);
      if (distance <= 2 && (!nearest || distance < nearest.distance)) {
        nearest = {
          userId: player.userId,
          composition: coupleComposition(sideOf(local.avatar), sideOf(player.avatar)),
          distance,
        };
      }
    }
    if (nearest) {
      const type: InteractionType =
        nearest.composition === 'ff' ? 'ff-hug' : nearest.composition === 'mm' ? 'mm-hug' : 'hug';
      connection.interact(nearest.userId, type);
    } else connection.act('wave');
  };

  const keyboard = createKeyboardInput(window);
  /**
   * Assento a que o avatar está indo para sentar (toque/clique no sofá). Some ao chegar, ao sentar
   * ou depois de alguns segundos (se o caminho estiver bloqueado).
   */
  let pendingSeat: { x: number; z: number; until: number } | undefined;
  /**
   * Assento tocado: o mais próximo do ponto do piso dentro do raio do toque. `taken` quando ele já
   * está ocupado (aí o toque só avisa, em vez de mandar o avatar para dentro do móvel).
   */
  const seatNear = (
    point: Vec2,
  ): { kind: 'free'; x: number; z: number } | { kind: 'taken' } | undefined => {
    if (!latest) return undefined;
    const layout = sceneByName(latest.state.scene) ?? HOME;
    const taken = occupiedSeats(latest.state);
    let bestIndex: number | undefined;
    let bestDistance = Infinity;
    for (const [index, seat] of layout.seats.entries()) {
      const distance = Math.hypot(seat.position.x - point.x, seat.position.z - point.z);
      if (distance > SEAT_TAP_RADIUS || distance >= bestDistance) continue;
      bestIndex = index;
      bestDistance = distance;
    }
    if (bestIndex === undefined) return undefined;
    if (taken.has(bestIndex)) return { kind: 'taken' };
    const seat = layout.seats[bestIndex]!;
    return { kind: 'free', x: seat.position.x, z: seat.position.z };
  };
  // Toque/clique: avatar abre o menu (sem andar), sofá manda andar até o assento, resto anda.
  const debugTap =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tap');
  const pointer = createPointerInput(scene, canvas, (tap) => {
    const hit = world.pickTap(tap.x, tap.y);
    if (debugTap) {
      const description = hit ? (hit.kind === 'avatar' ? `avatar ${hit.userId}` : 'piso') : 'nada';
      options.onNotice(`toque: ${description}`);
      console.info('[tap]', { x: tap.x, y: tap.y }, world.pickTapDebug(tap.x, tap.y), hit);
    }
    if (!hit) return { kind: 'handled' };
    const local = latest?.state.players.get(latest.localId);
    if (hit.kind === 'avatar') {
      // O próprio corpo não tem menu (nem outra sessão da mesma conta).
      if (!local || hit.userId === local.userId) return { kind: 'handled' };
      options.onAvatarTap?.(hit.userId, { x: tap.clientX, y: tap.clientY });
      return { kind: 'handled' };
    }
    // Sentado: o avatar não anda; um toque no mundo levanta (como o botão "Levantar").
    if (view.localAction === 'sit') {
      connection.act('stand');
      return { kind: 'handled' };
    }
    const seat = seatNear(hit.point);
    if (seat?.kind === 'taken') {
      options.onNotice('Esse lugar já está ocupado.');
      return { kind: 'handled' };
    }
    if (seat) {
      pendingSeat = { x: seat.x, z: seat.z, until: performance.now() + SEAT_TAP_TIMEOUT_MS };
      return { kind: 'walk', target: { x: seat.x, z: seat.z } };
    }
    pendingSeat = undefined;
    return { kind: 'walk', target: hit.point };
  });
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
    // Chegou perto do assento tocado: senta (o servidor confirma o alcance).
    if (pendingSeat) {
      const local = latest?.state.players.get(latest.localId);
      if (!local || now > pendingSeat.until || view.localAction === 'sit') {
        pendingSeat = undefined;
      } else if (Math.hypot(local.x - pendingSeat.x, local.z - pendingSeat.z) <= SEAT_SIT_RADIUS) {
        pendingSeat = undefined;
        connection.act('sit');
      }
    }
    connection.setDirection(direction, now, keyboard.sprint());
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
    greetNearest,
    interact: (targetUserId, type) => {
      // Quem convida já pode baixar o clipe: o aceite costuma levar alguns segundos.
      prefetchPair(type);
      connection.interact(targetUserId, type);
    },
    respondInteraction: (targetUserId: string, accept: boolean) =>
      connection.respondInteraction(targetUserId, accept),
    switchRoom: (target) => connection.switchRoom(target),
    invite: (userId) => connection.invite(userId),
    changePassword: (password) => connection.changePassword(password),
    refreshTicket: () => connection.refreshTicket(),
    previewAvatar: (avatar) => world.previewLocalAvatar(avatar),
    async portraitOf(userId) {
      const pose = world.avatarPoseOf(userId);
      const version = world.avatarVersionOf(userId);
      if (!pose || !version) return undefined;
      // Cache por sessão: o retrato só é refeito quando aparência/ação mudam (ou depois de
      // `PORTRAITS_MAX` avatares diferentes, o mais antigo sai).
      const cached = portraits.get(userId);
      if (cached?.version === version) return cached.data;
      // Enquadramento fechado no rosto, sem o rótulo do nome nem balão/cabide na frente.
      const target = new Vector3(pose.x, 1.58, pose.z);
      const front = new Vector3(Math.sin(pose.heading), 0, Math.cos(pose.heading));
      const camera = new FreeCamera(
        'portrait-camera',
        target.add(front.scale(0.92)).add(new Vector3(0, 0.02, 0)),
        scene,
      );
      camera.setTarget(target);
      camera.fov = 0.6;
      world.setAvatarDecorations(userId, false);
      try {
        const data = await Tools.CreateScreenshotAsync(
          engine,
          camera,
          { width: 320, height: 320 },
          'image/jpeg',
        );
        portraits.set(userId, { version, data });
        if (portraits.size > PORTRAITS_MAX) {
          const oldest = portraits.keys().next().value;
          if (oldest !== undefined) portraits.delete(oldest);
        }
        return data;
      } catch {
        // Sem WebGL para render target ou avatar saindo da sala: o perfil cai nas iniciais/foto.
        return undefined;
      } finally {
        world.setAvatarDecorations(userId, true);
        camera.dispose();
      }
    },
    setPaused(value) {
      if (value === paused) return;
      paused = value;
      if (value) engine.stopRenderLoop(renderLoop);
      else engine.runRenderLoop(renderLoop);
    },
    dispose() {
      clearInterval(statsTimer);
      stopIdleWarmup?.();
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
