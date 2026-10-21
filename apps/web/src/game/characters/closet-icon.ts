import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

const TEXTURE_SIZE = 128;
const PLANE_SIZE = 0.3;
/** Acima do rótulo do nome (2,0 m), para os dois não competirem. */
const ICON_Y = 2.3;

export interface ClosetIcon {
  setVisible(visible: boolean): void;
  dispose(): void;
}

/** Desenha um cabide simples (gancho + triângulo + barra) com fundo escuro. */
function drawHanger(context: CanvasRenderingContext2D) {
  context.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  context.beginPath();
  context.arc(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, 54, 0, Math.PI * 2);
  context.fillStyle = 'rgba(12, 12, 20, 0.72)';
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  context.stroke();

  context.strokeStyle = '#d9f4ff';
  context.lineWidth = 8;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // Gancho.
  context.beginPath();
  context.moveTo(64, 52);
  context.lineTo(64, 42);
  context.arc(70, 38, 9, Math.PI, 0, false);
  context.stroke();

  // Corpo triangular e barra inferior.
  context.beginPath();
  context.moveTo(64, 54);
  context.lineTo(24, 92);
  context.lineTo(104, 92);
  context.closePath();
  context.stroke();
}

/**
 * Ícone flutuante de cabide acima do avatar, visível enquanto a pessoa está no closet.
 * É um billboard (sempre de frente para a câmera) desenhado em canvas, sem asset externo.
 */
export function createClosetIcon(
  scene: Scene,
  id: string,
  parent: TransformNode,
): ClosetIcon | undefined {
  // NullEngine/testes sem canvas 2D: sem ícone, o estado do servidor continua valendo.
  if (typeof document === 'undefined') return undefined;

  const texture = new DynamicTexture(
    `closet-icon-texture-${id}`,
    { width: TEXTURE_SIZE, height: TEXTURE_SIZE },
    scene,
    true,
  );
  texture.hasAlpha = true;
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  drawHanger(context);
  texture.update();

  const material = new StandardMaterial(`closet-icon-${id}`, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.diffuseColor = new Color3(0, 0, 0);
  material.emissiveTexture = texture;
  material.opacityTexture = texture;

  const plane = CreatePlane(`closet-icon-${id}`, { size: 1 }, scene);
  plane.parent = parent;
  plane.position = new Vector3(0, ICON_Y, 0);
  plane.scaling.setAll(PLANE_SIZE);
  plane.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  plane.isPickable = false;
  plane.receiveShadows = false;
  plane.material = material;
  plane.setEnabled(false);

  return {
    setVisible(visible: boolean) {
      plane.setEnabled(visible);
    },
    dispose() {
      texture.dispose();
      material.dispose();
      plane.dispose();
    },
  };
}
