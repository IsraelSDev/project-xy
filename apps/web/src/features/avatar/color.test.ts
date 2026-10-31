import { describe, expect, it } from 'vitest';
import { HEX_COLOR, hexToHsv, hexToRgb, hsvToHex, hsvToRgb, rgbToHex, rgbToHsv } from './color';

describe('cor do seletor', () => {
  it('converte hex para rgb e volta sem perder a cor', () => {
    expect(hexToRgb('#ff6b9d')).toEqual([255, 107, 157]);
    expect(rgbToHex(hexToRgb('#ff6b9d'))).toBe('#ff6b9d');
    expect(rgbToHex([0, 0, 0])).toBe('#000000');
    expect(rgbToHex([265, -3, 12.6])).toBe('#ff000d');
  });

  it('reconhece só hex de seis dígitos', () => {
    expect(HEX_COLOR.test('#a1b2c3')).toBe(true);
    expect(HEX_COLOR.test('#fff')).toBe(false);
    expect(HEX_COLOR.test('a1b2c3')).toBe(false);
  });

  it('calcula o HSV das cores primárias e dos neutros', () => {
    expect(rgbToHsv([255, 0, 0])).toEqual({ h: 0, s: 100, v: 100 });
    expect(rgbToHsv([0, 255, 0])).toEqual({ h: 120, s: 100, v: 100 });
    expect(rgbToHsv([0, 0, 255])).toEqual({ h: 240, s: 100, v: 100 });
    expect(rgbToHsv([255, 255, 255])).toEqual({ h: 0, s: 0, v: 100 });
    const gray = rgbToHsv([128, 128, 128]);
    expect(gray).toMatchObject({ h: 0, s: 0 });
    expect(gray.v).toBeCloseTo(50.2, 1);
  });

  it('converte HSV para rgb nas bordas do quadro', () => {
    expect(hsvToRgb({ h: 0, s: 0, v: 100 })).toEqual([255, 255, 255]);
    expect(hsvToRgb({ h: 0, s: 100, v: 0 })).toEqual([0, 0, 0]);
    expect(hsvToRgb({ h: 360, s: 100, v: 100 })).toEqual([255, 0, 0]);
  });

  it('mantém qualquer hex da paleta ao passar por HSV', () => {
    for (const hex of ['#c68e68', '#ff6b9d', '#22c55e', '#06b6d4', '#a855f7', '#1f2937']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });
});
