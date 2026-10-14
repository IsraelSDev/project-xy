import { describe, expect, it } from 'vitest';
import { pushSnapshot, samplePose, type Snapshot } from './snapshot-buffer';

const at = (time: number, x: number, heading = 0): Snapshot => ({ time, x, z: 0, heading });

describe('samplePose', () => {
  it('sem snapshots não há pose', () => {
    expect(samplePose([], 100)).toBeUndefined();
  });

  it('interpola linearmente entre os snapshots ao redor', () => {
    const pose = samplePose([at(0, 0), at(50, 1), at(100, 3)], 75);
    expect(pose?.x).toBeCloseTo(2);
  });

  it('segura as pontas em vez de extrapolar', () => {
    const buffer = [at(0, 0), at(50, 1)];
    expect(samplePose(buffer, -10)?.x).toBe(0);
    expect(samplePose(buffer, 500)?.x).toBe(1);
  });

  it('interpola a rotação pelo menor arco', () => {
    const from = (170 * Math.PI) / 180;
    const to = (-170 * Math.PI) / 180;
    const heading = samplePose([at(0, 0, from), at(100, 0, to)], 50)?.heading ?? 0;
    expect(Math.abs(Math.cos(heading) + 1)).toBeLessThan(1e-9); // 180°, não 0°
  });
});

describe('pushSnapshot', () => {
  it('depois de um tempo parado, o movimento começa um intervalo antes do novo snapshot', () => {
    const buffer = [at(0, 0)];
    pushSnapshot(buffer, at(5000, 1), 50);

    expect(buffer.map((snapshot) => snapshot.time)).toEqual([0, 4950, 5000]);
    expect(samplePose(buffer, 4900)?.x).toBe(0);
    expect(samplePose(buffer, 4975)?.x).toBeCloseTo(0.5);
  });

  it('descarta snapshots velhos, mas mantém o suficiente para interpolar', () => {
    const buffer: Snapshot[] = [];
    for (let time = 0; time <= 3000; time += 50) pushSnapshot(buffer, at(time, time), 50);

    expect(buffer.length).toBeLessThanOrEqual(22);
    expect(buffer[0]?.time).toBeGreaterThanOrEqual(1950);
  });
});
