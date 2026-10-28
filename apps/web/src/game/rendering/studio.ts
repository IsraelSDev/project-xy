import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { STUDIO, type SeatKind } from '@3dx/game-core';

/**
 * Sala vazia de teste: piso e paredes procedurais, **nenhum móvel**.
 *
 * Serve para conferir as animações a dois sem a mobília atrapalhando a leitura do corpo. Os
 * assentos do layout continuam existindo (o servidor precisa deles para sentar e iniciar o par),
 * mas aqui só aparece uma marca no piso com o tamanho aproximado do móvel correspondente — o par
 * vai ficar no ar, exatamente o que queremos nesta etapa. O encaixe sobre móveis é uma etapa
 * separada, feita depois.
 */
export interface StudioRoom {
  root: TransformNode;
  meshes: Mesh[];
  dispose(): void;
}

/** Pegada aproximada do móvel de cada tipo, só para o marcador do piso. */
const MARKER_FOOTPRINT: Record<SeatKind, { width: number; depth: number }> = {
  sofa: { width: 1, depth: 0.85 },
  chair: { width: 0.55, depth: 0.55 },
  bed: { width: 1.6, depth: 2 },
  stool: { width: 0.45, depth: 0.45 },
};

/** Cor de cada tipo de assento (o marcador é a única pista visual na sala vazia). */
const MARKER_COLOR: Record<SeatKind, Color3> = {
  sofa: new Color3(0.95, 0.35, 0.55),
  chair: new Color3(0.35, 0.75, 1),
  bed: new Color3(0.7, 0.45, 1),
  stool: new Color3(1, 0.8, 0.3),
};

export function buildStudio(scene: Scene): StudioRoom {
  const root = new TransformNode('studio-room', scene);
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];

  const makeMaterial = (
    name: string,
    diffuse: Color3,
    options: { emissive?: Color3; alpha?: number; disableLighting?: boolean } = {},
  ) => {
    const material = new StandardMaterial(`studio-${name}`, scene);
    material.diffuseColor = diffuse;
    material.specularColor = new Color3(0.05, 0.05, 0.05);
    if (options.emissive) material.emissiveColor = options.emissive;
    if (options.disableLighting) material.disableLighting = true;
    if (options.alpha !== undefined) material.alpha = options.alpha;
    materials.push(material);
    return material;
  };

  const { halfWidth: w, halfDepth: d, wallHeight } = STUDIO;

  const floor = CreateGround('studio-floor', { width: w * 2, height: d * 2 }, scene);
  floor.material = makeMaterial('floor', new Color3(0.46, 0.46, 0.5));
  floor.receiveShadows = true;
  // O piso é o destino do toque/clique (`FLOOR_MESHES` em `movement/pointer.ts`).
  floor.isPickable = true;
  floor.parent = root;
  meshes.push(floor);

  // Paredes visíveis só por dentro ("casa de bonecas"), como no lounge provisório: orbitar a
  // câmera para fora da sala enxerga através delas em vez de ver a face externa.
  const walls = [
    { name: 'north', width: w * 2, x: 0, z: d, rotationY: 0 },
    { name: 'south', width: w * 2, x: 0, z: -d, rotationY: Math.PI },
    { name: 'east', width: d * 2, x: w, z: 0, rotationY: Math.PI / 2 },
    { name: 'west', width: d * 2, x: -w, z: 0, rotationY: -Math.PI / 2 },
  ];
  const wallMaterial = makeMaterial('wall', new Color3(0.62, 0.61, 0.64));
  for (const wall of walls) {
    const mesh = CreatePlane(
      `studio-wall-${wall.name}`,
      { width: wall.width, height: wallHeight },
      scene,
    );
    mesh.position.set(wall.x, wallHeight / 2, wall.z);
    mesh.rotation.y = wall.rotationY;
    mesh.material = wallMaterial;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.parent = root;
    meshes.push(mesh);
  }

  // Grade de 1 m no piso: referência de escala para medir os deslocamentos do clipe a olho.
  const step = 1;
  const lines: Vector3[][] = [];
  for (let x = -w; x <= w; x += step) {
    lines.push([new Vector3(x, 0.004, -d), new Vector3(x, 0.004, d)]);
  }
  for (let z = -d; z <= d; z += step) {
    lines.push([new Vector3(-w, 0.004, z), new Vector3(w, 0.004, z)]);
  }
  const grid = CreateLineSystem('studio-grid', { lines }, scene);
  grid.color = new Color3(0.28, 0.3, 0.36);
  grid.alpha = 0.55;
  grid.isPickable = false;
  grid.parent = root;
  meshes.push(grid);

  // Eixos: ajuda a saber para onde cada clipe está voltado (X = vermelho, Z = azul).
  const axes = CreateLineSystem(
    'studio-axes',
    {
      lines: [
        [new Vector3(-w, 0.006, 0), new Vector3(w, 0.006, 0)],
        [new Vector3(0, 0.006, -d), new Vector3(0, 0.006, d)],
      ],
    },
    scene,
  );
  axes.color = new Color3(0.75, 0.5, 0.4);
  axes.alpha = 0.8;
  axes.isPickable = false;
  axes.parent = root;
  meshes.push(axes);

  // Marca de cada assento: pegada do móvel + barra no encosto, para mostrar para onde o par olha.
  const markerMaterials = new Map<SeatKind, StandardMaterial>();
  const edgeMaterials = new Map<SeatKind, StandardMaterial>();
  const markerMaterial = (kind: SeatKind) => {
    let material = markerMaterials.get(kind);
    if (!material) {
      material = makeMaterial(`seat-${kind}`, MARKER_COLOR[kind], {
        emissive: MARKER_COLOR[kind],
        alpha: 0.4,
        disableLighting: true,
      });
      markerMaterials.set(kind, material);
    }
    return material;
  };
  const edgeMaterial = (kind: SeatKind) => {
    let material = edgeMaterials.get(kind);
    if (!material) {
      material = makeMaterial(`seat-${kind}-edge`, MARKER_COLOR[kind], {
        emissive: MARKER_COLOR[kind],
        alpha: 0.9,
        disableLighting: true,
      });
      edgeMaterials.set(kind, material);
    }
    return material;
  };

  STUDIO.seats.forEach((seat, index) => {
    const kind = seat.kind ?? 'sofa';
    const footprint = MARKER_FOOTPRINT[kind];
    const front = { x: Math.sin(seat.heading), z: Math.cos(seat.heading) };

    const pad = CreateBox(
      `studio-seat-${index}`,
      { width: footprint.width, height: 0.012, depth: footprint.depth },
      scene,
    );
    pad.position.set(seat.position.x, 0.006, seat.position.z);
    pad.rotation.y = seat.heading;
    pad.material = markerMaterial(kind);
    pad.isPickable = false;
    pad.parent = root;
    meshes.push(pad);

    const backOffset = footprint.depth / 2 - 0.06;
    const back = CreateBox(
      `studio-seat-${index}-back`,
      { width: footprint.width, height: 0.024, depth: 0.12 },
      scene,
    );
    back.position.set(
      seat.position.x - front.x * backOffset,
      0.012,
      seat.position.z - front.z * backOffset,
    );
    back.rotation.y = seat.heading;
    back.material = edgeMaterial(kind);
    back.isPickable = false;
    back.parent = root;
    meshes.push(back);
  });

  return {
    root,
    meshes,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose();
      root.dispose();
    },
  };
}
