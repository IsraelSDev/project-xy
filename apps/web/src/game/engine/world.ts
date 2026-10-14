import { STATE_PATCH_INTERVAL_MS } from '@3dx/contracts';
import { SPAWN } from '@3dx/game-core';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { createThirdPersonCamera, type ThirdPersonCamera } from '../camera/third-person-camera';
import { createAvatars, type PlayerSnapshot } from '../characters/avatars';
import { MANNEQUIN_FOCUS_HEIGHT } from '../characters/mannequin';
import { buildLounge } from '../rendering/lounge';

/**
 * Os avatares são exibidos este tanto no passado: com dois intervalos de atualização no buffer,
 * sempre há um snapshot de cada lado para interpolar, mesmo com um pouco de atraso na rede.
 */
export const INTERPOLATION_DELAY_MS = 2 * STATE_PATCH_INTERVAL_MS;

export interface World {
  camera: ThirdPersonCamera;
  /** Aplica o estado autoritativo do servidor. `now` em ms, no mesmo relógio de `update`. */
  syncPlayers(players: ReadonlyMap<string, PlayerSnapshot>, localId: string, now: number): void;
  /** Remove todos os avatares (fim da sessão). */
  clearPlayers(): void;
  /** Avança interpolação, animação e câmera. */
  update(dt: number, now: number): void;
}

/** Monta o lounge, luzes e câmera numa cena já criada. Não depende de canvas nem de rede. */
export function createWorld(scene: Scene): World {
  scene.clearColor = new Color4(0.03, 0.03, 0.05, 1);
  scene.ambientColor = new Color3(0.2, 0.18, 0.2);

  const ambient = new HemisphericLight('ambient-light', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.45;
  ambient.groundColor = new Color3(0.15, 0.12, 0.14);

  const key = new DirectionalLight('key-light', new Vector3(-0.35, -1, 0.25), scene);
  key.position = new Vector3(5, 12, -4);
  key.intensity = 0.55;

  const barLight = new PointLight('bar-light', new Vector3(-2, 2.8, 4.5), scene);
  barLight.diffuse = new Color3(1, 0.7, 0.4);
  barLight.intensity = 0.6;
  barLight.range = 8;

  const danceLight = new PointLight('dance-light', new Vector3(-4.5, 2.8, -4.2), scene);
  danceLight.diffuse = new Color3(0.7, 0.3, 1);
  danceLight.intensity = 0.7;
  danceLight.range = 7;

  const shadows = new ShadowGenerator(1024, key);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.002;

  const { shadowCasters } = buildLounge(scene);
  shadowCasters.forEach((mesh) => {
    shadows.addShadowCaster(mesh);
  });

  const avatars = createAvatars(scene, shadows, STATE_PATCH_INTERVAL_MS);
  let localId: string | undefined;

  const focus = new Vector3(SPAWN.position.x, MANNEQUIN_FOCUS_HEIGHT, SPAWN.position.z);
  const camera = createThirdPersonCamera(scene, focus);

  return {
    camera,
    syncPlayers(players, id, now) {
      localId = id;
      avatars.sync(players, id, now);
    },
    clearPlayers() {
      localId = undefined;
      avatars.clear();
    },
    update(dt, now) {
      avatars.update(now - INTERPOLATION_DELAY_MS, dt);

      const local = localId === undefined ? undefined : avatars.positionOf(localId);
      if (local) focus.set(local.x, MANNEQUIN_FOCUS_HEIGHT, local.z);
      camera.follow(focus, dt);
    },
  };
}
