import { SKIN_TONES, colorHex, type AvatarConfig } from '@3dx/contracts';
import { Color3 } from '@babylonjs/core/Maths/math.color';

/** Hex sRGB da paleta (`PALETTE`/`SKIN_TONES`) em cor linear, o espaço em que o material do Babylon multiplica. */
export const linearColor = (hex: string): Color3 => Color3.FromHexString(hex).toLinearSpace();

/** Tom de pele de referência: o que o avatar padrão tem e que as texturas de pele já mostram sem ajuste. */
const REFERENCE_TONE = SKIN_TONES.find((tone) => tone.id === 'skin-3')!.hex;
/** Quanto do tom escolhido passa para a pele (o resto fica com a textura, que já tem cor própria). */
const SKIN_TONE_STRENGTH = 0.6;
/** Tom mais claro que a textura só clareia até aqui (um fator maior que 1 estoura o brilho). */
const SKIN_TONE_MAX = 1.15;
/** Texturas de pele "reais": o tom ajusta o matiz. Alienígena, zumbi e ressuscitada têm cor própria e ficam como estão. */
const NATURAL_SKINS: readonly AvatarConfig['skinTexture'][] = ['base', 'black', 'asian'];

/**
 * Multiplicador da textura de pele para o tom escolhido (`skin`). O tom de referência não muda nada; os mais escuros
 * escurecem na proporção dele, os mais claros clareiam só um pouco. Texturas fora das naturais ficam sem ajuste.
 */
export function skinTint(config: Pick<AvatarConfig, 'skin' | 'skinTexture'>): Color3 {
  if (!NATURAL_SKINS.includes(config.skinTexture)) return new Color3(1, 1, 1);
  const tone = Color3.FromHexString(colorHex(config.skin));
  const reference = Color3.FromHexString(REFERENCE_TONE);
  const ratio = (value: number, base: number) => {
    const full = base > 0 ? value / base : 1;
    return Math.min(SKIN_TONE_MAX, 1 + (full - 1) * SKIN_TONE_STRENGTH);
  };
  return new Color3(
    ratio(tone.r, reference.r),
    ratio(tone.g, reference.g),
    ratio(tone.b, reference.b),
  );
}

/** A textura do cabelo é só o desenho dos fios (clara); a cor do cabelo vem toda do multiplicador. */
const HAIR_BRIGHTNESS = 0.8;
/** Sobrancelha acompanha o cabelo, um pouco mais escura. */
const EYEBROW_BRIGHTNESS = 0.55;

export const hairTint = (hex: string): Color3 => linearColor(hex).scale(HAIR_BRIGHTNESS);
export const eyebrowTint = (hex: string): Color3 => linearColor(hex).scale(EYEBROW_BRIGHTNESS);
