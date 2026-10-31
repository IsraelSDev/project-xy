import { VOICE_FULL_VOLUME_DISTANCE_M, VOICE_HEAR_DISTANCE_M } from '@3dx/contracts';

/**
 * Ganho da voz pela distância: 1 até {@link VOICE_FULL_VOLUME_DISTANCE_M} e 0 a partir de
 * {@link VOICE_HEAR_DISTANCE_M}, com queda suave (curva ^1.5) para a voz sumir sem "cortar".
 */
export function voiceGain(distance: number): number {
  if (distance <= VOICE_FULL_VOLUME_DISTANCE_M) return 1;
  if (distance >= VOICE_HEAR_DISTANCE_M) return 0;
  const t =
    (distance - VOICE_FULL_VOLUME_DISTANCE_M) /
    (VOICE_HEAR_DISTANCE_M - VOICE_FULL_VOLUME_DISTANCE_M);
  return Math.pow(1 - t, 1.5);
}

/**
 * Panorama estéreo: -1 à esquerda, +1 à direita, 0 à frente/atrás. `forward` é a direção em que o
 * ouvinte olha (x, z) e `toPeer` a direção horizontal até quem fala (já normalizada).
 */
export function panFor(
  toPeer: { x: number; z: number },
  forward: { x: number; z: number },
): number {
  // Direita do ouvinte = frente × cima (y): para `forward` (x, z) a direita é (+z, -x) no plano.
  const pan = forward.x * toPeer.z - forward.z * toPeer.x;
  return Math.max(-1, Math.min(1, pan));
}

/** `true` quando o nível do áudio passa do limiar (indica quem está falando). */
export function isSpeaking(samples: Uint8Array, threshold = 0.06): boolean {
  if (samples.length === 0) return false;
  let sum = 0;
  for (const value of samples) {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / samples.length) > threshold;
}
