import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { length, normalize, type Vec2 } from '@3dx/game-core';
import type { Scene } from '@babylonjs/core/scene';

/** Distância (m) em que o avatar já conta como "chegou" ao alvo do toque. */
const ARRIVE_RADIUS = 0.35;
/** Só o piso serve de destino (evita mandar o avatar para dentro de móveis ou paredes). */
export const FLOOR_MESHES: ReadonlySet<string> = new Set([
  'placeholder-floor',
  'placeholder-dance-floor',
  'home-floor-picker',
  'studio-floor',
  'beach-floor',
]);

export interface PointerInput {
  /** Direção (mundo, módulo 0/1) rumo ao alvo do toque; zera e esquece ao chegar perto. */
  direction(local: Vec2 | undefined): Vec2;
  /** Marca um destino sem passar pelo toque (ex.: menu do móvel mandando sentar). */
  walkTo(target: Vec2): void;
  /** O teclado assumiu: esquece qualquer destino de toque pendente. */
  clear(): void;
  dispose(): void;
}

/** Um toque parado no canvas (não é arrasto de câmera). */
export interface TapPoint {
  /** Coordenadas do canvas, para o raio da cena. */
  x: number;
  y: number;
  /** Coordenadas da tela, para posicionar um menu ao lado do dedo/cursor. */
  clientX: number;
  clientY: number;
}

/**
 * O que fazer com o toque: andar até o ponto (piso ou assento) ou considerar tratado (menu de
 * avatar aberto). Sem retorno, o toque só anda até o piso.
 */
export type TapAction = { kind: 'walk'; target: Vec2 } | { kind: 'handled' };
export type TapHandler = (point: TapPoint) => TapAction | undefined;

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
 * até lá. O toque vem do **observable do Babylon** (`POINTERTAP`), o mesmo caminho que a câmera já
 * usa: ele só dispara quando não houve arrasto, então girar a câmera não move o avatar e o clique
 * funciona igual em mouse, trackpad e toque. `onTap` roda antes e decide: avatar (menu), assento
 * (anda até ele) ou piso.
 */
export function createPointerInput(
  scene: Scene,
  canvas: HTMLCanvasElement,
  onTap?: TapHandler,
): PointerInput {
  let target: Vec2 | undefined;

  const onPointerTap = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const action = onTap?.({ ...point, clientX: event.clientX, clientY: event.clientY });
    if (action) {
      // Menu de avatar: o toque não vira destino (e para de andar, se estava andando).
      target = action.kind === 'walk' ? action.target : undefined;
      return;
    }
    const picked = scene.pick(point.x, point.y, (mesh) => FLOOR_MESHES.has(mesh.name))?.pickedPoint;
    if (picked) target = { x: picked.x, z: picked.z };
  };

  const observer = scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERTAP) return;
    onPointerTap(info.event as PointerEvent);
  });

  return {
    direction(local) {
      if (!target || !local) return { x: 0, z: 0 };
      const { direction, arrived } = approachDirection(target, local);
      if (arrived) target = undefined;
      return direction;
    },
    walkTo(next) {
      target = next;
    },
    clear() {
      target = undefined;
    },
    dispose() {
      scene.onPointerObservable.remove(observer);
    },
  };
}
