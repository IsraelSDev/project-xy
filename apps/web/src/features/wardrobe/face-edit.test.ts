import { MORPHS } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import {
  activeExpression,
  clearFace,
  pairRows,
  randomFace,
  withExpression,
  withMorph,
} from './face-edit';

/** Gerador determinístico (0..1) para o sorteio. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const group = (id: string) => MORPHS.find((morph) => morph.id === id)?.group;

describe('withMorph', () => {
  it('troca a influência, limita a 0..1 e tira a chave quando vai a zero', () => {
    expect(withMorph({}, 'FaceNoseWide', 0.4)).toEqual({ FaceNoseWide: 0.4 });
    expect(withMorph({ FaceNoseWide: 0.4 }, 'FaceNoseWide', 3)).toEqual({ FaceNoseWide: 1 });
    expect(withMorph({ FaceNoseWide: 0.4, BodyPregnant: 1 }, 'FaceNoseWide', 0)).toEqual({
      BodyPregnant: 1,
    });
  });

  it('não altera o objeto original', () => {
    const original = { FaceNoseWide: 0.4 };
    withMorph(original, 'FaceNoseWide', 0.9);
    expect(original).toEqual({ FaceNoseWide: 0.4 });
  });
});

describe('expressão', () => {
  it('só uma expressão por vez, com intensidade, sem mexer no resto', () => {
    const base = { BodyPregnant: 0.5, FaceNoseWide: 0.3 };
    const happy = withExpression(base, 'AnimHappy', 0.8);
    expect(happy).toEqual({ ...base, AnimHappy: 0.8 });
    expect(activeExpression(happy)).toEqual({ id: 'AnimHappy', value: 0.8 });

    const sad = withExpression(happy, 'AnimSad');
    expect(sad).toEqual({ ...base, AnimSad: 1 });
    expect(withExpression(sad, undefined)).toEqual(base);
    expect(activeExpression(base)).toBeUndefined();
  });

  it('com várias expressões salvas, a mais forte é a ativa', () => {
    expect(activeExpression({ AnimHappy: 0.2, AnimSad: 0.9 })).toEqual({
      id: 'AnimSad',
      value: 0.9,
    });
  });
});

describe('clearFace', () => {
  it('zera formato, expressão e movimentos, e deixa corpo e anatomia', () => {
    const cleared = clearFace({
      FaceNoseWide: 0.4,
      AnimHappy: 1,
      jawOpen: 0.5,
      BodyPregnant: 0.7,
      AnimPenisErect: 0.2,
    });
    expect(cleared).toEqual({ BodyPregnant: 0.7, AnimPenisErect: 0.2 });
  });
});

describe('randomFace', () => {
  it('sorteia só chaves comuns de formato do rosto do modelo e mantém o resto', () => {
    const base = { BodyPregnant: 0.5, AnimHappy: 1, jawOpen: 0.3, FaceNoseWide: 1 };
    const result = randomFace(base, 'goe-female', seeded(7), 8);
    const faceKeys = Object.keys(result).filter((id) => group(id) === 'face');
    expect(faceKeys).toHaveLength(8);
    expect(faceKeys).not.toContain('FaceBlackFace');
    for (const id of faceKeys) {
      expect(id).not.toMatch(/Anime|Elf|Mega|Old|Black|Indian|Japan|Flatten|Stretch|Symmetry/);
      expect(result[id as keyof typeof result]).toBeGreaterThanOrEqual(0.15);
      expect(result[id as keyof typeof result]).toBeLessThanOrEqual(0.7);
    }
    expect(result).toMatchObject({ BodyPregnant: 0.5, AnimHappy: 1, jawOpen: 0.3 });
  });

  it('é repetível com a mesma semente e muda com outra', () => {
    expect(randomFace({}, 'goe-male', seeded(1))).toEqual(randomFace({}, 'goe-male', seeded(1)));
    expect(randomFace({}, 'goe-male', seeded(1))).not.toEqual(
      randomFace({}, 'goe-male', seeded(2)),
    );
  });
});

describe('pairRows', () => {
  const facial = MORPHS.filter((morph) => morph.group === 'facial');

  it('junta esquerdo e direito numa linha só e deixa o resto solto', () => {
    const rows = pairRows(facial);
    const blink = rows.find((row) => row.label === 'Piscar');
    expect(blink?.left?.id).toBe('eyeBlinkLeft');
    expect(blink?.right?.id).toBe('eyeBlinkRight');
    // Direções com nome próprio ("para a esquerda") não viram par.
    expect(rows.find((row) => row.single?.id === 'jawLeft')).toBeDefined();
    expect(rows.find((row) => row.single?.id === 'jawOpen')).toBeDefined();
  });

  it('não perde nem repete chave', () => {
    const ids = pairRows(facial).flatMap((row) =>
      [row.left?.id, row.right?.id, row.single?.id].filter(Boolean),
    );
    expect(ids.sort()).toEqual(facial.map((morph) => morph.id).sort());
  });
});
