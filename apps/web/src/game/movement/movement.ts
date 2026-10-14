import { resolveCollisions } from './collision';
import { length, normalize, type Box2, type Vec2 } from './geometry';

export interface MovementState {
  position: Vec2;
  /** Direção para onde o avatar olha, em radianos. 0 = +Z; positivo gira em direção a +X. */
  heading: number;
}

export interface MovementInput {
  /** Intenção do jogador: x = direita, z = frente, cada eixo em [-1, 1]. */
  axis: Vec2;
  /** Frente da câmera projetada no chão. A intenção é relativa a ela. */
  cameraForward: Vec2;
}

export interface MovementConfig {
  /** Velocidade de caminhada (m/s). */
  speed: number;
  /** Velocidade máxima de giro (rad/s). */
  turnSpeed: number;
  /** Raio do corpo para colisão (m). */
  radius: number;
}

export const DEFAULT_MOVEMENT: MovementConfig = { speed: 2, turnSpeed: 10, radius: 0.35 };

/** Passo máximo de simulação (s). Quadros mais longos são subdivididos para não atravessar paredes. */
const MAX_STEP = 1 / 30;

/**
 * Avança o movimento do avatar em `dt` segundos. Função pura: não conhece Babylon nem React,
 * para poder ser reaproveitada pela validação no servidor (Fase 2).
 */
export function stepMovement(
  state: MovementState,
  input: MovementInput,
  dt: number,
  obstacles: readonly Box2[],
  config: MovementConfig = DEFAULT_MOVEMENT,
): MovementState {
  const direction = worldDirection(input);
  if (length(direction) === 0 || dt <= 0) return state;

  const targetHeading = Math.atan2(direction.x, direction.z);
  let { position, heading } = state;
  let remaining = dt;

  while (remaining > 0) {
    const step = Math.min(remaining, MAX_STEP);
    remaining -= step;

    heading = turnTowards(heading, targetHeading, config.turnSpeed * step);
    position = resolveCollisions(
      {
        x: position.x + direction.x * config.speed * step,
        z: position.z + direction.z * config.speed * step,
      },
      config.radius,
      obstacles,
    );
  }

  return { position, heading };
}

/** Converte a intenção relativa à câmera em uma direção no mundo, com módulo 0 ou 1. */
export function worldDirection({ axis, cameraForward }: MovementInput): Vec2 {
  const forward = normalize(cameraForward);
  // Sistema de mão esquerda do Babylon (Y para cima): a direita de (fx, fz) é (fz, -fx).
  const right = { x: forward.z, z: -forward.x };
  return normalize({
    x: right.x * axis.x + forward.x * axis.z,
    z: right.z * axis.x + forward.z * axis.z,
  });
}

/** Gira `current` em direção a `target` pelo menor arco, limitado a `maxDelta` radianos. */
export function turnTowards(current: number, target: number, maxDelta: number): number {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxDelta) return wrapAngle(target);
  return wrapAngle(current + Math.sign(delta) * maxDelta);
}

/** Normaliza um ângulo para o intervalo (-π, π]. */
export function wrapAngle(angle: number): number {
  const wrapped = angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
