import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';

/**
 * Recolore a íris sem pintar a esclera. O atlas dos olhos vem em tons de cinza (o `paint_iris` do
 * `extract_body_textures_project.py` assa a íris clara, a pupila escura e o brilho), então aqui a
 * cor escolhida entra só onde a luminância é de íris: a esclera (quase branca) fica como está.
 *
 * É o mesmo mecanismo do `TintPlugin`, mas com máscara por luminância alta em vez de multiplicar
 * tudo — multiplicar o branco da esclera deixaria o olho inteiro colorido.
 */
export class EyeTintPlugin extends MaterialPluginBase {
  /** Cor da íris em espaço linear. */
  readonly tint = new Color3(0.29, 0.09, 0.02);
  private enabled = false;

  constructor(material: Material) {
    super(material, 'EyeTint', 200, { EYE_TINT: false });
  }

  get isEnabled() {
    return this.enabled;
  }

  set isEnabled(value: boolean) {
    if (this.enabled === value) return;
    this.enabled = value;
    this.markAllDefinesAsDirty();
    this._enable(value);
  }

  override getClassName() {
    return 'EyeTintPlugin';
  }

  override prepareDefines(defines: Record<string, unknown>) {
    defines.EYE_TINT = this.enabled;
  }

  override getUniforms() {
    return {
      ubo: [{ name: 'eyeTint', size: 3, type: 'vec3' }],
      fragment: '#ifdef EYE_TINT\nuniform vec3 eyeTint;\n#endif',
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer) {
    if (this.enabled) uniformBuffer.updateColor3('eyeTint', this.tint);
  }

  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef EYE_TINT
float eyeLuma = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
// A íris é cinza (saturação ~0) e escura; a esclera, os dentes e a boca são claros ou coloridos.
float eyeSat = max(max(surfaceAlbedo.r, surfaceAlbedo.g), surfaceAlbedo.b)
             - min(min(surfaceAlbedo.r, surfaceAlbedo.g), surfaceAlbedo.b);
float eyeMask = (1.0 - smoothstep(0.60, 0.75, eyeLuma)) * (1.0 - smoothstep(0.06, 0.14, eyeSat));
surfaceAlbedo = mix(surfaceAlbedo, eyeTint * clamp(0.25 + eyeLuma * 1.5, 0.0, 1.2), eyeMask);
#endif`,
    };
  }
}
