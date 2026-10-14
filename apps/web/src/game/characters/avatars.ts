import { length, type Vec2 } from '@3dx/game-core';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3 } from '@babylonjs/core/Maths/math.color';
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
}

export interface Avatars {
  /** Sincroniza com o estado do servidor: cria quem entrou, remove quem saiu, guarda snapshots. */
  sync(players: ReadonlyMap<string, PlayerSnapshot>, localId: string, now: number): void;
  /** Posiciona e anima todos no instante `renderTime` (no passado, para haver o que interpolar). */
  update(renderTime: number, dt: number): void;
  /** Posição exibida do avatar `id`, se ele já apareceu. */
  positionOf(id: string): Vec2 | undefined;
  clear(): void;
}

interface Avatar {
  mannequin: Mannequin;
  buffer: Snapshot[];
  walk: WalkState;
  pose?: Pose2;
}

const LOCAL_COLOR = new Color3(0.78, 0.76, 0.74);

/** Cor estável por jogador, para diferenciar os avatares remotos entre si e do local. */
function remoteColor(id: string): Color3 {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Color3.FromHSV(hash % 360, 0.45, 0.85);
}

export function createAvatars(scene: Scene, shadows: ShadowGenerator, intervalMs: number): Avatars {
  const avatars = new Map<string, Avatar>();

  const add = (id: string, isLocal: boolean): Avatar => {
    const mannequin = createMannequin(scene, id, isLocal ? LOCAL_COLOR : remoteColor(id));
    mannequin.meshes.forEach((mesh) => {
      shadows.addShadowCaster(mesh);
    });
    const avatar: Avatar = { mannequin, buffer: [], walk: { phase: 0, intensity: 0 } };
    avatars.set(id, avatar);
    return avatar;
  };

  const remove = (id: string) => {
    const avatar = avatars.get(id);
    if (!avatar) return;
    avatar.mannequin.meshes.forEach((mesh) => {
      shadows.removeShadowCaster(mesh);
    });
    avatar.mannequin.dispose();
    avatars.delete(id);
  };

  return {
    sync(players, localId, now) {
      for (const [id, player] of players) {
        const avatar = avatars.get(id) ?? add(id, id === localId);
        pushSnapshot(
          avatar.buffer,
          { time: now, x: player.x, z: player.z, heading: player.heading },
          intervalMs,
        );
        avatar.mannequin.setConnected(player.connected);
      }
      for (const id of [...avatars.keys()]) {
        if (!players.has(id)) remove(id);
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

    clear() {
      for (const id of [...avatars.keys()]) remove(id);
    },
  };
}
