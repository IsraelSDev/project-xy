import { describe, expect, it } from 'vitest';
import {
  AvatarConfig,
  DEFAULT_AVATAR,
  PALETTE,
  SKIN_TONES,
  colorHex,
  parseAvatar,
} from './avatar.ts';

describe('AvatarConfig', () => {
  it('aceita o avatar padrão', () => {
    expect(AvatarConfig.safeParse(DEFAULT_AVATAR).success).toBe(true);
  });

  // O schema valida a FORMA. Recusar item fora do catálogo / URL é papel do servidor (403): os
  // itens premium são definidos na loja (dinâmicos), então não cabem num enum do contrato.
  it.each([
    ['cor livre', { ...DEFAULT_AVATAR, topColor: '#ff00ff' }],
    ['campo extra (modelo próprio)', { ...DEFAULT_AVATAR, modelUrl: '/x.glb' }],
    ['campo faltando', { ...DEFAULT_AVATAR, body: undefined }],
    ['valor vazio', { ...DEFAULT_AVATAR, top: '' }],
    ['valor grande demais', { ...DEFAULT_AVATAR, top: 'x'.repeat(33) }],
  ])('recusa %s', (_, value) => {
    expect(AvatarConfig.safeParse(value).success).toBe(false);
  });

  it('aceita valor de item premium definido na loja', () => {
    const avatar = { ...DEFAULT_AVATAR, top: 'leather-jacket' };
    expect(AvatarConfig.safeParse(avatar).success).toBe(true);
  });
});

describe('parseAvatar', () => {
  it('lê JSON válido', () => {
    const avatar = { ...DEFAULT_AVATAR, hair: 'long', accessory: 'cap' };
    expect(parseAvatar(JSON.stringify(avatar))).toEqual(avatar);
  });

  it.each([['texto qualquer'], ['{"hair":"long"}'], [null], [42]])(
    'cai no padrão para %s',
    (value) => {
      expect(parseAvatar(value)).toEqual(DEFAULT_AVATAR);
    },
  );
});

describe('catálogo', () => {
  it('cores em hexadecimal e ids únicos', () => {
    const colors = [...SKIN_TONES, ...PALETTE];
    expect(new Set(colors.map((color) => color.id)).size).toBe(colors.length);
    for (const color of colors) expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorHex('skin-1')).toBe('#f3d7c4');
  });
});
