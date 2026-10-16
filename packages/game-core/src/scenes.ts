import { length, type Box2, type Vec2 } from './geometry.ts';
import type { MovementState } from './movement.ts';

/**
 * Layouts de cenário (placeholders, sem assets licenciados).
 * Fonte única para renderização e colisão: o que aparece na tela é o que bloqueia o avatar.
 * Unidades em metros; o piso fica em y = 0.
 */

export type PropKind = 'bar' | 'shelf' | 'sofa' | 'table' | 'pillar' | 'plant' | 'deck' | 'counter';

export interface Prop {
  name: string;
  kind: PropKind;
  box: Box2;
  height: number;
}

export interface RoomLayout {
  /** Área interna caminhável. */
  halfWidth: number;
  halfDepth: number;
  wallHeight: number;
  wallThickness: number;
  /** Pistas de dança: só visual, não bloqueia. */
  danceFloors: readonly Box2[];
  /** Paredes externas. */
  walls: readonly Box2[];
  /** Propriedades/mobiliário que bloqueia o avatar. */
  props: readonly Prop[];
  /** Ponto de spawn principal. */
  spawn: MovementState;
  /** Pontos de entrada alternativos. */
  spawnPoints: readonly MovementState[];
  /** Assentos disponíveis. */
  seats: readonly Seat[];
}

export interface Seat {
  position: Vec2;
  heading: number;
}

/** Obstáculos combinados (paredes + props). */
export function obstaclesOf(layout: RoomLayout): readonly Box2[] {
  return [...layout.walls, ...layout.props.map((prop) => prop.box)];
}

/** Distância mínima entre quem entra e quem já está na sala. */
const SPAWN_SPACING = 0.9;

/** Distância máxima para sentar. */
export const SEAT_REACH = 1.3;

export function pickSpawn(layout: RoomLayout, occupied: readonly Vec2[]): MovementState {
  const clearance = (point: MovementState) =>
    Math.min(
      Infinity,
      ...occupied.map((other) =>
        length({ x: other.x - point.position.x, z: other.z - point.position.z }),
      ),
    );

  let best = layout.spawn;
  let bestClearance = -1;
  for (const point of layout.spawnPoints) {
    const value = clearance(point);
    if (value >= SPAWN_SPACING) return point;
    if (value > bestClearance) {
      best = point;
      bestClearance = value;
    }
  }
  return best;
}

