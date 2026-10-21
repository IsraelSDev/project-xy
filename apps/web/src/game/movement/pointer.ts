import { length, normalize, type Vec2 } from '@3dx/game-core';
import type { Scene } from '@babylonjs/core/scene';

/** Distância (m) em que o avatar já conta como "chegou" ao alvo do toque. */
const ARRIVE_RADIUS = 0.35;
/** Deslocamento (px) que ainda vale como toque; acima disso foi arrasto (girar a câmera). */
const TAP_SLOP = 8;
/** Só o piso serve de destino (evita mandar o avatar para dentro de móveis ou paredes). */
const FLOOR_MESHES: ReadonlySet<string> = new Set([
  'placeholder-floor',
  'placeholder-dance-floor',
  'home-floor-picker',
]);

export interface PointerInput {
  /** Direção (mundo, módulo 0/1) rumo ao alvo do toque; zera e esquece ao chegar perto. */
  direction(local: Vec2 | undefined): Vec2;
  /** O teclado assumiu: esquece qualquer destino de toque pendente. */
  clear(): void;
  dispose(): void;
}

/** Direção de `local` até `target` (módulo 0/1) e se já chegou perto o bastante. */
export function approachDirection(
  target: Vec2,
  local: Vec2,
  arriveRadius = ARRIVE_RADIUS,
): { direction: Vec2; arrived: boolean } {
  const delta = { x: target.x - local.x, z: target.z - local.z };
  if (length(delta) <= arriveRadius) return { direction: { x: 0, z: 0 }, arrived: true };
  return { direction: normalize(delta), arrived: false };
}

/**
 * Andar por toque/clique (celular e mouse): um toque no piso marca o destino e o avatar caminha
 * até lá. Arrastar continua girando a câmera — só um toque parado vira destino.
 */
export function createPointerInput(scene: Scene, canvas: HTMLCanvasElement): PointerInput {
  let target: Vec2 | undefined;
  let activeId: number | undefined;
  let startX = 0;
  let startY = 0;
  let dragged = false;

  const localPoint = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (activeId !== undefined) return; // já acompanha um dedo/botão
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = localPoint(event);
    activeId = event.pointerId;
    startX = point.x;
    startY = point.y;
    dragged = false;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== activeId) return;
    const point = localPoint(event);
    if (Math.hypot(point.x - startX, point.y - startY) > TAP_SLOP) dragged = true;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== activeId) return;
    activeId = undefined;
    if (dragged) return; // foi arrasto: a câmera girou, não é destino
    const point = localPoint(event);
    const picked = scene.pick(point.x, point.y, (mesh) => FLOOR_MESHES.has(mesh.name))?.pickedPoint;
    if (picked) target = { x: picked.x, z: picked.z };
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId === activeId) activeId = undefined;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  return {
    direction(local) {
      if (!target || !local) return { x: 0, z: 0 };
      const { direction, arrived } = approachDirection(target, local);
      if (arrived) target = undefined;
      return direction;
    },
    clear() {
      target = undefined;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
    },
  };
}
