/**
 * Conversões do seletor de cor: hex `#rrggbb` ↔ RGB ↔ HSV.
 * No HSV, o matiz (`h`) vai de 0 a 360 e saturação/brilho (`s`/`v`) de 0 a 100 (%).
 */

export type Rgb = readonly [number, number, number];

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function hexToRgb(hex: string): Rgb {
  const value = HEX_COLOR.test(hex) ? hex.slice(1) : '000000';
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function rgbToHsv(rgb: Rgb): Hsv {
  const r = clamp(rgb[0], 0, 255) / 255;
  const g = clamp(rgb[1], 0, 255) / 255;
  const b = clamp(rgb[2], 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 };
}

export function hsvToRgb(hsv: Hsv): Rgb {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp(hsv.s, 0, 100) / 100;
  const v = clamp(hsv.v, 0, 100) / 100;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - chroma;

  const [r, g, b] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export const hexToHsv = (hex: string): Hsv => rgbToHsv(hexToRgb(hex));

export const hsvToHex = (hsv: Hsv): string => rgbToHex(hsvToRgb(hsv));
