import { describe, expect, it } from 'vitest';
import { axisFromKeys } from './keyboard';

describe('axisFromKeys', () => {
  it('nenhuma tecla = parado', () => {
    expect(axisFromKeys(new Set())).toEqual({ x: 0, z: 0 });
  });

  it('WASD e setas mapeiam para os mesmos eixos', () => {
    expect(axisFromKeys(new Set(['KeyW']))).toEqual({ x: 0, z: 1 });
    expect(axisFromKeys(new Set(['ArrowUp']))).toEqual({ x: 0, z: 1 });
    expect(axisFromKeys(new Set(['KeyA', 'KeyS']))).toEqual({ x: -1, z: -1 });
    expect(axisFromKeys(new Set(['ArrowRight']))).toEqual({ x: 1, z: 0 });
  });

  it('teclas opostas se anulam e a mesma direção não soma', () => {
    expect(axisFromKeys(new Set(['KeyW', 'KeyS']))).toEqual({ x: 0, z: 0 });
    expect(axisFromKeys(new Set(['KeyW', 'ArrowUp']))).toEqual({ x: 0, z: 1 });
  });

  it('ignora teclas sem mapeamento', () => {
    expect(axisFromKeys(new Set(['KeyQ', 'Space']))).toEqual({ x: 0, z: 0 });
  });
});
