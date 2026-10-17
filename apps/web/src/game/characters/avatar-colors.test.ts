import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { PALETTE, SKIN_TONES } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { eyebrowTint, hairTint, linearColor, skinTint } from './avatar-colors';
import { TintPlugin } from './tint-plugin';

describe('skinTint', () => {
  it('o tom de referência (padrão) não muda a textura', () => {
    const tint = skinTint({ skin: 'skin-3', skinTexture: 'base' });
    expect([tint.r, tint.g, tint.b]).toEqual([1, 1, 1]);
  });

  it('tons mais escuros escurecem, cada um mais que o anterior', () => {
    const luminance = (skin: (typeof SKIN_TONES)[number]['id']) => {
      const tint = skinTint({ skin, skinTexture: 'base' });
      return tint.r * 0.2126 + tint.g * 0.7152 + tint.b * 0.0722;
    };
    expect(luminance('skin-4')).toBeLessThan(1);
    expect(luminance('skin-5')).toBeLessThan(luminance('skin-4'));
    expect(luminance('skin-6')).toBeLessThan(luminance('skin-5'));
  });

  it('tons mais claros clareiam só um pouco (sem estourar o brilho)', () => {
    for (const skin of ['skin-1', 'skin-2'] as const) {
      const tint = skinTint({ skin, skinTexture: 'base' });
      for (const channel of [tint.r, tint.g, tint.b]) {
        expect(channel).toBeGreaterThanOrEqual(1);
        expect(channel).toBeLessThanOrEqual(1.15);
      }
    }
  });

  it('peles exóticas (alienígena, zumbi) ficam sem ajuste, qualquer que seja o tom', () => {
    for (const skinTexture of ['alien', 'dead', 'dead2'] as const) {
      const tint = skinTint({ skin: 'skin-6', skinTexture });
      expect([tint.r, tint.g, tint.b]).toEqual([1, 1, 1]);
    }
  });
});

describe('cores do cabelo', () => {
  it('cada cor da paleta dá uma cor diferente e a sobrancelha é mais escura que o cabelo', () => {
    const hairs = new Set(PALETTE.map((item) => hairTint(item.hex).toHexString()));
    expect(hairs.size).toBe(PALETTE.length);
    for (const item of PALETTE) {
      const hair = hairTint(item.hex);
      const brow = eyebrowTint(item.hex);
      expect(brow.r + brow.g + brow.b).toBeLessThan(hair.r + hair.g + hair.b);
    }
  });

  it('linearColor converte sRGB para linear (gama 2,2: o cinza médio fica bem mais escuro)', () => {
    const gray = linearColor('#808080');
    expect(gray.r).toBeCloseTo(0.2195, 3);
  });
});

describe('TintPlugin', () => {
  it('liga ao material, expõe a cor e injeta o código no gancho do albedo', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new PBRMaterial('roupa', scene);
    const plugin = new TintPlugin(material);
    expect(plugin.isEnabled).toBe(false);
    plugin.tint.set(1, 0, 0);
    plugin.isEnabled = true;
    expect(plugin.isEnabled).toBe(true);

    const code = plugin.getCustomCode('fragment');
    expect(code?.CUSTOM_FRAGMENT_UPDATE_ALBEDO).toContain('goeTint');
    expect(plugin.getCustomCode('vertex')).toBeNull();
    expect(plugin.getUniforms().ubo[0]?.name).toBe('goeTint');
    const defines: Record<string, unknown> = {};
    plugin.prepareDefines(defines);
    expect(defines.GOE_TINT).toBe(true);

    material.dispose();
    engine.dispose();
  });
});
