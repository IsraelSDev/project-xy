import { parseAvatar, staffTag, type AvatarConfig, type PlayerAction } from '@3dx/contracts';
import { length, type Vec2 } from '@3dx/game-core';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Scene } from '@babylonjs/core/scene';
import { actionPose } from '../animation/actions';
import { advanceWalk, walkPose, type WalkState } from '../animation/walk-cycle';
import { pushSnapshot, samplePose, type Pose2, type Snapshot } from '../network/snapshot-buffer';
import { attachAvatarModel, motionClip, type AvatarModelAttachment } from './avatar-model';
import { attachAvatarParts, type AvatarParts } from './avatar-parts';
import { createMannequin, type Mannequin } from './mannequin';
import { createNameTag, type NameTag } from './name-tag';
import { createSpeechBubble, type SpeechBubble } from './speech-bubble';

/** O que o cliente usa do estado de cada jogador (subconjunto de `PlayerState`). */
export interface PlayerSnapshot {
  x: number;
  z: number;
  heading: number;
  connected: boolean;
  /** Nome público, mostrado acima do avatar. */
  name: string;
  /** Papel da conta (a equipe ganha um selo no rótulo). */
  role: string;
  /** AvatarConfig em JSON, como veio do servidor. */
  avatar: string;
  /** PlayerAction ('' = nenhuma). */
  action: string;
  /** Id público do usuário (para esconder quem foi bloqueado). */
  userId: string;
}

export interface Avatars {
  /**
   * Sincroniza com o estado do servidor: cria quem entrou, remove quem saiu, guarda snapshots.
   * `hidden` (ids de usuário que o servidor mandou esconder: bloqueio nos dois sentidos) não
   * aparece no mundo até sair da lista.
   */
  sync(
    players: ReadonlyMap<string, PlayerSnapshot>,
    localId: string,
    now: number,
    hidden?: ReadonlySet<string>,
  ): void;
  /** Posiciona e anima todos no instante `renderTime` (no passado, para haver o que interpolar). */
  update(renderTime: number, dt: number): void;
  /** Posição exibida do avatar `id`, se ele já apareceu. */
  positionOf(id: string): Vec2 | undefined;
  /** Mostra acima do avatar de `userId` um balão com o texto do chat (some sozinho). */
  say(userId: string, text: string): void;
  /**
   * Mostra no avatar local uma aparência ainda não salva (editor). `null` volta ao que o servidor
   * informa. A prévia também se encerra sozinha quando o servidor passa a informar a mesma coisa.
   */
  previewLocal(avatar: AvatarConfig | null): void;
  /** Total de malhas dos avatares (diagnóstico de desempenho). */
  meshCount(): number;
  clear(): void;
}

interface Avatar {
  mannequin: Mannequin;
  /** Rótulo com o nome acima da cabeça (pode faltar se o ambiente não desenha textura). */
  nameTag?: NameTag;
  /** Balão de fala acima do rótulo (idem: pode faltar). */
  bubble?: SpeechBubble;
  /** Último nome recebido do servidor. */
  name: string;
  /** Último papel recebido do servidor. */
  role: string;
  /** Id público do usuário (o chat refere-se a ele, não ao id da sessão). */
  userId: string;
  /** Modelo base montado (ver `AvatarConfig.model`); ausente enquanto carrega. */
  model?: AvatarModelAttachment;
  /** Peças de vestuário (GLB) presas à raiz do modelo; ausente enquanto o modelo carrega. */
  parts?: AvatarParts;
  /** Modelo pedido por último; evita recarregar quando nada mudou. */
  modelName?: AvatarConfig['model'];
  /** Conta cargas em andamento: uma carga antiga que chega tarde é descartada. */
  modelToken: number;
  buffer: Snapshot[];
  walk: WalkState;
  pose?: Pose2;
  /** Último JSON de avatar recebido do servidor. */
  avatarJson: string;
  action: PlayerAction;
  /** Conectado ou aguardando reconexão (translúcido). */
  connected: boolean;
}

