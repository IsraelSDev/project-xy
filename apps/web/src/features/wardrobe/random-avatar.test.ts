import { AVATAR_PARTS, defaultAvatarFor, partFitsModel, type AvatarModelId } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { randomAvatar } from './random-avatar';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const models: AvatarModelId[] = ['3dx-male', '3dx-female'];

describe('randomAvatar', () => {
  it('sorteia em qualquer modelo 3DX e é determinístico pela seed', () => {
    for (const model of models) {
      const current = defaultAvatarFor(model);
      const a = randomAvatar(current, seeded(7));
      const b = randomAvatar(current, seeded(7));
      expect(a).toEqual(b);
      expect(a.model).toBe(model);
      expect(a.height).toBe(current.height);
    }
  });

  it('só equipa peças compatíveis com o modelo', () => {
    for (const model of models) {
      for (let seed = 1; seed <= 20; seed++) {
        const avatar = randomAvatar(defaultAvatarFor(model), seeded(seed));
        for (const part of AVATAR_PARTS) {
          if (avatar[part.slot] !== part.id) continue;
          expect(partFitsModel(part, model), `${part.id} em ${model}`).toBe(true);
        }
      }
    }
  });

  it('mantém os decalques e a altura atuais', () => {
    const current = {
      ...defaultAvatarFor('3dx-female'),
      height: 1.1,
      decals: [
        { slot: 'chest' as const, category: '14_tattoo_autoral' as const, image: 'd_tattoo_snake' },
      ],
    };
    const avatar = randomAvatar(current, seeded(3));
    expect(avatar.height).toBe(1.1);
    expect(avatar.decals).toEqual(current.decals);
  });
});
