import {
  AVATAR_PARTS,
  AvatarConfig,
  DEFAULT_AVATAR,
  MORPHS,
  defaultAvatarFor,
  partFitsModel,
  topLayerChoice,
  type AvatarModelId,
} from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { randomAvatar, type DecalLibrary } from './random-avatar';

/** Gerador determinístico (0..1) para os testes. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const library: DecalLibrary = {
  '02_freckles': ['d_freckles_01', 'd_freckles_02', 'face_d_freckles_01'],
  '03_moles': ['d_moles_01', 'face_d_moles_03'],
  '08_makeup': ['d_makeup_01', 'face_d_makeup_01'],
  '12_tattoo_oldschool': ['d_old_school_tattoo_01', 'd_old_school_tattoo_02'],
};
const models: AvatarModelId[] = ['goe-male', 'goe-female', '3dx-male', '3dx-female'];
const anatomy = new Set<string>(
  MORPHS.filter((morph) => morph.group === 'anatomy').map((morph) => morph.id),
);

describe('randomAvatar', () => {
  it.each(models)('mantém o gênero (%s) e sempre gera um avatar válido', (model) => {
    const current = defaultAvatarFor(model);
    for (let seed = 1; seed <= 60; seed++) {
      const avatar = randomAvatar(current, library, seeded(seed));
      expect(avatar.model).toBe(model);
      expect(AvatarConfig.safeParse(avatar).success, `semente ${seed}`).toBe(true);
    }
  });

  it.each(models)('só usa peças que servem no modelo (%s)', (model) => {
    for (let seed = 1; seed <= 60; seed++) {
      const avatar = randomAvatar(defaultAvatarFor(model), library, seeded(seed));
      for (const id of [avatar.hair, avatar.top, avatar.outerwear, avatar.bottom, avatar.shoes]) {
        if (id === 'none') continue;
        const part = AVATAR_PARTS.find((item) => item.id === id);
        expect(part, id).toBeDefined();
        expect(partFitsModel(part!, model), id).toBe(true);
      }
    }
  });

  it('camiseta e casaco nunca juntos, e sempre há uma camada de cima', () => {
    const wearsJacket = new Set<boolean>();
    for (let seed = 1; seed <= 80; seed++) {
      const avatar = randomAvatar(defaultAvatarFor('goe-male'), library, seeded(seed));
      expect(avatar.top === 'none' || avatar.outerwear === 'none').toBe(true);
      expect(topLayerChoice(avatar)).not.toBe('none');
      wearsJacket.add(avatar.outerwear !== 'none');
    }
    expect(wearsJacket.size, 'tem avatar com e sem casaco').toBe(2);
  });

  it('varia de verdade: cabelo, cores, pele, olhos, formas e decalques', () => {
    const results = Array.from({ length: 80 }, (_, i) =>
      randomAvatar(defaultAvatarFor('goe-female'), library, seeded(i + 1)),
    );
    const distinct = (pick: (avatar: AvatarConfig) => string) => new Set(results.map(pick)).size;
    expect(distinct((a) => a.hair)).toBeGreaterThanOrEqual(3);
    expect(distinct((a) => a.hairColor)).toBeGreaterThanOrEqual(5);
    expect(distinct((a) => a.topColor)).toBeGreaterThanOrEqual(5);
    expect(distinct((a) => a.skin)).toBeGreaterThanOrEqual(4);
    expect(distinct((a) => a.skinTexture)).toBeGreaterThanOrEqual(2);
    expect(distinct((a) => a.eyes)).toBeGreaterThanOrEqual(3);
    expect(distinct((a) => Object.keys(a.morphs).sort().join(','))).toBeGreaterThan(40);
    expect(results.some((a) => a.decals.length > 0)).toBe(true);
    expect(results.some((a) => a.decals.length === 0)).toBe(true);
  });

  it('é repetível com a mesma semente e muda com outra', () => {
    const current = defaultAvatarFor('goe-male');
    expect(randomAvatar(current, library, seeded(5))).toEqual(
      randomAvatar(current, library, seeded(5)),
    );
    expect(randomAvatar(current, library, seeded(5))).not.toEqual(
      randomAvatar(current, library, seeded(6)),
    );
  });

  it('a anatomia fica como está e o sorteio nunca cria forma de anatomia', () => {
    const current = {
      ...defaultAvatarFor('goe-male'),
      genitals: 'GoE_M_Genitals',
      morphs: { AnimPenisErect: 0.6, FaceNoseWide: 1, BodyPregnant: 1 },
    };
    for (let seed = 1; seed <= 40; seed++) {
      const avatar = randomAvatar(current, library, seeded(seed));
      expect(avatar.genitals).toBe('GoE_M_Genitals');
      expect(avatar.morphs.AnimPenisErect).toBe(0.6);
      const used = Object.keys(avatar.morphs).filter((id) => anatomy.has(id));
      expect(used).toEqual(['AnimPenisErect']);
      // O corpo e o rosto antigos saem: o avatar é novo.
      expect(avatar.morphs.BodyPregnant).toBeUndefined();
    }
  });

  it('decalques: rosto com a variante do rosto, tatuagem só no corpo, tudo da biblioteca', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const avatar = randomAvatar(defaultAvatarFor('goe-male'), library, seeded(seed));
      expect(avatar.decals.length).toBeLessThanOrEqual(2);
      for (const decal of avatar.decals) {
        expect(library[decal.category], decal.category).toContain(decal.image);
        if (decal.slot === 'face') expect(decal.image.startsWith('face_')).toBe(true);
        else expect(decal.image.startsWith('face_')).toBe(false);
      }
    }
  });

  it('sem biblioteca de decalques não sai decalque, e o resto continua funcionando', () => {
    const avatar = randomAvatar(DEFAULT_AVATAR, undefined, seeded(3));
    expect(avatar.decals).toEqual([]);
    expect(AvatarConfig.safeParse(avatar).success).toBe(true);
  });
});
