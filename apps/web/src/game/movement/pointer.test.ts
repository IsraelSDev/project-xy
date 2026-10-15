import { describe, expect, it } from 'vitest';
import { approachDirection } from './pointer';

describe('approachDirection', () => {
  it('aponta (normalizado) para o alvo quando está longe', () => {
    const { direction, arrived } = approachDirection({ x: 3, z: 4 }, { x: 0, z: 0 });
    expect(arrived).toBe(false);
    expect(direction.x).toBeCloseTo(0.6);
    expect(direction.z).toBeCloseTo(0.8);
    expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1);
  });

  it('para e avisa que chegou dentro do raio', () => {
    expect(approachDirection({ x: 0.1, z: 0.1 }, { x: 0, z: 0 })).toEqual({
      direction: { x: 0, z: 0 },
      arrived: true,
    });
  });

  it('no limite do raio, já conta como chegado', () => {
    const { arrived } = approachDirection({ x: 0.35, z: 0 }, { x: 0, z: 0 });
    expect(arrived).toBe(true);
  });

  it('usa o raio informado', () => {
    const { arrived } = approachDirection({ x: 2, z: 0 }, { x: 0, z: 0 }, 3);
    expect(arrived).toBe(true);
  });
});
