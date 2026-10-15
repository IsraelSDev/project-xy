import { parseAvatar, type AvatarConfig, type PlayerAction } from '@3dx/contracts';
import { length, type Vec2 } from '@3dx/game-core';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Scene } from '@babylonjs/core/scene';
import { actionPose } from '../animation/actions';
import { advanceWalk, walkPose, type WalkState } from '../animation/walk-cycle';
import { pushSnapshot, samplePose, type Pose2, type Snapshot } from '../network/snapshot-buffer';
import { attachTestAvatar, type TestAvatarAttachment } from './test-avatar';
import { createMannequin, type Mannequin } from './mannequin';

/** O que o cliente usa do estado de cada jogador (subconjunto de `PlayerState`). */
export interface PlayerSnapshot {
  x: number;
  z: number;
  heading: number;
  connected: boolean;
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
   * `hidden` (ids de usuário bloqueados pelo jogador local) some do mundo até ser desbloqueado.
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
  testModel?: TestAvatarAttachment;
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

const testAvatarEnabled = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('testAvatar') === '1';

/** Ninguém escondido: conjunto vazio compartilhado, para não alocar a cada sincronização. */
const NO_HIDDEN: ReadonlySet<string> = new Set();

export function createAvatars(scene: Scene, shadows: ShadowGenerator, intervalMs: number): Avatars {
  const avatars = new Map<string, Avatar>();
  let localId: string | undefined;
  let preview: AvatarConfig | undefined;

  const appearanceOf = (id: string, avatarJson: string) =>
    id === localId && preview ? preview : parseAvatar(avatarJson);

  const add = (id: string, avatarJson: string): Avatar => {
    const mannequin = createMannequin(scene, id, appearanceOf(id, avatarJson), shadows);
    const avatar: Avatar = {
      mannequin,
      buffer: [],
      walk: { phase: 0, intensity: 0 },
      avatarJson,
      action: '',
      connected: true,
    };
    avatars.set(id, avatar);
    if (id === localId && testAvatarEnabled()) {
      void attachTestAvatar(scene, mannequin.root, shadows)
        .then((model) => {
          if (avatars.get(id) !== avatar) {
            model.dispose();
            return;
          }
          avatar.testModel = model;
          model.setConnected(avatar.connected);
          mannequin.setPlaceholderHidden(true);
        })
        .catch((error: unknown) => {
          console.warn('Não foi possível carregar o avatar GLB de teste.', error);
        });
    }
    return avatar;
  };

  const remove = (id: string) => {
    const avatar = avatars.get(id);
    avatar?.testModel?.dispose();
    avatar?.mannequin.dispose();
    avatars.delete(id);
  };

  return {
    sync(players, id, now, hidden = NO_HIDDEN) {
      localId = id;
      for (const [playerId, player] of players) {
        // Quem o jogador local bloqueou some do mundo (o servidor continua mandando o estado).
        if (hidden.has(player.userId)) {
          if (avatars.has(playerId)) remove(playerId);
          continue;
        }
        let avatar = avatars.get(playerId);
        if (!avatar) {
          avatar = add(playerId, player.avatar);
        } else if (avatar.avatarJson !== player.avatar) {
          avatar.avatarJson = player.avatar;
          if (playerId === localId && preview && sameAvatar(preview, parseAvatar(player.avatar))) {
            preview = undefined;
          }
          avatar.mannequin.applyAvatar(appearanceOf(playerId, player.avatar));
        }
        pushSnapshot(
          avatar.buffer,
          { time: now, x: player.x, z: player.z, heading: player.heading },
          intervalMs,
        );
        avatar.mannequin.setConnected(player.connected);
        avatar.testModel?.setConnected(player.connected);
        avatar.connected = player.connected;
        avatar.action = toAction(player.action);
      }
      for (const playerId of [...avatars.keys()]) {
        if (!players.has(playerId)) remove(playerId);
      }
    },

    update(renderTime, dt) {
      for (const avatar of avatars.values()) {
        const pose = samplePose(avatar.buffer, renderTime);
        if (!pose) continue;

        const previous = avatar.pose ?? pose;
        const distance = length({ x: pose.x - previous.x, z: pose.z - previous.z });
        avatar.pose = pose;
        // A animação acompanha o deslocamento exibido: parado no servidor = parado na tela.
        avatar.walk = advanceWalk(avatar.walk, distance, dt);
        avatar.mannequin.place({ x: pose.x, z: pose.z }, pose.heading);
        avatar.mannequin.applyPose(
          avatar.action === ''
            ? walkPose(avatar.walk)
            : actionPose(avatar.action, renderTime / 1000),
        );
      }
    },

    positionOf(id) {
      const pose = avatars.get(id)?.pose;
      return pose && { x: pose.x, z: pose.z };
    },

    previewLocal(avatar) {
      preview = avatar ?? undefined;
      const local = localId === undefined ? undefined : avatars.get(localId);
      if (local && localId) local.mannequin.applyAvatar(appearanceOf(localId, local.avatarJson));
    },

    meshCount() {
      let total = 0;
      for (const avatar of avatars.values()) {
        total += avatar.testModel?.meshCount ?? avatar.mannequin.meshes.length;
      }
      return total;
    },

    clear() {
      for (const id of [...avatars.keys()]) remove(id);
    },
  };
}
