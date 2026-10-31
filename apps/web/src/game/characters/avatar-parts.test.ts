import { DEFAULT_AVATAR, defaultAvatarFor, parseAvatar } from '@3dx/contracts';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { describe, expect, it } from 'vitest';
import { equippedPartIds, lightBackFaces } from './avatar-parts';

const noParts: typeof DEFAULT_AVATAR = {
  ...DEFAULT_AVATAR,
  hair: 'none',
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

  it('monta o conjunto grátis padrão de cada gênero (roupa íntima fica coberta)', () => {
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

  it('a calcinha some quando há calça ou saia (senão atravessa o tecido)', () => {
    for (const bottom of ['3dx_f_bottom_pants', '3dx_f_bottom_skirt']) {
      const dressed = { ...defaultAvatarFor('3dx-female'), bottom };
      expect(equippedPartIds(dressed)).not.toContain('3dx_f_underwear_panties');
      expect(equippedPartIds(dressed)).toContain(bottom);
    }
  });

  it('o sutiã some quando há top ou casaco', () => {
    const withTop = { ...defaultAvatarFor('3dx-female'), underwear: '3dx_f_underwear_bra' };
    expect(equippedPartIds(withTop)).not.toContain('3dx_f_underwear_bra');
    const withCoat = { ...withTop, top: 'none', outerwear: '3dx_f_outerwear_coat' };
    expect(equippedPartIds(withCoat)).not.toContain('3dx_f_underwear_bra');
  });

  it('o casaco longo (covers: all) esconde a roupa íntima inteira', () => {
    const dressed = {
      ...defaultAvatarFor('3dx-female'),
      top: 'none',
      bottom: 'none',
      underwear: '3dx_f_underwear_bra',
      outerwear: '3dx_f_outerwear_coat',
    };
    expect(equippedPartIds(dressed)).toEqual(['3dx_f_hair_30', '3dx_f_outerwear_coat']);
    const withPanties = { ...dressed, underwear: '3dx_f_underwear_panties' };
    expect(equippedPartIds(withPanties)).toEqual(['3dx_f_hair_30', '3dx_f_outerwear_coat']);
  });

  it('sem a peça daquela região, a roupa íntima aparece sozinha', () => {
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
    // sutiã cobre a parte de cima: com calça (parte de baixo coberta) e sem top, ele continua.
    const female = {
      ...defaultAvatarFor('3dx-female'),
      top: 'none',
      underwear: '3dx_f_underwear_bra',
    };
    expect(equippedPartIds(female)).toContain('3dx_f_underwear_bra');
  });
});

describe('lightBackFaces', () => {
  it('liga twoSidedLighting só nos materiais de dois lados (cabelo e pano)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const hair = new PBRMaterial('hair', scene);
    hair.backFaceCulling = false;
    const body = new PBRMaterial('body', scene);
    body.backFaceCulling = true;
    const container = { materials: [hair, body] } as unknown as AssetContainer;
    lightBackFaces(container);
    expect(hair.twoSidedLighting).toBe(true);
    expect(body.twoSidedLighting).toBe(false);
    hair.dispose();
    body.dispose();
    engine.dispose();
  });
});
