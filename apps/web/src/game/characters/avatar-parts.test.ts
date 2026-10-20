import { DEFAULT_AVATAR, defaultAvatarFor, parseAvatar } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { equippedPartIds } from './avatar-parts';

const noParts: typeof DEFAULT_AVATAR = {
  ...DEFAULT_AVATAR,
  top: 'none',
  outerwear: 'none',
  bottom: 'none',
  underwear: 'none',
  shoes: 'none',
};

describe('equippedPartIds', () => {
  it('reúne as peças do modelo, na ordem dos slots', () => {
    const config = parseAvatar({
      ...noParts,
      hair: '3dx_m_hair_15',
      top: '3dx_m_top_shirt',
    });
    expect(equippedPartIds(config)).toEqual(['3dx_m_hair_15', '3dx_m_top_shirt']);
  });

  it('ignora peça que não serve no modelo (outro gênero)', () => {
    const config = parseAvatar({ ...noParts, top: '3dx_f_top_shirt' });
    expect(equippedPartIds(config)).toEqual([]);
  });

  it('com o casaco vestido a camiseta não é desenhada (mesma camada)', () => {
    const config = parseAvatar({
      ...noParts,
      top: '3dx_m_top_shirt',
      outerwear: '3dx_m_outerwear_jacket',
    });
    expect(equippedPartIds(config)).toEqual(['3dx_m_outerwear_jacket']);
  });

  it('monta o conjunto grátis padrão de cada gênero', () => {
    expect(equippedPartIds(defaultAvatarFor('3dx-male'))).toEqual([
      '3dx_m_hair_15',
      '3dx_m_top_shirt',
      '3dx_m_bottom_pants',
    ]);
    expect(equippedPartIds(defaultAvatarFor('3dx-female'))).toEqual([
      '3dx_f_hair_30',
      '3dx_f_top_shirt',
      '3dx_f_bottom_pants',
    ]);
  });

  it('a roupa íntima fica sob a calça e aparece sozinha sem ela', () => {
    const dressed = defaultAvatarFor('3dx-male');
    expect(equippedPartIds({ ...dressed, bottom: 'none' })).toEqual([
      '3dx_m_hair_15',
      '3dx_m_top_shirt',
      '3dx_m_underwear_briefs',
    ]);
    expect(equippedPartIds({ ...dressed, bottom: 'none', underwear: 'none' })).toEqual([
      '3dx_m_hair_15',
      '3dx_m_top_shirt',
    ]);
  });
});
