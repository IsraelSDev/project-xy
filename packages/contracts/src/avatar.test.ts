import { describe, expect, it } from 'vitest';
import {
  AVATAR_PARTS,
  AvatarConfig,
  BODY_BUILD_MORPHS,
  BODY_TYPES,
  DEFAULT_AVATAR,
  FREE_PART_IDS,
  HEIGHT_MAX,
  HEIGHT_MIN,
  PALETTE,
  PART_SLOTS,
  SKIN_TONES,
  colorHex,
  defaultAvatarFor,
  isGoeModel,
  parseAvatar,
  topLayerChoice,
  withTopLayer,
} from './avatar.ts';
import { MORPH_IDS } from './morphs.ts';
import { MORPHS, MORPH_GROUPS, MORPH_REGIONS } from './morphs.ts';

/** Cópia de `source` sem as chaves dadas (para testar a leitura de uma aparência antiga sem o campo). */
const without = <T extends object, K extends keyof T>(source: T, ...keys: K[]): Omit<T, K> => {
  const copy = { ...source } as Record<string, unknown>;
  for (const key of keys) delete copy[key as string];
  return copy as Omit<T, K>;
};

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

describe('catálogo de shape keys (morphs)', () => {
  const forModel = (model: string) =>
    MORPHS.filter((morph) => (morph.models as readonly string[]).includes(model));

  it('ids únicos, grupos válidos e cada chave serve em pelo menos um modelo', () => {
    expect(new Set(MORPHS.map((morph) => morph.id)).size).toBe(MORPHS.length);
    const groups = new Set<string>(MORPH_GROUPS.map((group) => group.id));
    for (const morph of MORPHS) {
      expect(groups.has(morph.group), morph.id).toBe(true);
      expect(morph.models.length, morph.id).toBeGreaterThan(0);
      expect(morph.label.length, morph.id).toBeGreaterThan(2);
    }
  });

  it('toda chave de rosto e de movimento tem região válida; as outras não têm', () => {
    const regions = new Set<string>(MORPH_REGIONS.map((region) => region.id));
    for (const morph of MORPHS) {
      const hasRegion = 'region' in morph;
      const needsRegion = morph.group === 'face' || morph.group === 'facial';
      expect(hasRegion, morph.id).toBe(needsRegion);
      if (hasRegion) expect(regions.has((morph as { region: string }).region), morph.id).toBe(true);
    }
  });

  it('cobre o corpo de cada gênero, com a anatomia em grupo próprio', () => {
    expect(forModel('goe-male').length).toBeGreaterThan(140);
    expect(forModel('goe-female').length).toBeGreaterThan(140);
    const anatomy = (model: string) =>
      forModel(model)
        .filter((morph) => morph.group === 'anatomy')
        .map((morph) => morph.id);
    expect(anatomy('goe-male')).toContain('AnimPenisErect');
    expect(anatomy('goe-female')).toContain('AnimClitorisExpose');
    expect(anatomy('goe-female')).not.toContain('AnimPenisErect');
    expect(MORPHS.filter((morph) => morph.group === 'facial')).toHaveLength(52);
  });
});

describe('morphs no avatar', () => {
  it('o avatar padrão e o legado (sem o campo) vêm sem formas', () => {
    expect(DEFAULT_AVATAR.morphs).toEqual({});
    expect(parseAvatar(without(DEFAULT_AVATAR, 'morphs', 'genitals'))).toEqual(DEFAULT_AVATAR);
  });

  it('guarda só chaves do catálogo, limita a 0..1 e descarta zero e lixo', () => {
    const parsed = parseAvatar({
      ...DEFAULT_AVATAR,
      morphs: {
        BodyPregnant: 0.5,
        FaceOldFace: 7,
        AnimHappy: -2,
        AnimSad: 0,
        chaveInexistente: 1,
        jawOpen: 'muito',
        mouthClose: Number.NaN,
      },
    });
    expect(parsed.morphs).toEqual({ BodyPregnant: 0.5, FaceOldFace: 1 });
  });

  it('morphs que não é objeto vira vazio, sem derrubar o resto do avatar', () => {
    for (const morphs of [null, 'x', [1, 2], 5]) {
      const parsed = parseAvatar({ ...DEFAULT_AVATAR, hair: 'long', morphs });
      expect(parsed.hair).toBe('long');
      expect(parsed.morphs).toEqual({});
    }
  });

  it('idempotente: ler o que já foi lido não muda nada', () => {
    const once = parseAvatar({ ...DEFAULT_AVATAR, morphs: { BodyPregnant: 0.123456 } });
    expect(parseAvatar(JSON.stringify(once))).toEqual(once);
    expect(once.morphs.BodyPregnant).toBe(0.123);
  });
});

