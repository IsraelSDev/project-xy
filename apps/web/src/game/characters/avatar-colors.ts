import { Color3 } from '@babylonjs/core/Maths/math.color';

/** Hex sRGB da paleta (`PALETTE`/`SKIN_TONES`) em cor linear, o espaço em que o material do Babylon multiplica. */
export const linearColor = (hex: string): Color3 => Color3.FromHexString(hex).toLinearSpace();

/** A textura do cabelo é só o desenho dos fios (clara); a cor do cabelo vem toda do multiplicador. */
const HAIR_BRIGHTNESS = 0.8;

export const hairTint = (hex: string): Color3 => linearColor(hex).scale(HAIR_BRIGHTNESS);

/** Modelos com atlas de pele (corpo, cabeça e anatomia texturizados). */
export type SkinModel = '3dx-male' | '3dx-female';

/**
 * Pele mais clara do atlas 3DX por gênero (percentil 95 em luz linear, medido nas texturas de
 * `tools/3dx/extract_body_textures_project.py`). O GLB já traz a pele desenhada no albedo, então o
 * tom escolhido entra como multiplicador **relativo** a essa pele: o swatch continua sendo a cor
 * final e o atlas entra com o detalhe (poros, sombras, lábios, olhos). Multiplicar o tom direto sobre
 * o atlas escureceria a pele duas vezes e os tons claros da paleta ficariam todos iguais.
 */
const ATLAS_SKIN_HIGHLIGHT: Record<SkinModel, Color3> = {
  '3dx-male': new Color3(0.776, 0.552, 0.445),
  '3dx-female': new Color3(0.776, 0.515, 0.462),
};

/** Ganho máximo: um pouco acima de 1 compensa a pele do atlas; muito acima estoura o realce. */
const MAX_SKIN_GAIN = 1.25;

/** Multiplicador do albedo do corpo/cabeça 3DX para o tom de pele escolhido. */
export function skinTint(model: SkinModel, hex: string): Color3 {
  const tint = linearColor(hex);
  const atlas = ATLAS_SKIN_HIGHLIGHT[model];
  return new Color3(
    Math.min(MAX_SKIN_GAIN, tint.r / atlas.r),
    Math.min(MAX_SKIN_GAIN, tint.g / atlas.g),
    Math.min(MAX_SKIN_GAIN, tint.b / atlas.b),
  );
}
