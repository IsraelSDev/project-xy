import { Color3 } from '@babylonjs/core/Maths/math.color';

/** Hex sRGB da paleta (`PALETTE`/`SKIN_TONES`) em cor linear, o espaço em que o material do Babylon multiplica. */
export const linearColor = (hex: string): Color3 => Color3.FromHexString(hex).toLinearSpace();

/** A textura do cabelo é só o desenho dos fios (clara); a cor do cabelo vem toda do multiplicador. */
const HAIR_BRIGHTNESS = 0.8;

export const hairTint = (hex: string): Color3 => linearColor(hex).scale(HAIR_BRIGHTNESS);
