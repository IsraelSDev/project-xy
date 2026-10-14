import { describe, expect, it } from 'vitest';
import { advanceWalk, walkPose } from './walk-cycle';

describe('walkPose', () => {
  it('parado (intensidade 0) é a pose neutra, em qualquer fase', () => {
    const pose = walkPose({ phase: 1.3, intensity: 0 });
    expect(pose.leftHip).toBeCloseTo(0);
    expect(pose.rightHip).toBeCloseTo(0);
    expect(pose.leftKnee).toBeCloseTo(0);
    expect(pose.bob).toBeCloseTo(0);
  });

  it('pernas opostas entre si e braços opostos à perna do mesmo lado', () => {
    const pose = walkPose({ phase: Math.PI / 2, intensity: 1 });
    expect(pose.leftHip).toBeGreaterThan(0);
    expect(pose.rightHip).toBeCloseTo(-pose.leftHip);
    expect(Math.sign(pose.leftShoulder)).toBe(-Math.sign(pose.leftHip));
  });
});

describe('advanceWalk', () => {
  it('a fase avança com a distância, não com o tempo', () => {
    const start = { phase: 0, intensity: 1 };
    expect(advanceWalk(start, 0, 1).phase).toBe(0);
    expect(advanceWalk(start, 0.35, 1 / 60).phase).toBeCloseTo(Math.PI / 2);
  });

  it('intensidade sobe ao andar e volta a zero parado, sem saltos', () => {
    let state = { phase: 0, intensity: 0 };
    state = advanceWalk(state, 0.03, 1 / 60);
    expect(state.intensity).toBeGreaterThan(0);
    expect(state.intensity).toBeLessThan(0.5);

    for (let frame = 0; frame < 120; frame++) state = advanceWalk(state, 0, 1 / 60);
    expect(state.intensity).toBeLessThan(0.01);
  });
});
