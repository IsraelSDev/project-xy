import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { PALETTE, SKIN_TONES } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { hairTint, linearColor, skinTint } from './avatar-colors';
import { TintPlugin } from './tint-plugin';

describe('cores do cabelo', () => {
  it('cada cor da paleta dá uma cor diferente', () => {
    const hairs = new Set(PALETTE.map((item) => hairTint(item.hex).toHexString()));
    expect(hairs.size).toBe(PALETTE.length);
  });

  it('linearColor converte sRGB para linear (gama 2,2: o cinza médio fica bem mais escuro)', () => {
    const gray = linearColor('#808080');
    expect(gray.r).toBeCloseTo(0.2195, 3);
  });
});

describe('tom de pele sobre o atlas 3DX', () => {
  it('o tom mais claro compensa a pele do atlas e os tons escuros descem em ordem', () => {
    // O albedo do GLB já tem pele desenhada: o tom claro precisa de ganho > 1 para chegar na cor
    // da paleta, e cada tom seguinte tem que ficar mais escuro (senão dois swatches empatam).
    expect(skinTint('3dx-male', SKIN_TONES[0].hex).r).toBeGreaterThan(1);
    expect(skinTint('3dx-female', SKIN_TONES[0].hex).g).toBeGreaterThan(1);
    for (const model of ['3dx-male', '3dx-female'] as const) {
      const reds = SKIN_TONES.map((tone) => skinTint(model, tone.hex).r);
      expect(new Set(reds.map((value) => value.toFixed(4))).size, model).toBe(SKIN_TONES.length);
      for (let i = 1; i < reds.length; i += 1) expect(reds[i]!, model).toBeLessThan(reds[i - 1]!);
    }
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
    expect(code?.CUSTOM_FRAGMENT_UPDATE_ALBEDO).toContain('avatarTint');
    expect(plugin.getCustomCode('vertex')).toBeNull();
    expect(plugin.getUniforms().ubo[0]?.name).toBe('avatarTint');
    const defines: Record<string, unknown> = {};
    plugin.prepareDefines(defines);
    expect(defines.AVATAR_TINT).toBe(true);

    material.dispose();
    engine.dispose();
  });
});