const ACTIONS_WITH_POSE: readonly string[] = ['sit', 'wave', 'dance'];
/** Ação desconhecida (versão nova do servidor, valor estranho) vira "nenhuma". */
const toAction = (value: string): PlayerAction =>
  ACTIONS_WITH_POSE.includes(value) ? (value as PlayerAction) : '';

const sameAvatar = (a: AvatarConfig, b: AvatarConfig) =>
  (Object.keys(a) as (keyof AvatarConfig)[]).every((key) => a[key] === b[key]);

/** Diagnóstico: `?testAvatarClip=Talking%20on%20Phone` toca um clipe fixo do GLB de teste. */
const testAvatarClipOverride = () =>
  typeof window === 'undefined'
    ? undefined
    : (new URLSearchParams(window.location.search).get('testAvatarClip') ?? undefined);

/** Diagnóstico: `?testAvatarPose=0` deixa o GLB de teste parado (rest pose). */
const testAvatarPoseEnabled = () =>
  typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('testAvatarPose') !== '0';

/** Ninguém escondido: conjunto vazio compartilhado, para não alocar a cada sincronização. */
const NO_HIDDEN: ReadonlySet<string> = new Set();

export function createAvatars(scene: Scene, shadows: ShadowGenerator, intervalMs: number): Avatars {
  const avatars = new Map<string, Avatar>();
  let localId: string | undefined;
  let preview: AvatarConfig | undefined;

  const appearanceOf = (id: string, avatarJson: string) =>
    id === localId && preview ? preview : parseAvatar(avatarJson);

  /**
   * Garante que o modelo montado é o pedido pela aparência. Trocar de modelo descarta o anterior;
   * se o GLB não carregar, o manequim procedural continua visível.
   */
  const syncModel = (id: string, avatar: Avatar, appearance: AvatarConfig) => {
    if (avatar.modelName === appearance.model) {
      // Mesmo modelo: só a aparência mudou (cores, peças).
      void avatar.parts?.apply(appearance);
      return;
    }
    avatar.modelName = appearance.model;
    avatar.model?.dispose();
    avatar.model = undefined;
    avatar.parts?.dispose();
    avatar.parts = undefined;
    const token = ++avatar.modelToken;
    avatar.mannequin.setPlaceholderHidden(false);
    attachAvatarModel(scene, avatar.mannequin.root, shadows, appearance.model)
      .then((model) => {
        if (avatar.modelToken !== token || avatars.get(id) !== avatar) {
          model.dispose();
          return;
        }
        avatar.model = model;
        model.setConnected(avatar.connected);
        const parts = attachAvatarParts(scene, model.root, shadows);
        parts.setConnected(avatar.connected);
        avatar.parts = parts;
        void parts.apply(appearanceOf(id, avatar.avatarJson));
        avatar.mannequin.setPlaceholderHidden(true);
      })
      .catch((error: unknown) => {
        console.warn('Não foi possível carregar o modelo de avatar; usando o manequim.', error);
      });
  };

  const add = (id: string, player: PlayerSnapshot): Avatar => {
    const appearance = appearanceOf(id, player.avatar);
    const mannequin = createMannequin(scene, id, appearance, shadows);
    const avatar: Avatar = {
      mannequin,
      nameTag: createNameTag(scene, id, mannequin.root, player.name, staffTag(player.role)),
      bubble: createSpeechBubble(scene, id, mannequin.root),
      name: player.name,
      role: player.role,
      userId: player.userId,
      buffer: [],
      walk: { phase: 0, intensity: 0 },
      avatarJson: player.avatar,
      action: '',
      connected: true,
      modelToken: 0,
    };
    avatars.set(id, avatar);
    syncModel(id, avatar, appearance);
    return avatar;
  };

  const remove = (id: string) => {
    const avatar = avatars.get(id);
    avatar?.nameTag?.dispose();
    avatar?.bubble?.dispose();
    avatar?.parts?.dispose();
    avatar?.model?.dispose();
    avatar?.mannequin.dispose();
    avatars.delete(id);
  };

  return {
    sync(players, id, now, hidden = NO_HIDDEN) {
      localId = id;
      for (const [playerId, player] of players) {
        // Bloqueio (nos dois sentidos): o servidor avisa quem esconder e o avatar some do mundo,
        // embora o estado continue chegando.
        if (hidden.has(player.userId)) {
          if (avatars.has(playerId)) remove(playerId);
          continue;
        }
        let avatar = avatars.get(playerId);
        if (!avatar) {
          avatar = add(playerId, player);
        } else if (avatar.avatarJson !== player.avatar) {
          avatar.avatarJson = player.avatar;
          if (playerId === localId && preview && sameAvatar(preview, parseAvatar(player.avatar))) {
            preview = undefined;
          }
          const appearance = appearanceOf(playerId, player.avatar);
          avatar.mannequin.applyAvatar(appearance);
          syncModel(playerId, avatar, appearance);
        }
        if (avatar.name !== player.name || avatar.role !== player.role) {
          avatar.name = player.name;
          avatar.role = player.role;
          avatar.nameTag?.setText(player.name, staffTag(player.role));
        }
        avatar.userId = player.userId;
        pushSnapshot(
          avatar.buffer,
          { time: now, x: player.x, z: player.z, heading: player.heading },
          intervalMs,
        );
        avatar.mannequin.setConnected(player.connected);
        avatar.model?.setConnected(player.connected);
        avatar.parts?.setConnected(player.connected);
        avatar.connected = player.connected;
        avatar.action = toAction(player.action);
      }
      for (const playerId of [...avatars.keys()]) {
        if (!players.has(playerId)) remove(playerId);
      }
    },

    update(renderTime, dt) {
      for (const avatar of avatars.values()) {
        avatar.bubble?.update(dt);
        const pose = samplePose(avatar.buffer, renderTime);
        if (!pose) continue;

        const previous = avatar.pose ?? pose;
        const distance = length({ x: pose.x - previous.x, z: pose.z - previous.z });
        avatar.pose = pose;
        // A animação acompanha o deslocamento exibido: parado no servidor = parado na tela.
        avatar.walk = advanceWalk(avatar.walk, distance, dt);
        avatar.mannequin.place({ x: pose.x, z: pose.z }, pose.heading);
        const limbs =
          avatar.action === ''
            ? walkPose(avatar.walk)
            : actionPose(avatar.action, renderTime / 1000);
        avatar.mannequin.applyPose(limbs);
        if (testAvatarPoseEnabled()) {
          const clip = motionClip(
            avatar.modelName ?? 'masculine',
            avatar.action,
            avatar.walk.intensity > 0.05,
          );
          avatar.model?.applyMotion(limbs, testAvatarClipOverride() ?? clip);
          avatar.parts?.applyPose(limbs);
        }
      }
    },

    positionOf(id) {
      const pose = avatars.get(id)?.pose;
      return pose && { x: pose.x, z: pose.z };
    },

    say(userId, text) {
      for (const avatar of avatars.values()) {
        if (avatar.userId === userId) {
          avatar.bubble?.show(text);
          return;
        }
      }
    },

    previewLocal(avatar) {
      preview = avatar ?? undefined;
      const local = localId === undefined ? undefined : avatars.get(localId);
      if (local && localId) {
        const appearance = appearanceOf(localId, local.avatarJson);
        local.mannequin.applyAvatar(appearance);
        syncModel(localId, local, appearance);
      }
    },

    meshCount() {
      let total = 0;
      for (const avatar of avatars.values()) {
        const body = avatar.model?.meshCount ?? avatar.mannequin.meshes.length;
        total += body + (avatar.parts?.meshCount() ?? 0);
      }
      return total;
    },

    clear() {
      for (const id of [...avatars.keys()]) remove(id);
    },
  };
}
