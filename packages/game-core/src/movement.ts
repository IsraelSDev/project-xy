import { resolveCollisions } from './collision.ts';
import { length, normalize, type Box2, type Vec2 } from './geometry.ts';

export interface MovementState {
  position: Vec2;
  /** Direção para onde o avatar olha, em radianos. 0 = +Z; positivo gira em direção a +X. */
  heading: number;
}

export interface MovementConfig {
  /** Velocidade de caminhada (m/s). */
  speed: number;
  /** Velocidade máxima de giro (rad/s). */
  turnSpeed: number;
  /** Raio do corpo para colisão (m). */
  radius: number;
}

export const DEFAULT_MOVEMENT: MovementConfig = { speed: 1.35, turnSpeed: 10, radius: 0.35 };

/**
 * Multiplicador de velocidade ao segurar SHIFT (corrida). O cliente só pede a corrida; quem decide
 * se o pedido vale (hoje, só ADMIN) é o servidor, na simulação autoritativa.
 */
export const SPRINT_SPEED_MULTIPLIER = 10;

/** Passo máximo de simulação (s). Quadros mais longos são subdivididos para não atravessar paredes. */
const MAX_STEP = 1 / 30;

/**
 * Avança o movimento do avatar em `dt` segundos na direção `direction` (plano do chão, mundo).
 * A direção é normalizada aqui: o módulo recebido só distingue parado de andando, então quem
 * envia não controla a velocidade. Função pura, usada pelo servidor (autoridade) e pelo cliente.
 * `sprint` aplica `SPRINT_SPEED_MULTIPLIER`; o servidor só passa `true` para quem pode correr.
 */
export function stepMovement(
  state: MovementState,
  direction: Vec2,
  dt: number,
  obstacles: readonly Box2[],
  config: MovementConfig = DEFAULT_MOVEMENT,
  sprint = false,
): MovementState {
  const unit = normalize(direction);
  if (length(unit) === 0 || dt <= 0) return state;

  const speed = config.speed * (sprint ? SPRINT_SPEED_MULTIPLIER : 1);
  // Em velocidade alta (corrida de 10x), 1/30 s já é um salto grande: limita o subpasso à distância
  // do raio do corpo, para continuar detectando colliders finos em vez de atravessá-los.
  const maxStep = Math.min(MAX_STEP, config.radius / speed);
  const targetHeading = Math.atan2(unit.x, unit.z);
  let { position, heading } = state;
  let remaining = dt;

  while (remaining > 0) {
    const step = Math.min(remaining, maxStep);
    remaining -= step;

    heading = turnTowards(heading, targetHeading, config.turnSpeed * step);
    position = resolveCollisions(
      {
        x: position.x + unit.x * speed * step,
        z: position.z + unit.z * speed * step,
      },
      config.radius,
      obstacles,
    );
  }

  return { position, heading };
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
