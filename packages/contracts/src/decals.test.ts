import { describe, expect, it } from 'vitest';
import {
  AvatarConfig,
  DECAL_CATEGORIES,
  DECAL_SLOTS,
  DEFAULT_AVATAR,
  DecalChoice,
} from './avatar.ts';

describe('decalques 3DX', () => {
  it('o avatar padrão aceita a lista vazia', () => {
    expect(DEFAULT_AVATAR.decals).toEqual([]);
    expect(AvatarConfig.safeParse(DEFAULT_AVATAR).success).toBe(true);
  });

  it('aceita uma tatuagem por slot', () => {
    const decals = DECAL_SLOTS.map((slot) => ({
      slot: slot.id,
      category: '14_tattoo_autoral',
      image: 'd_tattoo_snake',
    }));
    const avatar = { ...DEFAULT_AVATAR, decals };
    expect(DecalChoice.array().max(8).safeParse(decals).success).toBe(true);
    expect(AvatarConfig.safeParse(avatar).success).toBe(true);
  });

  it('recusa categoria/imagem fora do contrato', () => {
    expect(
      DecalChoice.safeParse({
        slot: 'chest',
        category: '12_tattoo_oldschool',
        image: 'd_old_school_tattoo_01',
      }).success,
    ).toBe(false);
    expect(
      DecalChoice.safeParse({ slot: 'chest', category: '14_tattoo_autoral', image: '../x' })
        .success,
    ).toBe(false);
  });

  it('só publica a categoria 3DX', () => {
    expect(DECAL_CATEGORIES.map((category) => category.id)).toEqual(['14_tattoo_autoral']);
    expect(DECAL_SLOTS).toHaveLength(8);
  });
});
