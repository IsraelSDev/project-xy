import type { Vec2 } from '@3dx/game-core';

/**
 * Soma as entradas de movimento (teclado + joystick virtual) limitando o módulo a 1: na diagonal o
 * avatar não anda mais rápido, e o joystick pode complementar uma tecla.
 */
export function combineAxis(...axes: readonly Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const axis of axes) {
    x += axis.x;
    z += axis.z;
  }
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}
