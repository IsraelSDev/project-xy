import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec2 } from '../movement/geometry';

export interface ThirdPersonCamera {
  camera: ArcRotateCamera;
  /** Aproxima o alvo da câmera de `focus` com suavização exponencial (independe do FPS). */
  follow(focus: Vector3, dt: number): void;
  /** Frente da câmera projetada no chão, usada para mover o avatar relativo à visão. */
  forward(): Vec2;
}

/** Rapidez com que a câmera alcança o avatar (1/s). Mais alto = mais colado, menos suave. */
const FOLLOW_RATE = 10;

/**
 * Câmera orbital em terceira pessoa: o jogador gira arrastando o mouse e aproxima com a roda.
 * Começa atrás do avatar olhando para +Z.
 */
export function createThirdPersonCamera(scene: Scene, focus: Vector3): ThirdPersonCamera {
  const camera = new ArcRotateCamera(
    'third-person-camera',
    -Math.PI / 2,
    1.2,
    4.5,
    focus.clone(),
    scene,
  );
  camera.lowerRadiusLimit = 2.2;
  camera.upperRadiusLimit = 9;
  camera.lowerBetaLimit = 0.35;
  camera.upperBetaLimit = 1.5;
  camera.minZ = 0.1;
  camera.wheelDeltaPercentage = 0.01;
  // O alvo é controlado pelo avatar: sem pan, e as setas do teclado ficam para o movimento.
  camera.panningSensibility = 0;
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

  return {
    camera,
    follow(target, dt) {
      const t = 1 - Math.exp(-FOLLOW_RATE * dt);
      camera.target.addInPlace(target.subtract(camera.target).scaleInPlace(t));
    },
    forward() {
      // A câmera fica em target + (cos α, sin α) no plano; a frente aponta no sentido oposto.
      // Calculado do ângulo, e não de `camera.position`, que só é atualizada no render.
      return { x: -Math.cos(camera.alpha), z: -Math.sin(camera.alpha) };
    },
  };
}
