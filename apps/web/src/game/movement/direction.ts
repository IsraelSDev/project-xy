import { normalize, type Vec2 } from '@3dx/game-core';

/**
 * Converte a intenção do jogador, relativa à câmera (x = direita, z = frente), em direção no
 * mundo com módulo 0 ou 1. `cameraForward` é a frente da câmera projetada no chão.
 */
export function worldDirection(axis: Vec2, cameraForward: Vec2): Vec2 {
  const forward = normalize(cameraForward);
  // Sistema de mão esquerda do Babylon (Y para cima): a direita de (fx, fz) é (fz, -fx).
  const right = { x: forward.z, z: -forward.x };
  return normalize({
    x: right.x * axis.x + forward.x * axis.z,
    z: right.z * axis.x + forward.z * axis.z,
  });
}