describe('altura do avatar', () => {
  it('padrão é 1 (altura base do modelo)', () => {
    expect(DEFAULT_AVATAR.height).toBe(1);
    expect(parseAvatar(DEFAULT_AVATAR).height).toBe(1);
  });

  it('aparência antiga (sem o campo) assume 1', () => {
    expect(parseAvatar(without(DEFAULT_AVATAR, 'height')).height).toBe(1);
  });

  it('limita à faixa, arredonda e ignora valor não numérico', () => {
    expect(parseAvatar({ ...DEFAULT_AVATAR, height: 0.5 }).height).toBe(HEIGHT_MIN);
    expect(parseAvatar({ ...DEFAULT_AVATAR, height: 3 }).height).toBe(HEIGHT_MAX);
    expect(parseAvatar({ ...DEFAULT_AVATAR, height: 1.123456 }).height).toBe(1.123);
    expect(parseAvatar({ ...DEFAULT_AVATAR, height: 'alto' }).height).toBe(1);
  });
});

describe('físico (body) → formas do GoE', () => {
  it('"Médio" não mexe em nada e as outras só usam chaves reais de MORPHS', () => {
    expect(BODY_BUILD_MORPHS.regular).toEqual({});
    for (const build of Object.values(BODY_BUILD_MORPHS)) {
      for (const id of Object.keys(build)) expect(MORPH_IDS).toContain(id);
    }
    expect(Object.keys(BODY_BUILD_MORPHS)).toEqual(BODY_TYPES.map((type) => type.id));
  });
});

describe('anatomia masculina (peça opcional)', () => {
  it('existe só para o modelo masculino, é grátis e nenhum avatar padrão a traz', () => {
    const part = AVATAR_PARTS.find((item) => item.slot === 'genitals');
    expect(part?.id).toBe('GoE_M_Genitals');
    expect(part?.models).toEqual(['goe-male']);
    expect(FREE_PART_IDS).toContain('GoE_M_Genitals');
    expect(DEFAULT_AVATAR.genitals).toBe('none');
    expect(defaultAvatarFor('goe-male').genitals).toBe('none');
    expect(defaultAvatarFor('goe-female').genitals).toBe('none');
  });

  it('traz tamanho e grossura do pênis (chaves sintetizadas no export, só no masculino)', () => {
    const size = MORPHS.find((morph) => morph.id === 'BodyPenisSize');
    const girth = MORPHS.find((morph) => morph.id === 'BodyPenisGirth');
    expect(size?.group).toBe('anatomy');
    expect(girth?.group).toBe('anatomy');
    expect(size?.models).toEqual(['goe-male']);
    expect(girth?.models).toEqual(['goe-male']);
  });
});

describe('família de modelo 3DX (ADR 0016)', () => {
  it('o avatar padrão de um modelo 3DX não traz peça do GoE, veste o conjunto 3DX e continua válido', () => {
    for (const model of ['3dx-male', '3dx-female'] as const) {
      const avatar = defaultAvatarFor(model);
      expect(avatar.model).toBe(model);
      for (const slot of PART_SLOTS) {
        // `genitals` é opcional: nenhum avatar padrão a traz.
        if (slot === 'genitals') continue;
        const id = avatar[slot];
        if (id === 'none') continue;
        const part = AVATAR_PARTS.find((item) => item.id === id);
        expect(part, `${model}:${slot}`).toBeDefined();
        expect(part!.models, `${model}:${slot}`).toEqual([model]);
      }
      // Fase C: o primeiro conjunto nativo (camisa, calça e roupa íntima).
      expect(avatar.top).toBe(model === '3dx-male' ? '3dx_m_top_shirt' : '3dx_f_top_shirt');
      expect(avatar.bottom).toBe(
        model === '3dx-male' ? '3dx_m_bottom_pants' : '3dx_f_bottom_pants',
      );
      expect(avatar.underwear).toBe(
        model === '3dx-male' ? '3dx_m_underwear_briefs' : '3dx_f_underwear_panties',
      );
      expect(AvatarConfig.safeParse(avatar).success).toBe(true);
    }
  });

  it('isGoeModel separa as famílias (peças, poses e texturas só valem no GoE)', () => {
    expect(isGoeModel('goe-male')).toBe(true);
    expect(isGoeModel('goe-female')).toBe(true);
    expect(isGoeModel('3dx-male')).toBe(false);
    expect(isGoeModel('3dx-female')).toBe(false);
  });
});
