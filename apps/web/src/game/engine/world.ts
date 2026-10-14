import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { advanceWalk, walkPose, type WalkState } from '../animation/walk-cycle';
import { createThirdPersonCamera, type ThirdPersonCamera } from '../camera/third-person-camera';
import { createMannequin, MANNEQUIN_FOCUS_HEIGHT } from '../characters/mannequin';
import {
  length,
  OBSTACLES,
  SPAWN,
  stepMovement,
  type MovementState,
  type Vec2,
} from '@3dx/game-core';
import { worldDirection } from '../movement/direction';
import { buildLounge } from '../rendering/lounge';

export interface World {
  camera: ThirdPersonCamera;
  /** Estado atual do avatar local (somente leitura para quem chama). */
  readonly avatar: MovementState;
  /** Avança a simulação local em `dt` segundos com a intenção de movimento `axis`. */
  update(dt: number, axis: Vec2): void;
}

/** Monta o lounge, o avatar local, luzes e câmera numa cena já criada. Não depende de canvas. */
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

  const mannequin = createMannequin(scene);
  mannequin.meshes.forEach((mesh) => {
    shadows.addShadowCaster(mesh);
  });

  let avatar: MovementState = SPAWN;
  let walk: WalkState = { phase: 0, intensity: 0 };
  const focus = new Vector3();
  const focusOf = (state: MovementState) =>
    focus.set(state.position.x, MANNEQUIN_FOCUS_HEIGHT, state.position.z);

  mannequin.place(avatar.position, avatar.heading);
  mannequin.applyPose(walkPose(walk));
  const camera = createThirdPersonCamera(scene, focusOf(avatar));

  return {
    camera,
    get avatar() {
      return avatar;
    },
    update(dt, axis) {
      const direction = worldDirection(axis, camera.forward());
      const next = stepMovement(avatar, direction, dt, OBSTACLES);
      const distance = length({
        x: next.position.x - avatar.position.x,
        z: next.position.z - avatar.position.z,
      });
      avatar = next;
      walk = advanceWalk(walk, distance, dt);

      mannequin.place(avatar.position, avatar.heading);
      mannequin.applyPose(walkPose(walk));
      camera.follow(focusOf(avatar), dt);
    },
  };
}
