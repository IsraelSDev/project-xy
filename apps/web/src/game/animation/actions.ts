import type { Pose } from './walk-cycle';

/** Poses procedurais das ações (PLACEHOLDER até existirem animações de esqueleto). Usam as mesmas
 * articulações da convenção do manequim. `seconds` é um relógio contínuo para os movimentos
 * cíclicos (aceno, dança).
 */
export function actionPose(action: 'sit' | 'wave' | 'dance', seconds: number): Pose {
  switch (action) {
    case 'sit':
      // Coxas na horizontal, canelas para baixo; o quadril desce até o assento do sofá.
      return {
        leftHip: 1.45,
        rightHip: 1.45,
        leftKnee: 1.45,
        rightKnee: 1.45,
        leftShoulder: 0.25,
        rightShoulder: 0.25,
        leftElbow: 0.7,
        rightElbow: 0.7,
        bob: -0.42,
      };
    case 'wave': {
      const wiggle = Math.sin(seconds * 10);
      return {
        leftHip: 0,
        rightHip: 0,
        leftKnee: 0,
        rightKnee: 0,
        leftShoulder: 0,
        rightShoulder: 2.7,
        leftElbow: 0.15,
        rightElbow: 0.55 + 0.35 * wiggle,
        bob: 0,
      };
    }
    case 'dance': {
      const beat = seconds * Math.PI * 4; // 2 batidas por segundo
      const sway = Math.sin(beat);
      return {
        leftHip: 0.25 * sway,
        rightHip: -0.25 * sway,
        leftKnee: 0.35 * Math.max(0, sway),
        rightKnee: 0.35 * Math.max(0, -sway),
        leftShoulder: 1.6 + 0.7 * sway,
        rightShoulder: 1.6 - 0.7 * sway,
        leftElbow: 0.9,
        rightElbow: 0.9,
        bob: 0.04 * Math.abs(Math.cos(beat)),
      };
    }
  }
}
