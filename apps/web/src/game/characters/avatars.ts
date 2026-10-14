import { parseAvatar, type AvatarConfig } from '@3dx/contracts';
import { length, type Vec2 } from '@3dx/game-core';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Scene } from '@babylonjs/core/scene';
import { advanceWalk, walkPose, type WalkState } from '../animation/walk-cycle';
import { pushSnapshot, samplePose, type Pose2, type Snapshot } from '../network/snapshot-buffer';
import { createMannequin, type Mannequin } from './mannequin';

/** O que o cliente usa do estado de cada jogador (subconjunto de `PlayerState`). */
export interface PlayerSnapshot {
  x: number;
  z: number;
  heading: number;
  connected: boolean;
  /** AvatarConfig em JSON, como veio do servidor. */
  avatar: string;
}

export interface Avatars {
  /** Sincroniza com o estado do servidor: cria quem entrou, remove quem saiu, guarda snapshots. */
  sync(players: ReadonlyMap<string, PlayerSnapshot>, localId: string, now: number): void;
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
  buffer: Snapshot[];
  walk: WalkState;
  pose?: Pose2;
  /** Último JSON de avatar recebido do servidor. */
  avatarJson: string;
}

const sameAvatar = (a: AvatarConfig, b: AvatarConfig) =>
  (Object.keys(a) as (keyof AvatarConfig)[]).every((key) => a[key] === b[key]);

export function createAvatars(scene: Scene, shadows: ShadowGenerator, intervalMs: number): Avatars {
  const avatars = new Map<string, Avatar>();
  let localId: string | undefined;
  let preview: AvatarConfig | undefined;

  const appearanceOf = (id: string, avatarJson: string) =>
    id === localId && preview ? preview : parseAvatar(avatarJson);

  const add = (id: string, avatarJson: string): Avatar => {
    const mannequin = createMannequin(scene, id, appearanceOf(id, avatarJson), shadows);
    const avatar: Avatar = { mannequin, buffer: [], walk: { phase: 0, intensity: 0 }, avatarJson };
    avatars.set(id, avatar);
    return avatar;
  };

  const remove = (id: string) => {
    avatars.get(id)?.mannequin.dispose();
    avatars.delete(id);
  };

  return {
    sync(players, id, now) {
      localId = id;
      for (const [playerId, player] of players) {
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
        avatar.mannequin.applyPose(walkPose(avatar.walk));
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
      for (const avatar of avatars.values()) total += avatar.mannequin.meshes.length;
      return total;
    },

    clear() {
      for (const id of [...avatars.keys()]) remove(id);
    },
  };
}
