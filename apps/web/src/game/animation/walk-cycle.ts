/**
 * Ciclo de caminhada procedural para o manequim placeholder. Substituído por animações
 * de esqueleto quando houver um modelo licenciado (Fase 4).
 */

/** Ângulos em radianos. Positivo = membro à frente do corpo; joelho/cotovelo positivo = dobrado. */
export interface Pose {
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  leftShoulder: number;
  rightShoulder: number;
  elbow: number;
  /** Deslocamento vertical do quadril (m). */
  bob: number;
}

export interface WalkState {
  /** Fase do ciclo em radianos; 2π = um passo de cada perna. */
  phase: number;
  /** 0 = parado, 1 = caminhada plena. Suavizado para não mudar de pose num salto. */
  intensity: number;
}

/** Distância percorrida em um ciclo completo (dois passos). */
const STRIDE_LENGTH = 1.4;
/** Rapidez com que a intensidade acompanha o movimento (1/s). */
const BLEND_RATE = 8;

/** Avança o ciclo pela distância andada no quadro, o que evita o pé "patinar" no chão. */
export function advanceWalk(state: WalkState, distance: number, dt: number): WalkState {
  const target = distance > 1e-6 ? 1 : 0;
  const blend = 1 - Math.exp(-BLEND_RATE * dt);
  return {
    phase: (state.phase + (distance / STRIDE_LENGTH) * 2 * Math.PI) % (2 * Math.PI),
    intensity: state.intensity + (target - state.intensity) * blend,
  };
}

export function walkPose({ phase, intensity }: WalkState): Pose {
  const swing = Math.sin(phase) * 0.5 * intensity;
  // A perna dobra o joelho enquanto avança (fase de balanço).
  const leftKnee = Math.max(0, Math.cos(phase)) * 0.8 * intensity;
  const rightKnee = Math.max(0, -Math.cos(phase)) * 0.8 * intensity;
  return {
    leftHip: swing,
    rightHip: -swing,
    leftKnee,
    rightKnee,
    // Braços balançam ao contrário das pernas do mesmo lado.
    leftShoulder: -swing * 0.8,
    rightShoulder: swing * 0.8,
    elbow: 0.15 + 0.25 * intensity,
    // Quadril mais alto com as pernas juntas, mais baixo com as pernas abertas.
    bob: 0.025 * intensity * Math.cos(2 * phase),
  };
}
