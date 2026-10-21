import { CLUB_WALLS } from './club-walls.ts';
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
  /**
   * Faixas onde paredes invisíveis do colisor da cena cruzam uma escada e
   * precisam ser recortadas para a subida ficar livre (`obstaclesOf`).
   */
  stairClearings?: readonly Box2[];
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

/** Obstáculos combinados (paredes + props), com as escadas recortadas. */
export function obstaclesOf(layout: RoomLayout): readonly Box2[] {
  const clearings = layout.stairClearings ?? [];
  const walls =
    clearings.length === 0
      ? layout.walls
      : layout.walls.flatMap((box) => subtractBoxes(box, clearings));
  const props = layout.props.flatMap((prop) =>
    clearings.length > 0 && prop.name === 'club-wall'
      ? subtractBoxes(prop.box, clearings)
      : [prop.box],
  );
  return [...walls, ...props];
}

/** Recorta cada `hole` de `box`, devolvendo os retângulos que sobram. */
function subtractBoxes(box: Box2, holes: readonly Box2[]): Box2[] {
  let parts: Box2[] = [box];
  for (const hole of holes) {
    const next: Box2[] = [];
    for (const part of parts) {
      const overlapX = Math.min(part.maxX, hole.maxX) - Math.max(part.minX, hole.minX);
      const overlapZ = Math.min(part.maxZ, hole.maxZ) - Math.max(part.minZ, hole.minZ);
      if (overlapX <= 0 || overlapZ <= 0) {
        next.push(part);
        continue;
      }
      if (part.minZ < hole.minZ) next.push({ ...part, maxZ: hole.minZ });
      if (part.maxZ > hole.maxZ) next.push({ ...part, minZ: hole.maxZ });
      const zMin = Math.max(part.minZ, hole.minZ);
      const zMax = Math.min(part.maxZ, hole.maxZ);
      if (part.minX < hole.minX) {
        next.push({ minX: part.minX, maxX: hole.minX, minZ: zMin, maxZ: zMax });
      }
      if (part.maxX > hole.maxX) {
        next.push({ minX: hole.maxX, maxX: part.maxX, minZ: zMin, maxZ: zMax });
      }
    }
    parts = next;
  }
  return parts.filter((part) => part.maxX - part.minX > 1e-6 && part.maxZ - part.minZ > 1e-6);
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

/** Cenário: home (quarto/apartamento padrão do 3DXChat, GLB `rooms/home`). */
export const HOME: RoomLayout = {
  halfWidth: 2.72,
  halfDepth: 5.04,
  wallHeight: 3.2,
  wallThickness: 0.2,
  danceFloors: [],
  walls: externalWalls(2.72, 5.04, 0.2),
  props: [
    {
      name: 'bed',
      kind: 'table',
      box: { minX: -1.15, maxX: 1.2, minZ: -4.93, maxZ: -2.48 },
      height: 0.9,
    },
    {
      name: 'sofa',
      kind: 'sofa',
      box: { minX: 1.7, maxX: 2.72, minZ: -0.48, maxZ: 1.8 },
      height: 0.72,
    },
    {
      name: 'table',
      kind: 'table',
      box: { minX: -2.03, maxX: -1.06, minZ: 0.09, maxZ: 1.68 },
      height: 0.38,
    },
  ],
  spawn: { position: { x: 0, z: 0.2 }, heading: Math.PI },
  spawnPoints: ringSpawns({ x: 0, z: 0.2 }, 0.9, 6, Math.PI),
  seats: [...sofaSeats({ minX: 1.7, maxX: 2.72, minZ: -0.48, maxZ: 1.8 }, 2)],
};

/** Cenário: lounge (público, layout placeholder). */
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

/**
 * Sofás do lounge da balada: um collider por móvel. O GLB agrupa todos no mesmo
 * material (`sofa_3`), então as caixas vêm dos limites de cada objeto da cena.
 */
const clubSofaBoxes: readonly Box2[] = [
  { minX: -2.48, maxX: -1.6, minZ: -18.99, maxZ: -16.64 },
  { minX: 8.63, maxX: 9.52, minZ: -18.99, maxZ: -16.64 },
  { minX: 6.4, maxX: 8.76, minZ: -12.0, maxZ: -11.12 },
  { minX: -1.71, maxX: 0.64, minZ: -16.75, maxZ: -15.87 },
  { minX: 6.4, maxX: 8.76, minZ: -16.76, maxZ: -15.88 },
  { minX: -1.72, maxX: 0.63, minZ: -15.01, maxZ: -14.13 },
  { minX: -1.72, maxX: 0.63, minZ: -19.75, maxZ: -18.87 },
  { minX: -1.71, maxX: 0.64, minZ: -12.01, maxZ: -11.12 },
  { minX: 8.63, maxX: 9.52, minZ: -14.23, maxZ: -11.88 },
  { minX: -2.48, maxX: -1.6, minZ: -14.25, maxZ: -11.89 },
  { minX: 6.4, maxX: 8.75, minZ: -19.76, maxZ: -18.88 },
  { minX: 6.4, maxX: 8.75, minZ: -15.01, maxZ: -14.12 },
];

/** Baldes de bebidas na bancada de entrada (`shell_1`). */
const clubBucketBoxes: readonly Box2[] = [
  { minX: -5.5, maxX: -4.48, minZ: 7.85, maxZ: 8.65 },
  { minX: -4.1, maxX: -3.08, minZ: 7.85, maxZ: 8.65 },
  { minX: -2.7, maxX: -1.68, minZ: 7.85, maxZ: 8.65 },
];

/** Coolers de cerveja no bar (`bar_1`): três, medidos na malha. */
const clubCoolerBoxes: readonly Box2[] = [
  { minX: -3.35, maxX: -2.83, minZ: 3.30, maxZ: 3.81 },
  { minX: 5.17, maxX: 5.70, minZ: 8.18, maxZ: 8.71 },
  { minX: 1.15, maxX: 1.68, minZ: -9.42, maxZ: -8.89 },
];

/** Urinóis (`pan_1`) e divisórias dos boxes do banheiro. */
const clubToiletBoxes: readonly Box2[] = [
  { minX: -9.19, maxX: -8.79, minZ: 13.15, maxZ: 13.95 },
  { minX: -8.28, maxX: -7.88, minZ: 13.15, maxZ: 13.95 },
  { minX: -7.27, maxX: -6.87, minZ: 13.15, maxZ: 13.95 },
  { minX: -6.23, maxX: -5.82, minZ: 13.15, maxZ: 13.95 },
  { minX: -5.22, maxX: -4.81, minZ: 13.15, maxZ: 13.95 },
  { minX: -4.2, maxX: -3.8, minZ: 13.15, maxZ: 13.95 },
  { minX: -3.19, maxX: -2.79, minZ: 13.15, maxZ: 13.95 },
  { minX: -9.55, maxX: -9.45, minZ: 12.85, maxZ: 13.9 },
  { minX: -8.55, maxX: -8.45, minZ: 12.85, maxZ: 13.9 },
  { minX: -7.55, maxX: -7.45, minZ: 12.85, maxZ: 13.9 },
  { minX: -6.55, maxX: -6.45, minZ: 12.85, maxZ: 13.9 },
  { minX: -5.55, maxX: -5.45, minZ: 12.85, maxZ: 13.9 },
  { minX: -4.55, maxX: -4.45, minZ: 12.85, maxZ: 13.9 },
  { minX: -3.55, maxX: -3.45, minZ: 12.85, maxZ: 13.9 },
  { minX: -2.55, maxX: -2.45, minZ: 12.85, maxZ: 13.9 },
];

/** Banquinhos do bar (os que ficam fora do balcão). */
const clubStoolBoxes: readonly Box2[] = [
  { minX: -3.24, maxX: -2.83, minZ: -2.92, maxZ: -2.51 },
  { minX: -2.59, maxX: -2.18, minZ: -2.92, maxZ: -2.51 },
  { minX: -1.86, maxX: -1.45, minZ: -7.62, maxZ: -7.21 },
  { minX: -1.86, maxX: -1.45, minZ: -6.79, maxZ: -6.38 },
  { minX: -1.86, maxX: -1.45, minZ: -4.84, maxZ: -4.43 },
  { minX: -1.86, maxX: -1.45, minZ: -4.06, maxZ: -3.65 },
];

/** Luminárias de chão (`light_2`) e caixa do alto-falante. */
const clubFloorLampBoxes: readonly Box2[] = [
  { minX: 6.26, maxX: 6.81, minZ: 5.88, maxZ: 6.5 },
  { minX: 9.81, maxX: 10.42, minZ: -7.52, maxZ: -7.04 },
  { minX: 6.38, maxX: 6.9, minZ: -9.94, maxZ: -9.32 },
  { minX: 8.71, maxX: 9.32, minZ: 2.92, maxZ: 3.4 },
  { minX: 9.26, maxX: 10.44, minZ: 5.64, maxZ: 6.87 },
];

/**
 * Painéis da grade de proteção do bar (`fence`/`fence_glass`), um por painel.
 * O vão largo em z -7,18..-4,98 é a passagem entre o salão e o bar; os vãos
 * pequenos entre painéis não comportam o avatar e continuam fechados.
 */
const clubRailBoxes: readonly Box2[] = [
  // Trecho leste (x≈0,43), painéis ao longo de z.
  { minX: 0.38, maxX: 0.48, minZ: -10.02, maxZ: -9.16 },
  { minX: 0.38, maxX: 0.48, minZ: -9.03, maxZ: -8.17 },
  { minX: 0.38, maxX: 0.48, minZ: -8.04, maxZ: -7.18 },
  { minX: 0.38, maxX: 0.48, minZ: -4.98, maxZ: -4.11 },
  { minX: 0.38, maxX: 0.48, minZ: -3.99, maxZ: -3.12 },
  { minX: 0.38, maxX: 0.48, minZ: -3.00, maxZ: -2.13 },
  // Trecho norte (z≈-1,18), painéis ao longo de x.
  { minX: -3.44, maxX: -2.57, minZ: -1.24, maxZ: -1.10 },
  { minX: -2.45, maxX: -1.58, minZ: -1.24, maxZ: -1.10 },
  { minX: -1.45, maxX: -0.59, minZ: -1.24, maxZ: -1.10 },
];

/**
 * Cenário: balada (level 7 do 3DXChat, GLB `rooms/club7`).
 *
 * O loader do glTF espelha a cena em X (nó `__root__`); o offset de `club.ts`
 * centra o resultado em (0, 0). O salão tem 21 m de largura (x -10,5..10,5) por
 * ~41,7 m de comprimento (z -20,9..20,9). O lounge do fundo é mais estreito que
 * o salão; as caixas abaixo reproduzem o piso e os móveis reais.
 */
export const CLUB: RoomLayout = {
  halfWidth: 10.5,
  halfDepth: 20.87,
  wallHeight: 4.5,
  wallThickness: 0.3,
  danceFloors: [{ minX: -1.5, maxX: 7.4, minZ: -9.5, maxZ: 8 }],
  walls: externalWalls(10.5, 20.87, 0.3),
  // A parede invisível do bar cruza a escada norte; recorta só na faixa dos
  // degraus (a grade e as paredes fora dela continuam colidindo).
  stairClearings: [{ minX: -5.5, maxX: -1.05, minZ: -1.35, maxZ: -0.15 }],
  props: [
    // Paredes e divisórias reais (colisor da cena `club.unity`, já espelhado).
    ...CLUB_WALLS.map((box): Prop => ({ name: 'club-wall', kind: 'pillar', box, height: 4.5 })),
    {
      name: 'bar-counter',
      kind: 'counter',
      box: { minX: -5.5, maxX: -2.1, minZ: -8.1, maxZ: -3.1 },
      height: 1.1,
    },
    {
      name: 'entry-counter',
      kind: 'counter',
      box: { minX: -5.4, maxX: -1.7, minZ: 7.9, maxZ: 8.6 },
      height: 1.1,
    },
    {
      name: 'dj-pult',
      kind: 'table',
      box: { minX: 8.5, maxX: 9.2, minZ: -2.3, maxZ: -0.6 },
      height: 1.2,
    },
    // Grades do bar: uma caixa por painel, medidas na malha `fence`. Os vãos
    // entre painéis ficam livres — inclusive o vão largo em z -7,18..-4,98.
    ...clubRailBoxes.map((box): Prop => ({ name: 'club-rail', kind: 'pillar', box, height: 1.4 })),
    {
      name: 'speaker-nw',
      kind: 'shelf',
      box: { minX: 9.3, maxX: 10.5, minZ: 5.6, maxZ: 6.9 },
      height: 1.6,
    },
    {
      name: 'speaker-sw',
      kind: 'shelf',
      box: { minX: 9.3, maxX: 10.5, minZ: -10.2, maxZ: -8.9 },
      height: 1.6,
    },
    {
      name: 'speaker-se',
      kind: 'shelf',
      box: { minX: -3.5, maxX: -2.3, minZ: -10.2, maxZ: -8.9 },
      height: 1.6,
    },
    ...clubSofaBoxes.map((box): Prop => ({ name: 'club-sofa', kind: 'sofa', box, height: 0.97 })),
    ...clubStoolBoxes.map((box): Prop => ({ name: 'club-stool', kind: 'pillar', box, height: 1.3 })),
    ...clubBucketBoxes.map((box): Prop => ({ name: 'club-bucket', kind: 'table', box, height: 1 })),
    ...clubCoolerBoxes.map((box): Prop => ({ name: 'club-cooler', kind: 'table', box, height: 1 })),
    ...clubToiletBoxes.map((box): Prop => ({ name: 'club-toilet', kind: 'shelf', box, height: 2 })),
    ...clubFloorLampBoxes.map(
      (box): Prop => ({ name: 'club-floor-lamp', kind: 'shelf', box, height: 3 }),
    ),
  ],
  spawn: { position: { x: 3, z: -3.5 }, heading: -Math.PI / 2 },
  spawnPoints: ringSpawns({ x: 3, z: -3.5 }, 1.4, 8, -Math.PI / 2),
  seats: [
    ...[-18.8, -17.3, -13.9, -12.4].map((z) => ({
      position: { x: 8.2, z },
      heading: -Math.PI / 2,
    })),
    ...[-18.8, -17.3, -13.9, -12.4].map((z) => ({
      position: { x: -1.2, z },
      heading: Math.PI / 2,
    })),
    { position: { x: -1.4, z: -7.0 }, heading: -Math.PI / 2 },
    { position: { x: -1.4, z: -5.0 }, heading: -Math.PI / 2 },
    { position: { x: -1.4, z: -3.0 }, heading: -Math.PI / 2 },
  ],
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

/** Índice de todos os cenários disponíveis (a balada é o hall inicial). */
export const SCENES: readonly RoomLayout[] = [CLUB, HOME, LOUNGE, BEACH, PRIVATE_ROOM];

/** Busca um cenário pelo nome (ex.: 'club'). */
export function sceneByName(name: string): RoomLayout | undefined {
  return SCENES.find(
    (scene) =>
      (scene === CLUB && name === 'club') ||
      (scene === HOME && name === 'home') ||
      (scene === LOUNGE && name === 'lounge') ||
      (scene === BEACH && name === 'beach') ||
      (scene === PRIVATE_ROOM && name === 'private-room'),
  );
}

/** Nomes dos cenários, em ordem de exibição. */
export const SCENE_NAMES: readonly string[] = ['club', 'home', 'lounge', 'beach', 'private-room'];

/** Nome legível para exibição na interface. */
export function sceneDisplayName(name: string): string {
  switch (name) {
    case 'club':
      return 'Balada';
    case 'home':
      return 'Home';
    case 'lounge':
      return 'Lounge';
    case 'beach':
      return 'Praia';
    case 'private-room':
      return 'Quarto privado';
    default:
      return name;
  }
}
