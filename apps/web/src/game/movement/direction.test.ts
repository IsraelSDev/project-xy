import { describe, expect, it } from 'vitest';
import { worldDirection } from './direction';

const FORWARD = { x: 0, z: 1 };
const LOOKING_NORTH = { x: 0, z: 1 };

describe('worldDirection', () => {
  it('frente segue a câmera', () => {
    expect(worldDirection(FORWARD, { x: 1, z: 0 })).toEqual({ x: 1, z: 0 });
  });

  it('direita fica a +X quando a câmera olha para +Z', () => {
    const direction = worldDirection({ x: 1, z: 0 }, LOOKING_NORTH);
    expect(direction.x).toBeCloseTo(1);
    expect(direction.z).toBeCloseTo(0);
  });

  it('diagonal é normalizada (não anda mais rápido)', () => {
    const direction = worldDirection({ x: 1, z: 1 }, LOOKING_NORTH);
    expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1);
  });

  it('sem intenção, direção nula', () => {
    expect(worldDirection({ x: 0, z: 0 }, LOOKING_NORTH)).toEqual({ x: 0, z: 0 });
  });
});