export function nearestFreeSeat(
  layout: RoomLayout,
  position: Vec2,
  occupied: ReadonlySet<number>,
  reach = SEAT_REACH,
): number | undefined {
  let best: number | undefined;
  let bestDistance = reach;
  layout.seats.forEach((seat, index) => {
    if (occupied.has(index)) return;
    const distance = length({ x: seat.position.x - position.x, z: seat.position.z - position.z });
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** Paredes externas, por fora da área caminhável. */
function externalWalls(
  halfWidth: number,
  halfDepth: number,
  wallThickness: number,
): readonly Box2[] {
  const { wallThickness: t } = { wallThickness };
  return [
    { minX: -halfWidth - t, maxX: halfWidth + t, minZ: halfDepth, maxZ: halfDepth + t }, // norte
    { minX: -halfWidth - t, maxX: halfWidth + t, minZ: -halfDepth - t, maxZ: -halfDepth }, // sul
    { minX: halfWidth, maxX: halfWidth + t, minZ: -halfDepth, maxZ: halfDepth }, // leste
    { minX: -halfWidth - t, maxX: -halfWidth, minZ: -halfDepth, maxZ: halfDepth }, // oeste
  ];
}

/** Assentos de um sofá: `count` lugares virados para fora do encosto. */
function sofaSeats(box: Box2, count: number): readonly Seat[] {
  const backIsSouth = (box.minZ + box.maxZ) / 2 < 0;
  const width = (box.maxX - box.minX) / count;
  return Array.from({ length: count }, (_, index) => ({
    position: {
      x: box.minX + width * (index + 0.5),
      z: backIsSouth ? box.maxZ - 0.3 : box.minZ + 0.3,
    },
    heading: backIsSouth ? 0 : Math.PI,
  }));
}

/** Cria um spawn em anel ao redor de um ponto central. */
function ringSpawns(
  center: Vec2,
  radius: number,
  count: number,
  heading: number,
): readonly MovementState[] {
  return Array.from({ length: count }, (_, index): MovementState => {
    const angle = (index / count) * 2 * Math.PI;
    return {
      position: {
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius,
      },
      heading,
    };
  });
}

/** Cenário: lounge (padrão, já existente). */
export const LOUNGE: RoomLayout = {
  halfWidth: 9,
  halfDepth: 7,
  wallHeight: 3.4,
  wallThickness: 0.3,
  danceFloors: [{ minX: -7.5, maxX: -1.5, minZ: -6, maxZ: -2.5 }],
  walls: externalWalls(9, 7, 0.3),
  props: [
    {
      name: 'bar-counter',
      kind: 'bar',
      box: { minX: -5, maxX: 1, minZ: 5.2, maxZ: 6 },
      height: 1.1,
    },
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
      height: 3.4,
    },
    {
      name: 'pillar-east',
      kind: 'pillar',
      box: { minX: 1.7, maxX: 2.3, minZ: -1.8, maxZ: -1.2 },
      height: 3.4,
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
  ],
  spawn: { position: { x: 0, z: -2.5 }, heading: 0 },
  spawnPoints: ringSpawns({ x: 0, z: -2.5 }, 1.2, 8, 0),
  seats: [
    ...sofaSeats({ minX: 3.5, maxX: 7.5, minZ: -1.2, maxZ: -0.3 }, 3),
    ...sofaSeats({ minX: 3.5, maxX: 7.5, minZ: 2.3, maxZ: 3.2 }, 3),
  ],
};

/** Cenário: club (boate com pista grande, balcão central, menos assentos). */
export const CLUB: RoomLayout = {
  halfWidth: 11,
  halfDepth: 11,
  wallHeight: 3.4,
  wallThickness: 0.3,
  danceFloors: [{ minX: -8, maxX: 8, minZ: -8, maxZ: 8 }],
  walls: externalWalls(11, 11, 0.3),
  props: [
    {
      name: 'bar-main',
      kind: 'counter',
      box: { minX: -7, maxX: -4, minZ: 5, maxZ: 10 },
      height: 1.1,
    },
    {
      name: 'bar-side',
      kind: 'counter',
      box: { minX: 4, maxX: 7, minZ: -10, maxZ: -5 },
      height: 1.1,
    },
    {
      name: 'pillar-nw',
      kind: 'pillar',
      box: { minX: -3.3, maxX: -2.7, minZ: 7.3, maxZ: 7.9 },
      height: 3.4,
    },
    {
      name: 'pillar-ne',
      kind: 'pillar',
      box: { minX: 2.7, maxX: 3.3, minZ: 7.3, maxZ: 7.9 },
      height: 3.4,
    },
    {
      name: 'pillar-sw',
      kind: 'pillar',
      box: { minX: -3.3, maxX: -2.7, minZ: -7.9, maxZ: -7.3 },
      height: 3.4,
    },
    {
      name: 'pillar-se',
      kind: 'pillar',
      box: { minX: 2.7, maxX: 3.3, minZ: -7.9, maxZ: -7.3 },
      height: 3.4,
    },
    {
      name: 'sofa-vip',
      kind: 'sofa',
      box: { minX: -6, maxX: -2, minZ: -4, maxZ: -3 },
      height: 0.85,
    },
  ],
  spawn: { position: { x: 0, z: -7 }, heading: 0 },
  spawnPoints: ringSpawns({ x: 0, z: -7 }, 1.5, 10, 0),
  seats: [...sofaSeats({ minX: -6, maxX: -2, minZ: -4, maxZ: -3 }, 3)],
};

/** Cenário: beach (praia, areia, poucos obstáculos, espaço aberto). */
export const BEACH: RoomLayout = {
  halfWidth: 14,
  halfDepth: 10,
  wallHeight: 0, // sem paredes visíveis, só limite de água
  wallThickness: 0,
  danceFloors: [],
  walls: [], // sem paredes físicas
  props: [
    { name: 'palm-nw', kind: 'plant', box: { minX: -12, maxX: -11, minZ: 8, maxZ: 9 }, height: 3 },
    { name: 'palm-ne', kind: 'plant', box: { minX: 11, maxX: 12, minZ: 8, maxZ: 9 }, height: 3 },
    {
      name: 'palm-sw',
      kind: 'plant',
      box: { minX: -12, maxX: -11, minZ: -9, maxZ: -8 },
      height: 3,
    },
    { name: 'palm-se', kind: 'plant', box: { minX: 11, maxX: 12, minZ: -9, maxZ: -8 }, height: 3 },
    { name: 'umbrella', kind: 'table', box: { minX: -2, maxX: 2, minZ: 4, maxZ: 6 }, height: 2.2 },
    { name: 'lounger-n', kind: 'sofa', box: { minX: -4, maxX: -2, minZ: 0, maxZ: 2 }, height: 0.5 },
    { name: 'lounger-s', kind: 'sofa', box: { minX: 2, maxX: 4, minZ: 0, maxZ: 2 }, height: 0.5 },
  ],
  spawn: { position: { x: 0, z: -4 }, heading: 0 },
  spawnPoints: ringSpawns({ x: 0, z: -4 }, 1.5, 10, 0),
  seats: [
    ...sofaSeats({ minX: -4, maxX: -2, minZ: 0, maxZ: 2 }, 2),
    ...sofaSeats({ minX: 2, maxX: 4, minZ: 0, maxZ: 2 }, 2),
  ],
};

/** Cenário: private-room (quarto pequeno e íntimo). */
export const PRIVATE_ROOM: RoomLayout = {
  halfWidth: 6,
  halfDepth: 6,
  wallHeight: 3.4,
  wallThickness: 0.3,
  danceFloors: [],
  walls: externalWalls(6, 6, 0.3),
  props: [
    {
      name: 'sofa-center',
      kind: 'sofa',
      box: { minX: -4, maxX: 4, minZ: 3.2, maxZ: 4.1 },
      height: 0.85,
    },
    {
      name: 'table-center',
      kind: 'table',
      box: { minX: -1, maxX: 1, minZ: 0, maxZ: 1 },
      height: 0.45,
    },
    {
      name: 'shelf-east',
      kind: 'shelf',
      box: { minX: 5.2, maxX: 6, minZ: -2, maxZ: 2 },
      height: 1.8,
    },
  ],
  spawn: { position: { x: 0, z: -3 }, heading: 0 },
  spawnPoints: ringSpawns({ x: 0, z: -3 }, 1.2, 6, 0),
  seats: [...sofaSeats({ minX: -4, maxX: 4, minZ: 3.2, maxZ: 4.1 }, 4)],
};

/** Índice de todos os cenários disponíveis. */
export const SCENES: readonly RoomLayout[] = [LOUNGE, CLUB, BEACH, PRIVATE_ROOM];

/** Busca um cenário pelo nome (ex.: 'club'). */
export function sceneByName(name: string): RoomLayout | undefined {
  return SCENES.find(
    (scene) =>
      (scene === LOUNGE && name === 'lounge') ||
      (scene === CLUB && name === 'club') ||
      (scene === BEACH && name === 'beach') ||
      (scene === PRIVATE_ROOM && name === 'private-room'),
  );
}

/** Nomes dos cenários, em ordem de exibição. */
export const SCENE_NAMES: readonly string[] = ['lounge', 'club', 'beach', 'private-room'];

/** Nome legível para exibição na interface. */
export function sceneDisplayName(name: string): string {
  switch (name) {
    case 'lounge':
      return 'Lounge';
    case 'club':
      return 'Boate';
    case 'beach':
      return 'Praia';
    case 'private-room':
      return 'Quarto privado';
    default:
      return name;
  }
}
