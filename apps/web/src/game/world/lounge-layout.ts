import type { Box2 } from '../movement/geometry';
import type { MovementState } from '../movement/movement';

/**
 * Layout do lounge provisório (geometria placeholder, sem assets licenciados).
 * Fonte única para a renderização e para a colisão: o que aparece na tela é o que bloqueia o avatar.
 * Unidades em metros; o piso fica em y = 0.
 */

export type PropKind = 'bar' | 'shelf' | 'sofa' | 'table' | 'pillar' | 'plant';

export interface Prop {
  name: string;
  kind: PropKind;
  box: Box2;
  height: number;
}

export const ROOM = {
  /** Área interna caminhável: x em [-halfWidth, halfWidth], z em [-halfDepth, halfDepth]. */
  halfWidth: 9,
  halfDepth: 7,
  wallHeight: 3.4,
  wallThickness: 0.3,
} as const;

export const PROPS: readonly Prop[] = [
  { name: 'bar-counter', kind: 'bar', box: { minX: -5, maxX: 1, minZ: 5.2, maxZ: 6 }, height: 1.1 },
  {
    name: 'bar-shelf',
    kind: 'shelf',
    box: { minX: -5, maxX: 1, minZ: 6.55, maxZ: 7 },
    height: 2.2,
  },
  {
    name: 'sofa-south',
    kind: 'sofa',
    box: { minX: 3.5, maxX: 7.5, minZ: -1.2, maxZ: -0.3 },
    height: 0.85,
  },
  {
    name: 'sofa-north',
    kind: 'sofa',
    box: { minX: 3.5, maxX: 7.5, minZ: 2.3, maxZ: 3.2 },
    height: 0.85,
  },
  {
    name: 'coffee-table',
    kind: 'table',
    box: { minX: 4.6, maxX: 6.4, minZ: 0.6, maxZ: 1.4 },
    height: 0.45,
  },
  {
    name: 'pillar-west',
    kind: 'pillar',
    box: { minX: -3.3, maxX: -2.7, minZ: -1.8, maxZ: -1.2 },
    height: ROOM.wallHeight,
  },
  {
    name: 'pillar-east',
    kind: 'pillar',
    box: { minX: 1.7, maxX: 2.3, minZ: -1.8, maxZ: -1.2 },
    height: ROOM.wallHeight,
  },
  {
    name: 'plant-ne',
    kind: 'plant',
    box: { minX: 8.1, maxX: 8.7, minZ: 6.1, maxZ: 6.7 },
    height: 1.3,
  },
  {
    name: 'plant-se',
    kind: 'plant',
    box: { minX: 8.1, maxX: 8.7, minZ: -6.7, maxZ: -6.1 },
    height: 1.3,
  },
  {
    name: 'plant-sw',
    kind: 'plant',
    box: { minX: -8.7, maxX: -8.1, minZ: -6.7, maxZ: -6.1 },
    height: 1.3,
  },
];

/** Pista de dança: só visual, não bloqueia o avatar. */
export const DANCE_FLOOR: Box2 = { minX: -7.5, maxX: -1.5, minZ: -6, maxZ: -2.5 };

/** Paredes externas, por fora da área caminhável. */
export const WALLS: readonly Box2[] = (() => {
  const { halfWidth: w, halfDepth: d, wallThickness: t } = ROOM;
  return [
    { minX: -w - t, maxX: w + t, minZ: d, maxZ: d + t }, // norte
    { minX: -w - t, maxX: w + t, minZ: -d - t, maxZ: -d }, // sul
    { minX: w, maxX: w + t, minZ: -d, maxZ: d }, // leste
    { minX: -w - t, maxX: -w, minZ: -d, maxZ: d }, // oeste
  ];
})();

export const OBSTACLES: readonly Box2[] = [...WALLS, ...PROPS.map((prop) => prop.box)];

export const SPAWN: MovementState = { position: { x: 0, z: -2.5 }, heading: 0 };
