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
/** Altura da textura em pixels (as fontes desenham dentro dela) e respiro lateral do nome. */
const TEXTURE_HEIGHT = 64;
const PADDING_X = 28;
const FONT = '600 44px system-ui, "Segoe UI", Roboto, sans-serif';
/** Selo da equipe (ADM/MOD): menor que o nome, para não competir com ele. */
const BADGE_FONT = '800 34px system-ui, "Segoe UI", Roboto, sans-serif';
const TEXT_COLOR = '#ffffff';
const PILL_COLOR = 'rgba(12, 12, 20, 0.62)';
const PILL_BORDER = 'rgba(255, 255, 255, 0.16)';
const BADGE_COLOR = '#d42a66';
const PILL_RADIUS = 16;
/** Largura do selo (padding lateral somado na medição) e espaço entre ele e o nome. */
const BADGE_PADDING = 18;
const BADGE_GAP = 10;
const BADGE_HEIGHT = 46;

export interface NameTag {
  /** Troca o nome e, opcionalmente, o selo da equipe ("ADM"/"MOD"); recria a textura. */
  setText(text: string, badge?: string): void;
  dispose(): void;
}

/** Largura do texto na fonte dada. */
function textWidth(text: string, font: string): number {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return text.length * 26;
  context.font = font;
  return Math.ceil(context.measureText(text).width);
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

function centerText(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
  centerX: number,
  color: string,
) {
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(text, centerX, TEXTURE_HEIGHT / 2 + 1);
}

/**
 * Rótulo com o nome (e o selo da equipe, quando houver), preso acima da cabeça e sempre de frente
 * para a câmera (billboard). Fica pendurado na raiz do avatar: como a raiz só gira em Y, o
 * deslocamento vertical não muda de lugar.
 */
export function createNameTag(
  scene: Scene,
  id: string,
  parent: TransformNode,
  text: string,
  badge?: string,
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

  const setText = (value: string, tag?: string) => {
    const nameWidth = textWidth(value, FONT) + PADDING_X * 2;
    const badgeWidth = tag ? textWidth(tag, BADGE_FONT) + BADGE_PADDING * 2 : 0;
    const width = nameWidth + (tag ? badgeWidth + BADGE_GAP : 0);

    const next = new DynamicTexture(
      `name-tag-texture-${id}`,
      { width, height: TEXTURE_HEIGHT },
      scene,
      true,
    );
    next.hasAlpha = true;
    const context = next.getContext() as unknown as CanvasRenderingContext2D;
    context.clearRect(0, 0, width, TEXTURE_HEIGHT);

    // Selo da equipe: pastilha na cor de destaque, mais baixa que o nome.
    if (tag) {
      const badgeTop = (TEXTURE_HEIGHT - BADGE_HEIGHT) / 2;
      roundedRect(context, 0, badgeTop, badgeWidth, BADGE_HEIGHT, PILL_RADIUS);
      context.fillStyle = BADGE_COLOR;
      context.fill();
      centerText(context, tag, BADGE_FONT, badgeWidth / 2, TEXT_COLOR);
    }

    // Nome: pastilha escura, alinhada à direita do selo.
    const nameX = tag ? badgeWidth + BADGE_GAP : 0;
    roundedRect(context, nameX + 2, 2, nameWidth - 4, TEXTURE_HEIGHT - 4, PILL_RADIUS);
    context.fillStyle = PILL_COLOR;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = PILL_BORDER;
    context.stroke();
    centerText(context, value, FONT, nameX + nameWidth / 2, TEXT_COLOR);
    next.update();

    material.emissiveTexture = next;
    material.opacityTexture = next;
    texture?.dispose();
    texture = next;

    // O plano é 1x1: a escala vira o tamanho no mundo, preservando a proporção da textura.
    plane.scaling.set((TAG_HEIGHT * width) / TEXTURE_HEIGHT, TAG_HEIGHT, 1);
  };

  setText(text, badge);

  return {
    setText,
    dispose() {
      texture?.dispose();
      material.dispose();
      plane.dispose();
    },
  };
}
