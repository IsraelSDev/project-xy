import { describe, expect, it } from 'vitest';
import { actionPose } from './actions';

describe('poses de ação', () => {
  it('sentado: quadril baixo, coxas à frente e joelhos dobrados', () => {
    const pose = actionPose('sit', 0);
    expect(pose.bob).toBeLessThan(-0.3);
    expect(pose.leftHip).toBeGreaterThan(1.2);
    expect(pose.rightKnee).toBeGreaterThan(1.2);
  });

  it('aceno: braço direito para cima e cotovelo mexendo com o tempo', () => {
    const a = actionPose('wave', 0);
    const b = actionPose('wave', 0.15);
    expect(a.rightShoulder).toBeGreaterThan(2);
    expect(a.leftShoulder).toBe(0);
    expect(a.rightElbow).not.toBeCloseTo(b.rightElbow);
  });

  it('dança: alterna os lados no ritmo', () => {
    const a = actionPose('dance', 0.125);
    const b = actionPose('dance', 0.375);
    expect(Math.sign(a.leftHip)).toBe(-Math.sign(b.leftHip));
  });
});
