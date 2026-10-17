import { defaultAvatarFor } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { effectiveMorphs, muscleBoosts, muscleDisplacement, underClothes } from './body-build';

describe('effectiveMorphs', () => {
  it('o físico Largo liga o fisiculturista e a aba Formas tem prioridade', () => {
    const broad = { ...defaultAvatarFor('goe-male'), body: 'broad' as const };
    expect(effectiveMorphs(broad).BodyBodybuilderSize).toBe(0.85);
    const edited = { ...broad, morphs: { BodyBodybuilderSize: 0.2 } };
    expect(effectiveMorphs(edited).BodyBodybuilderSize).toBe(0.2);
    expect(effectiveMorphs(defaultAvatarFor('goe-male')).BodyBodybuilderSize).toBeUndefined();
  });
});

describe('muscleDisplacement', () => {
  const at = (x: number, y: number, z: number, weight = 1) => muscleDisplacement(x, y, z, weight);

  it('sem influência não mexe em nada', () => {
    expect(at(0.1, 1.3, 0.1, 0)).toEqual([0, 0, 0]);
  });

  it('cabeça e pés ficam como estão', () => {
    for (const [x, y, z] of [
      [0, 1.72, 0.05],
      [0.03, 1.65, 0.07],
      [0.1, 0.15, 0.02],
      [0, 0.05, 0.1],
    ] as const) {
      expect(at(x, y, z)).toEqual([0, 0, 0]);
    }
  });

  it('a coxa engrossa para fora e a anatomia junto ao meio não se mexe', () => {
    expect(at(0.17, 0.75, 0.0)[0]).toBeGreaterThan(0.005);
    expect(at(0.1, 0.75, 0.08)[2]).toBeGreaterThan(0.003);
    expect(at(0.01, 0.9, 0.12)).toEqual([0, 0, 0]);
  });

  it('é simétrico: o lado esquerdo espelha o direito em x', () => {
    const right = at(0.35, 1.45, 0.02);
    const left = at(-0.35, 1.45, 0.02);
    expect(left[0]).toBeCloseTo(-right[0]);
    expect(left[1]).toBeCloseTo(right[1]);
    expect(left[2]).toBeCloseTo(right[2]);
  });

  it('peitoral vai para a frente, trapézio sobe e a mão se afasta (braço mais longo)', () => {
    expect(at(0.1, 1.33, 0.1)[2]).toBeGreaterThan(0.01);
    expect(at(0.15, 1.52, -0.02)[1]).toBeGreaterThan(0.01);
    expect(at(0.8, 1.45, 0.1)[0]).toBeGreaterThan(0.05);
  });

  it('cresce com a influência', () => {
    expect(at(0.8, 1.45, 0.1, 1)[0]).toBeCloseTo(2 * at(0.8, 1.45, 0.1, 0.5)[0]);
  });
});

describe('roupa', () => {
  it('a manga mantém a folga sobre a pele onde o campo muda depressa', () => {
    const [boost] = muscleBoosts('goe-male');
    const gap = 0.01;
    // Pele e roupa (gap para fora) no topo do ombro, onde o trapézio sobe depressa; normal para cima.
    const skin = new Float32Array([0.15, 1.5, -0.02]);
    const cloth = new Float32Array([0.15, 1.5 + gap, -0.02]);
    const up = new Float32Array([0, 1, 0]);
    boost?.apply(skin, 1, { normals: undefined, clothing: false, name: 'body' });
    boost?.apply(cloth, 1, { normals: up, clothing: true, name: 'shirt' });
    expect(cloth[1]! - skin[1]!).toBeGreaterThanOrEqual(gap - 1e-4);
  });

  it('o braço engrossa em torno do eixo, sem deslocar o antebraço para a frente', () => {
    // No eixo do antebraço (z ~ 0,05 a |x| = 0,6) a seção cresce, mas o centro não se move.
    const [, dy, dz] = muscleDisplacement(0.6, 1.459, 0.05, 1);
    expect(Math.abs(dy)).toBeLessThan(1e-9);
    expect(Math.abs(dz)).toBeLessThan(1e-9);
    expect(muscleDisplacement(0.6, 1.459 + 0.03, 0.05, 1)[1]).toBeGreaterThan(0.005);
  });
});

describe('muscleBoosts', () => {
  it('só o modelo masculino tem reforço, ligado ao tamanho do fisiculturista', () => {
    expect(muscleBoosts('goe-female')).toEqual([]);
    const [boost] = muscleBoosts('goe-male');
    expect(boost?.key).toBe('BodyBodybuilderSize');
    const positions = new Float32Array([0.8, 1.45, 0.1, 0, 1.72, 0.05]);
    boost?.apply(positions, 1, { normals: undefined, clothing: false, name: 'body' });
    expect(positions[0]).toBeGreaterThan(0.85);
    expect([positions[3], positions[4], positions[5]]).toEqual([
      0,
      Math.fround(1.72),
      Math.fround(0.05),
    ]);
  });
});

describe('underClothes', () => {
  const male = defaultAvatarFor('goe-male');

  it('sem roupa que cubra o corpo não faz nada', () => {
    expect(
      underClothes({ ...male, top: 'none', bottom: 'none', outerwear: 'none' }),
    ).toBeUndefined();
  });

  it('a pele recua sob a calça e o moletom, e fica onde não há tecido', () => {
    const under = underClothes({
      ...male,
      top: 'none',
      outerwear: 'GoE_M_Outerwear_Street',
      bottom: 'GoE_M_Bottom_Street',
    });
    expect(under).toBeDefined();
    // Coxa (y 0,7), peito (y 1,3), antebraço (|x| 0,6), cabeça, mão e pé.
    const points = [
      [0.1, 0.7, 0.05],
      [0.0, 1.3, 0.1],
      [0.6, 1.45, 0.05],
      [0.0, 1.72, 0.05],
      [0.78, 1.45, 0.1],
      [0.1, 0.05, 0.05],
    ];
    const positions = new Float32Array(points.flat());
    const normals = new Float32Array(points.flatMap(() => [0, 0, 1]));
    under?.apply(positions, normals);
    const dz = (i: number) => positions[i * 3 + 2]! - points[i]![2]!;
    expect(dz(0)).toBeLessThan(-0.003);
    expect(dz(1)).toBeLessThan(-0.003);
    expect(dz(2)).toBeLessThan(-0.003);
    expect(dz(3)).toBeCloseTo(0, 6);
    expect(dz(4)).toBeCloseTo(0, 6);
    expect(dz(5)).toBeCloseTo(0, 6);
  });

  it('o short deixa a canela e o moletom o braço até o punho: cada peça cobre só o seu trecho', () => {
    const shorts = underClothes({
      ...male,
      top: 'none',
      outerwear: 'none',
      bottom: 'GoE_M_Bottom_Fitness',
    });
    const positions = new Float32Array([0.1, 0.3, 0.05]);
    shorts?.apply(positions, new Float32Array([0, 0, 1]));
    expect(positions[2]).toBeCloseTo(0.05);
  });
});
