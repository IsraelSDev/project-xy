import { describe, expect, it } from 'vitest';
import {
  AVATAR_FORMAT_VERSION,
  AVATAR_MODELS,
  AVATAR_PARTS,
  DEFAULT_AVATAR,
  DecalChoice,
  FREE_PART_IDS,
  PART_SLOTS,
  defaultAvatarFor,
  parseAvatar,
  partFitsModel,
  topLayerChoice,
  withTopLayer,
  type AvatarConfig,
} from './avatar.ts';

const without = (avatar: AvatarConfig, ...keys: (keyof AvatarConfig)[]) => {
  const clone = { ...avatar };
  for (const key of keys) delete clone[key];
  return clone;
};

describe('catálogo 3DX', () => {
  it('só existem os dois modelos 3DX', () => {
    expect(AVATAR_MODELS.map((model) => model.id)).toEqual(['3dx-male', '3dx-female']);
  });

  it('toda peça aponta para um arquivo e serve em pelo menos um modelo', () => {
    for (const part of AVATAR_PARTS) {
      expect(part.file, `${part.id} sem file`).toBeTruthy();
      expect(part.models.length).toBeGreaterThan(0);
    }
  });

  it('as peças grátis existem no catálogo', () => {
    const ids = new Set(AVATAR_PARTS.map((part) => part.id));
    for (const id of FREE_PART_IDS) expect(ids.has(id), id).toBe(true);
  });

  it('peça de um gênero não serve no outro', () => {
    const male = AVATAR_PARTS.find((part) => part.models.includes('3dx-male'))!;
    expect(partFitsModel(male, '3dx-female')).toBe(male.models.includes('3dx-female'));
  });
});

describe('avatar padrão', () => {
  it('nasce no masculino 3DX e veste o conjunto 3DX', () => {
    expect(DEFAULT_AVATAR.model).toBe('3dx-male');
    expect(DEFAULT_AVATAR.top).toBe('3dx_m_top_shirt');
    expect(DEFAULT_AVATAR.bottom).toBe('3dx_m_bottom_pants');
    expect(AVATAR_FORMAT_VERSION).toBe(6);
  });

  it('cada modelo recebe só peças compatíveis, sem slot de anatomia', () => {
    for (const model of AVATAR_MODELS) {
      const avatar = defaultAvatarFor(model.id);
      for (const slot of PART_SLOTS) {
        if (avatar[slot] === 'none') continue;
        const part = AVATAR_PARTS.find((item) => item.slot === slot && item.id === avatar[slot]);
        expect(part, `${model.id}/${slot}`).toBeTruthy();
        expect(partFitsModel(part!, model.id)).toBe(true);
      }
    }
    expect(PART_SLOTS as readonly string[]).not.toContain('genitals');
  });

  it('camiseta e casaco ocupam a mesma camada', () => {
    const jacket = AVATAR_PARTS.find(
      (part) => part.slot === 'outerwear' && part.models.includes('3dx-male'),
    );
    expect(jacket).toBeTruthy();
    const withJacket = withTopLayer(DEFAULT_AVATAR, jacket!.id);
    expect(withJacket.outerwear).toBe(jacket!.id);
    expect(withJacket.top).toBe('none');
    expect(topLayerChoice(withJacket)).toBe(jacket!.id);
  });
});

describe('parseAvatar', () => {
  it('aceita o padrão e completa campos opcionais', () => {
    expect(parseAvatar(DEFAULT_AVATAR)).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar(without(DEFAULT_AVATAR, 'decals'))).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar(without(DEFAULT_AVATAR, 'underwear')).underwear).toBe('none');
  });

  it('modelo fora do catálogo cai no padrão', () => {
    expect(parseAvatar({ ...DEFAULT_AVATAR, model: 'goe-male' })).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar({ ...DEFAULT_AVATAR, model: 'outro' })).toEqual(DEFAULT_AVATAR);
  });

  it('campo desconhecido (formato antigo) cai no padrão', () => {
    expect(parseAvatar({ ...DEFAULT_AVATAR, body: 'regular' })).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar({ ...DEFAULT_AVATAR, morphs: {} })).toEqual(DEFAULT_AVATAR);
  });

  it('lê decalques 3DX e recusa imagem fora do formato', () => {
    const decal = { slot: 'chest', category: '14_tattoo_autoral', image: 'd_tattoo_snake' };
    expect(DecalChoice.safeParse(decal).success).toBe(true);
    expect(DecalChoice.safeParse({ ...decal, image: '../x' }).success).toBe(false);
    const parsed = parseAvatar({ ...DEFAULT_AVATAR, decals: [decal] });
    expect(parsed.decals).toEqual([decal]);
  });
});
