import { describe, expect, it } from 'vitest';
import { combineAxis } from './axis';

describe('eixo de movimento', () => {
  it('soma teclado e joystick', () => {
    expect(combineAxis({ x: 0, z: 0.5 }, { x: 0.5, z: 0 })).toEqual({ x: 0.5, z: 0.5 });
  });

  it('limita o módulo a 1 (diagonal não acelera)', () => {
    const diagonal = combineAxis({ x: 1, z: 1 }, { x: 1, z: 1 });
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1, 5);
  });

  it('sem entrada fica parado', () => {
    expect(combineAxis({ x: 0, z: 0 }, { x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
  });

  it('joystick parcial mantém a proporção', () => {
    expect(combineAxis({ x: 0, z: 0 }, { x: 0.5, z: -0.25 })).toEqual({ x: 0.5, z: -0.25 });
  });
});
