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
