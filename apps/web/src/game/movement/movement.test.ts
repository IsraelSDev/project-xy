import { describe, expect, it } from 'vitest';
import { resolveCollisions } from './collision';
import type { Box2 } from './geometry';
import {
  DEFAULT_MOVEMENT,
  stepMovement,
  turnTowards,
  worldDirection,
  wrapAngle,
  type MovementState,
} from './movement';

const ORIGIN: MovementState = { position: { x: 0, z: 0 }, heading: 0 };
const LOOKING_NORTH = { x: 0, z: 1 };
const FORWARD = { x: 0, z: 1 };

describe('worldDirection', () => {
  it('frente segue a câmera', () => {
    expect(worldDirection({ axis: FORWARD, cameraForward: { x: 1, z: 0 } })).toEqual({
      x: 1,
      z: 0,
    });
  });

  it('direita fica a +X quando a câmera olha para +Z', () => {
    const direction = worldDirection({ axis: { x: 1, z: 0 }, cameraForward: LOOKING_NORTH });
    expect(direction.x).toBeCloseTo(1);
    expect(direction.z).toBeCloseTo(0);
  });

  it('diagonal é normalizada (não anda mais rápido)', () => {
    const direction = worldDirection({ axis: { x: 1, z: 1 }, cameraForward: LOOKING_NORTH });
    expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1);
  });
});

describe('stepMovement', () => {
  it('sem intenção, não muda nada', () => {
    const next = stepMovement(
      ORIGIN,
      { axis: { x: 0, z: 0 }, cameraForward: LOOKING_NORTH },
      1,
      [],
    );
    expect(next).toBe(ORIGIN);
  });

  it('anda na velocidade configurada', () => {
    const next = stepMovement(ORIGIN, { axis: FORWARD, cameraForward: LOOKING_NORTH }, 0.5, []);
    expect(next.position.x).toBeCloseTo(0);
    expect(next.position.z).toBeCloseTo(DEFAULT_MOVEMENT.speed * 0.5);
  });

  it('gira gradualmente em direção ao movimento', () => {
    const input = { axis: { x: 1, z: 0 }, cameraForward: LOOKING_NORTH };
    const afterOneFrame = stepMovement(ORIGIN, input, 1 / 60, []);
    expect(afterOneFrame.heading).toBeGreaterThan(0);
    expect(afterOneFrame.heading).toBeLessThan(Math.PI / 2);

    const afterOneSecond = stepMovement(ORIGIN, input, 1, []);
    expect(afterOneSecond.heading).toBeCloseTo(Math.PI / 2);
  });

  it('para na parede em vez de atravessar, mesmo com quadro longo', () => {
    const wall: Box2 = { minX: -5, maxX: 5, minZ: 1, maxZ: 1.3 };
    const next = stepMovement(ORIGIN, { axis: FORWARD, cameraForward: LOOKING_NORTH }, 3, [wall]);
    expect(next.position.z).toBeCloseTo(1 - DEFAULT_MOVEMENT.radius);
  });

  it('desliza ao longo da parede quando anda na diagonal', () => {
    const wall: Box2 = { minX: -5, maxX: 5, minZ: 0.4, maxZ: 0.7 };
    const next = stepMovement(ORIGIN, { axis: { x: 1, z: 1 }, cameraForward: LOOKING_NORTH }, 1, [
      wall,
    ]);
    expect(next.position.z).toBeLessThanOrEqual(0.4 - DEFAULT_MOVEMENT.radius + 1e-6);
    expect(next.position.x).toBeGreaterThan(1);
  });
});

describe('resolveCollisions', () => {
  const box: Box2 = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };

  it('não mexe em quem está longe', () => {
    expect(resolveCollisions({ x: -1, z: 1 }, 0.35, [box])).toEqual({ x: -1, z: 1 });
  });

  it('empurra para fora pela face mais próxima quando o centro está dentro', () => {
    expect(resolveCollisions({ x: 0.1, z: 1 }, 0.35, [box])).toEqual({ x: -0.35, z: 1 });
  });

  it('sai de um canto entre duas caixas', () => {
    const other: Box2 = { minX: -2, maxX: 0, minZ: 2, maxZ: 4 };
    const result = resolveCollisions({ x: -0.1, z: 1.9 }, 0.35, [box, other]);
    for (const obstacle of [box, other]) {
      const closestX = Math.min(Math.max(result.x, obstacle.minX), obstacle.maxX);
      const closestZ = Math.min(Math.max(result.z, obstacle.minZ), obstacle.maxZ);
      expect(Math.hypot(result.x - closestX, result.z - closestZ)).toBeGreaterThanOrEqual(
        0.35 - 1e-6,
      );
    }
  });
});

describe('ângulos', () => {
  it('wrapAngle normaliza para (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(Math.PI / 2 + 4 * Math.PI)).toBeCloseTo(Math.PI / 2);
  });

  it('turnTowards usa o menor arco', () => {
    // De 170° para -170°: o caminho curto passa por 180°, não por 0°.
    const from = (170 * Math.PI) / 180;
    const to = (-170 * Math.PI) / 180;
    const next = turnTowards(from, to, 0.05);
    expect(Math.abs(next)).toBeGreaterThan(from);
  });
});
