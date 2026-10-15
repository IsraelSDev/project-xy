import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

/** Altura do rótulo no mundo (m) e altura em que ele fica, acima da cabeça. */
const TAG_HEIGHT = 0.15;
const TAG_Y = 2.0;
/** Altura da textura em pixels (a fonte desenha dentro dela) e respiro lateral. */
const TEXTURE_HEIGHT = 64;
const PADDING_X = 28;
const FONT = '600 44px system-ui, "Segoe UI", Roboto, sans-serif';
const TEXT_COLOR = '#ffffff';
const PILL_COLOR = 'rgba(12, 12, 20, 0.62)';
const PILL_BORDER = 'rgba(255, 255, 255, 0.16)';
const PILL_RADIUS = 16;

export interface NameTag {
  /** Troca o texto; recria a textura (o nome quase nunca muda). */
  setText(text: string): void;
  dispose(): void;
}

/** Largura da textura para o texto, com o respiro lateral. */
function textureWidthFor(text: string): number {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return Math.max(96, text.length * 26 + PADDING_X * 2);
  context.font = FONT;
  return Math.ceil(context.measureText(text).width) + PADDING_X * 2;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/**
 * Rótulo com o nome, preso acima da cabeça e sempre de frente para a câmera (billboard). Fica
 * pendurado na raiz do avatar: como a raiz só gira em Y, o deslocamento vertical não muda de lugar.
 */
export function createNameTag(
  scene: Scene,
  id: string,
  parent: TransformNode,
  text: string,
): NameTag | undefined {
  // Sem canvas 2D não há como desenhar a textura (ex.: testes com NullEngine). Fica sem rótulo.
  if (typeof document === 'undefined') return undefined;

  const material = new StandardMaterial(`name-tag-${id}`, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.diffuseColor = new Color3(0, 0, 0);

  const plane = CreatePlane(`name-tag-${id}`, { size: 1 }, scene);
  plane.parent = parent;
  plane.position = new Vector3(0, TAG_Y, 0);
  plane.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  plane.isPickable = false;
  plane.receiveShadows = false;
  plane.material = material;

  let texture: DynamicTexture | undefined;

  const setText = (value: string) => {
    const width = textureWidthFor(value);
    const next = new DynamicTexture(
      `name-tag-texture-${id}`,
      { width, height: TEXTURE_HEIGHT },
      scene,
      true,
    );
    next.hasAlpha = true;
    const context = next.getContext() as unknown as CanvasRenderingContext2D;

    context.clearRect(0, 0, width, TEXTURE_HEIGHT);
    roundedRect(context, 2, 2, width - 4, TEXTURE_HEIGHT - 4, PILL_RADIUS);
    context.fillStyle = PILL_COLOR;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = PILL_BORDER;
    context.stroke();

    context.font = FONT;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = TEXT_COLOR;
    context.fillText(value, width / 2, TEXTURE_HEIGHT / 2 + 1);
    next.update();

    material.emissiveTexture = next;
    material.opacityTexture = next;
    texture?.dispose();
    texture = next;

    // O plano é 1x1: a escala vira o tamanho no mundo, preservando a proporção da textura.
    plane.scaling.set((TAG_HEIGHT * width) / TEXTURE_HEIGHT, TAG_HEIGHT, 1);
  };

  setText(text);

  return {
    setText,
    dispose() {
      texture?.dispose();
      material.dispose();
      plane.dispose();
    },
  };
}
