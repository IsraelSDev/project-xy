import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';

/**
 * Recolore uma roupa mantendo o desenho da textura. A cor do material só multiplica a textura, e uma roupa preta (ou
 * muito escura) continuaria preta com qualquer cor da paleta. Aqui a luminância da textura vira o brilho da cor
 * escolhida: o preto vira a cor bem escura, o claro vira a cor viva, e as dobras e estampas continuam visíveis.
 */
export class TintPlugin extends MaterialPluginBase {
  /** Cor em espaço linear. */
  readonly tint = new Color3(1, 1, 1);
  private enabled = false;

  constructor(material: Material) {
    super(material, 'AvatarTint', 200, { AVATAR_TINT: false });
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
    return 'AvatarTintPlugin';
  }

  override prepareDefines(defines: Record<string, unknown>) {
    defines.AVATAR_TINT = this.enabled;
  }

  override getUniforms() {
    return {
      ubo: [{ name: 'avatarTint', size: 3, type: 'vec3' }],
      fragment: '#ifdef AVATAR_TINT\nuniform vec3 avatarTint;\n#endif',
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer) {
    if (this.enabled) uniformBuffer.updateColor3('avatarTint', this.tint);
  }

  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      // `surfaceAlbedo` já está em espaço linear; o brilho vem da luminância da própria textura.
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef AVATAR_TINT
float avatarLuma = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
surfaceAlbedo = avatarTint * clamp(0.4 + avatarLuma * 2.2, 0.0, 1.3);
#endif`,
    };
  }
}
