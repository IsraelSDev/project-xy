import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { EyeTintPlugin } from './eye-tint-plugin';

describe('EyeTintPlugin', () => {
  it('pinta a íris pela luminância e deixa a esclera branca', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new PBRMaterial('olhos', scene);
    const plugin = new EyeTintPlugin(material);

    expect(plugin.isEnabled).toBe(false);
    plugin.tint.set(0.2, 0.4, 0.8);
    plugin.isEnabled = true;
    expect(plugin.isEnabled).toBe(true);

    const code = plugin.getCustomCode('fragment');
    // A máscara é pela luma: o branco da esclera fica fora do mix.
    expect(code?.CUSTOM_FRAGMENT_UPDATE_ALBEDO).toContain('eyeMask');
    expect(code?.CUSTOM_FRAGMENT_UPDATE_ALBEDO).toContain('mix(surfaceAlbedo');
    expect(plugin.getCustomCode('vertex')).toBeNull();
    expect(plugin.getUniforms().ubo[0]?.name).toBe('eyeTint');

    const defines: Record<string, unknown> = {};
    plugin.prepareDefines(defines);
    expect(defines.EYE_TINT).toBe(true);

    material.dispose();
    engine.dispose();
  });
});
