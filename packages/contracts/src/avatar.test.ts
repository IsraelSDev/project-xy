import { describe, expect, it } from 'vitest';
import {
  AvatarConfig,
  DEFAULT_AVATAR,
  PALETTE,
  SKIN_TONES,
  colorHex,
  parseAvatar,
  topLayerChoice,
  withTopLayer,
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

describe('camada de cima (camiseta ou casaco)', () => {
  const base = { ...DEFAULT_AVATAR, top: 'GoE_M_Top_Fitness', outerwear: 'none' };

  it('escolher o casaco tira a camiseta', () => {
    const next = withTopLayer(base, 'GoE_M_Outerwear_Street');
    expect(next.outerwear).toBe('GoE_M_Outerwear_Street');
    expect(next.top).toBe('none');
    expect(topLayerChoice(next)).toBe('GoE_M_Outerwear_Street');
  });

  it('escolher a camiseta tira o casaco', () => {
    const next = withTopLayer(
      { ...base, top: 'none', outerwear: 'GoE_M_Outerwear_Street' },
      'GoE_M_Top_Fitness',
    );
    expect(next.top).toBe('GoE_M_Top_Fitness');
    expect(next.outerwear).toBe('none');
  });

  it('"none" esvazia a camada e id fora do catálogo não muda nada', () => {
    expect(withTopLayer(base, 'none')).toMatchObject({ top: 'none', outerwear: 'none' });
    expect(withTopLayer(base, 'GoE_M_Bottom_Fitness')).toBe(base);
    expect(withTopLayer(base, 'inexistente')).toBe(base);
  });

  it('não altera o objeto original e mantém o resto da aparência', () => {
    const next = withTopLayer(base, 'GoE_M_Outerwear_Street');
    expect(base.top).toBe('GoE_M_Top_Fitness');
    expect(next.bottom).toBe(base.bottom);
    expect(next.topColor).toBe(base.topColor);
  });
});

describe('camada de cima com aparência antiga', () => {
  it('sem o campo outerwear a camiseta continua sendo a escolha', () => {
    const legacy = { top: 'GoE_M_Top_Fitness' } as Pick<AvatarConfig, 'top' | 'outerwear'>;
    expect(topLayerChoice(legacy)).toBe('GoE_M_Top_Fitness');
    expect(topLayerChoice({ top: 'none' } as Pick<AvatarConfig, 'top' | 'outerwear'>)).toBe('none');
  });
});
