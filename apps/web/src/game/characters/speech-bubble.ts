import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

/** Altura do balão no mundo (m) e altura em que ele fica, acima do rótulo do nome. */
const BUBBLE_HEIGHT = 0.2;
const BUBBLE_Y = 2.15;
/** Limite de largura/altura da textura em pixels, com quebra de linha por palavra. */
const MAX_TEXTURE_WIDTH = 640;
const PADDING_X = 28;
const PADDING_Y = 20;
const LINE_HEIGHT = 52;
const FONT = '600 40px system-ui, "Segoe UI", Roboto, sans-serif';
const MAX_LINES = 5;
const TEXT_COLOR = '#ffffff';
const PILL_COLOR = 'rgba(12, 12, 20, 0.72)';
const PILL_BORDER = 'rgba(255, 255, 255, 0.18)';
const PILL_RADIUS = 18;
/** Quanto tempo o balão fica na tela e quanto dura o desaparecimento (s). */
const DURATION = 5;
const FADE = 0.4;

export interface SpeechBubble {
  /** Mostra o texto acima da cabeça por alguns segundos (substitui o balão anterior). */
  show(text: string): void;
  /** Avança o tempo do balão (segundos); esconde ao fim. */
  update(dt: number): void;
  dispose(): void;
}

/** Medidor de texto (canvas 2D) reaproveitado entre os balões da cena. */
let measurer: CanvasRenderingContext2D | undefined;
function measureContext(): CanvasRenderingContext2D | undefined {
  if (measurer === undefined && typeof document !== 'undefined') {
    measurer = document.createElement('canvas').getContext('2d') ?? undefined;
  }
  return measurer;
}

/** Quebra o texto em linhas dentro de `maxWidth`, limitando a `MAX_LINES` (com reticências). */
function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  context.font = FONT;
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || context.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length > MAX_LINES) {
    let last = lines[MAX_LINES - 1] ?? '';
    while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    return [...lines.slice(0, MAX_LINES - 1), `${last}…`];
  }
  return lines;
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
 * Balão de fala preso acima da cabeça (billboard), com o texto da última mensagem de chat. Some
 * sozinho alguns segundos depois de aparecer. Pode faltar (retorna `undefined`) quando o ambiente
 * não desenha textura (ex.: testes com NullEngine).
 */
export function createSpeechBubble(
  scene: Scene,
  id: string,
  parent: TransformNode,
): SpeechBubble | undefined {
  if (typeof document === 'undefined') return undefined;

  const material = new StandardMaterial(`speech-bubble-${id}`, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.diffuseColor = new Color3(0, 0, 0);
  material.alpha = 0;

  const plane = CreatePlane(`speech-bubble-${id}`, { size: 1 }, scene);
  plane.parent = parent;
  plane.position = new Vector3(0, BUBBLE_Y, 0);
  plane.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  plane.isPickable = false;
  plane.receiveShadows = false;
  plane.material = material;
  plane.setEnabled(false);

  let texture: DynamicTexture | undefined;
  let remaining = 0;

  const show = (text: string) => {
    const context = measureContext();
    const lines = context ? wrapLines(context, text, MAX_TEXTURE_WIDTH) : [text];
    const lineWidth = lines.reduce(
      (widest, line) => Math.max(widest, context?.measureText(line).width ?? line.length * 20),
      0,
    );
    const width = Math.min(MAX_TEXTURE_WIDTH, Math.ceil(lineWidth)) + PADDING_X * 2;
    const height = lines.length * LINE_HEIGHT + PADDING_Y * 2;

    const next = new DynamicTexture(`speech-bubble-texture-${id}`, { width, height }, scene, true);
    next.hasAlpha = true;
    const draw = next.getContext() as unknown as CanvasRenderingContext2D;
    draw.clearRect(0, 0, width, height);
    roundedRect(draw, 2, 2, width - 4, height - 4, PILL_RADIUS);
    draw.fillStyle = PILL_COLOR;
    draw.fill();
    draw.lineWidth = 2;
    draw.strokeStyle = PILL_BORDER;
    draw.stroke();

    draw.font = FONT;
    draw.textAlign = 'center';
    draw.textBaseline = 'middle';
    draw.fillStyle = TEXT_COLOR;
    lines.forEach((line, index) => {
      draw.fillText(line, width / 2, PADDING_Y + LINE_HEIGHT * (index + 0.5));
    });
    next.update();

    material.emissiveTexture = next;
    material.opacityTexture = next;
    texture?.dispose();
    texture = next;

    plane.scaling.set((BUBBLE_HEIGHT * width) / height, BUBBLE_HEIGHT, 1);
    material.alpha = 1;
    plane.setEnabled(true);
    remaining = DURATION;
  };

  return {
    show,
    update(dt) {
      if (remaining <= 0) return;
      remaining -= dt;
      if (remaining <= 0) {
        material.alpha = 0;
        plane.setEnabled(false);
        return;
      }
      material.alpha = remaining < FADE ? remaining / FADE : 1;
    },
    dispose() {
      texture?.dispose();
      material.dispose();
      plane.dispose();
    },
  };
}
