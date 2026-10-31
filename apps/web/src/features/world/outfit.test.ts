import { DEFAULT_AVATAR, defaultAvatarFor, type AvatarConfig } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import {
  OUTFIT_SLOTS,
  pieceId,
  removePiece,
  undress,
  wearPiece,
  wearingClothes,
  wornPieces,
} from './outfit';

const male: AvatarConfig = defaultAvatarFor('3dx-male');

describe('peças vestidas', () => {
  it('lista o que o avatar padrão veste, na ordem do painel', () => {
    const pieces = wornPieces(male);
    expect(pieces.map((piece) => piece.slot)).toEqual(['topLayer', 'bottom', 'underwear']);
    expect(pieces[0]).toMatchObject({ id: '3dx_m_top_shirt', label: 'Camisa 3DX' });
  });

  it('camiseta e casaco contam como uma peça só', () => {
    const withCoat: AvatarConfig = {
      ...male,
      top: 'none',
      outerwear: '3dx_m_outerwear_jacket',
    };
    expect(pieceId(withCoat, 'topLayer')).toBe('3dx_m_outerwear_jacket');
    expect(wornPieces(withCoat).filter((piece) => piece.slot === 'topLayer')).toHaveLength(1);
  });

  it('slot vazio não aparece', () => {
    const noHat = { ...male, hat: 'none' };
    expect(wornPieces(noHat).some((piece) => piece.slot === 'hat')).toBe(false);
  });
});

describe('tirar e vestir', () => {
  it('tirar a camada de cima esvazia camiseta e casaco', () => {
    const withCoat = { ...male, top: 'none', outerwear: '3dx_m_outerwear_jacket' };
    const next = removePiece(withCoat, 'topLayer');
    expect(next.top).toBe('none');
    expect(next.outerwear).toBe('none');
  });

  it('tirar a parte de baixo mantém o resto', () => {
    const next = removePiece(male, 'bottom');
    expect(next.bottom).toBe('none');
    expect(next.top).toBe(male.top);
    expect(next.underwear).toBe(male.underwear);
  });

  it('vestir de novo devolve a peça ao slot certo', () => {
    const stripped = removePiece(male, 'bottom');
    const dressed = wearPiece(stripped, 'bottom', '3dx_m_bottom_jeans');
    expect(dressed.bottom).toBe('3dx_m_bottom_jeans');
  });

  it('vestir peça de outro slot não muda nada', () => {
    const stripped = removePiece(male, 'bottom');
    expect(wearPiece(stripped, 'bottom', '3dx_m_hat_flat').bottom).toBe('none');
  });

  it('vestir na camada de cima aceita casaco e camiseta', () => {
    const withCoat = wearPiece(male, 'topLayer', '3dx_m_outerwear_bomber');
    expect(withCoat.outerwear).toBe('3dx_m_outerwear_bomber');
    expect(withCoat.top).toBe('none');
    const withShirt = wearPiece(withCoat, 'topLayer', '3dx_m_top_tshirt_basic');
    expect(withShirt.top).toBe('3dx_m_top_tshirt_basic');
    expect(withShirt.outerwear).toBe('none');
  });
});

describe('tirar a roupa', () => {
  it('esvazia as roupas e mantém roupa íntima e acessórios', () => {
    const dressed: AvatarConfig = {
      ...male,
      shoes: '3dx_m_shoes_sneakers',
      socks: '3dx_m_socks_black',
      gloves: '3dx_m_gloves_leather',
      hat: '3dx_m_hat_flat',
      glasses: '3dx_m_glasses_1',
    };
    const next = undress(dressed);
    for (const slot of ['topLayer', 'costume', 'bottom', 'socks', 'shoes', 'gloves'] as const) {
      expect(pieceId(next, slot)).toBe('none');
    }
    expect(next.underwear).toBe(dressed.underwear);
    expect(next.hat).toBe('3dx_m_hat_flat');
    expect(next.glasses).toBe('3dx_m_glasses_1');
  });

  it('sem roupa, o atalho fica indisponível', () => {
    const stripped = undress(male);
    expect(wearingClothes(stripped)).toBe(false);
    expect(wornPieces(stripped).map((piece) => piece.slot)).toEqual(['underwear']);
  });

  it('o atalho não inventa peças: os slots do painel continuam válidos', () => {
    const next = undress(DEFAULT_AVATAR);
    expect(
      OUTFIT_SLOTS.every((slot) => pieceId(next, slot) === 'none' || slot === 'underwear'),
    ).toBe(true);
  });
});
