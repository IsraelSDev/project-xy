import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { DANCE_FLOOR, PROPS, ROOM, type Box2, type Prop, type PropKind } from '@3dx/game-core';

/**
 * Monta o lounge provisório a partir do layout. Retorna as malhas que projetam sombra.
 * Tudo aqui é PLACEHOLDER: primitivas e cores sólidas até existirem assets licenciados.
 */
export function buildLounge(scene: Scene): { shadowCasters: Mesh[] } {
  const materials = createMaterials(scene);
  const shadowCasters: Mesh[] = [];

  const floor = CreateGround(
    'placeholder-floor',
    { width: ROOM.halfWidth * 2, height: ROOM.halfDepth * 2 },
    scene,
  );
  floor.material = materials.floor;
  floor.receiveShadows = true;

  const danceFloor = CreateGround(
    'placeholder-dance-floor',
    { width: DANCE_FLOOR.maxX - DANCE_FLOOR.minX, height: DANCE_FLOOR.maxZ - DANCE_FLOOR.minZ },
    scene,
  );
  danceFloor.position.set(centerX(DANCE_FLOOR), 0.005, centerZ(DANCE_FLOOR));
  danceFloor.material = materials.danceFloor;
  danceFloor.receiveShadows = true;

  // Paredes visíveis só pelo lado de dentro ("casa de bonecas"): quando a câmera orbita por fora
  // da sala, enxerga através delas em vez de ver a face externa. A colisão usa WALLS (caixas sólidas).
  const { halfWidth: w, halfDepth: d } = ROOM;
  const walls = [
    { name: 'north', width: w * 2, x: 0, z: d, rotationY: 0 },
    { name: 'south', width: w * 2, x: 0, z: -d, rotationY: Math.PI },
    { name: 'east', width: d * 2, x: w, z: 0, rotationY: Math.PI / 2 },
    { name: 'west', width: d * 2, x: -w, z: 0, rotationY: -Math.PI / 2 },
  ];
  for (const wall of walls) {
    const mesh = CreatePlane(
      `placeholder-wall-${wall.name}`,
      { width: wall.width, height: ROOM.wallHeight },
      scene,
    );
    mesh.position.set(wall.x, ROOM.wallHeight / 2, wall.z);
    mesh.rotation.y = wall.rotationY;
    mesh.material = materials.wall;
    mesh.receiveShadows = true;
  }

  // Faixas de LED no alto das paredes, só para dar clima ao ambiente.
  const strips: Box2[] = [
    { minX: -w, maxX: w, minZ: d - 0.04, maxZ: d },
    { minX: -w, maxX: w, minZ: -d, maxZ: -d + 0.04 },
    { minX: w - 0.04, maxX: w, minZ: -d, maxZ: d },
    { minX: -w, maxX: -w + 0.04, minZ: -d, maxZ: d },
  ];
  strips.forEach((strip, index) => {
    const mesh = boxFromFootprint(`placeholder-led-${index}`, strip, 0.05, scene);
    mesh.position.y = ROOM.wallHeight - 0.25;
    mesh.material = materials.led;
  });

  for (const prop of PROPS) {
    for (const mesh of buildProp(prop, materials, scene)) {
      mesh.receiveShadows = true;
      shadowCasters.push(mesh);
    }
  }

  return { shadowCasters };
}

type Materials = Record<
  'floor' | 'danceFloor' | 'wall' | 'led' | PropKind | 'foliage',
  StandardMaterial
>;

function createMaterials(scene: Scene): Materials {
  const make = (name: string, diffuse: Color3, emissive = Color3.Black(), specular = 0.1) => {
    const material = new StandardMaterial(`placeholder-${name}-material`, scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
    material.specularColor = new Color3(specular, specular, specular);
    return material;
  };
  return {
    floor: make('floor', new Color3(0.23, 0.17, 0.13), undefined, 0.25),
    danceFloor: make('dance-floor', new Color3(0.12, 0.08, 0.2), new Color3(0.18, 0.05, 0.3), 0.4),
    wall: make('wall', new Color3(0.42, 0.38, 0.36)),
    led: make('led', Color3.Black(), new Color3(1, 0.55, 0.25)),
    bar: make('bar', new Color3(0.1, 0.09, 0.09), new Color3(0.04, 0.02, 0.01), 0.5),
    shelf: make('shelf', new Color3(0.26, 0.18, 0.12)),
    sofa: make('sofa', new Color3(0.45, 0.1, 0.14)),
    table: make('table', new Color3(0.15, 0.13, 0.12), undefined, 0.5),
    pillar: make('pillar', new Color3(0.6, 0.57, 0.53)),
    plant: make('pot', new Color3(0.3, 0.3, 0.32)),
    foliage: make('foliage', new Color3(0.14, 0.35, 0.16)),
  };
}

function buildProp(prop: Prop, materials: Materials, scene: Scene): Mesh[] {
  const { box, height, name } = prop;
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;

  switch (prop.kind) {
    case 'pillar': {
      const mesh = CreateCylinder(
        `placeholder-${name}`,
        { diameter: Math.min(width, depth), height },
        scene,
      );
      mesh.position.set(centerX(box), height / 2, centerZ(box));
      mesh.material = materials.pillar;
      return [mesh];
    }
    case 'plant': {
      const potHeight = height * 0.35;
      const pot = CreateCylinder(
        `placeholder-${name}-pot`,
        { diameterTop: width, diameterBottom: width * 0.75, height: potHeight },
        scene,
      );
      pot.position.set(centerX(box), potHeight / 2, centerZ(box));
      pot.material = materials.plant;
      const foliage = CreateSphere(
        `placeholder-${name}-foliage`,
        { diameter: width * 1.4, segments: 12 },
        scene,
      );
      foliage.position.set(centerX(box), potHeight + width * 0.6, centerZ(box));
      foliage.scaling.y = 1.3;
      foliage.material = materials.foliage;
      return [pot, foliage];
    }
    case 'sofa': {
      const seat = boxFromFootprint(`placeholder-${name}-seat`, box, height * 0.5, scene);
      seat.material = materials.sofa;
      // Encosto do lado de fora (o mais distante do centro da sala em Z).
      const backDepth = 0.2;
      const backFootprint: Box2 =
        centerZ(box) < 0
          ? { ...box, maxZ: box.minZ + backDepth }
          : { ...box, minZ: box.maxZ - backDepth };
      const back = boxFromFootprint(`placeholder-${name}-back`, backFootprint, height, scene);
      back.material = materials.sofa;
      return [seat, back];
    }
    default: {
      const mesh = boxFromFootprint(`placeholder-${name}`, box, height, scene);
      mesh.material = materials[prop.kind];
      return [mesh];
    }
  }
}

/** Caixa apoiada no piso ocupando exatamente a área `footprint`. */
function boxFromFootprint(name: string, footprint: Box2, height: number, scene: Scene): Mesh {
  const mesh = CreateBox(
    name,
    { width: footprint.maxX - footprint.minX, height, depth: footprint.maxZ - footprint.minZ },
    scene,
  );
  mesh.position.set(centerX(footprint), height / 2, centerZ(footprint));
  return mesh;
}

const centerX = (box: Box2) => (box.minX + box.maxX) / 2;
const centerZ = (box: Box2) => (box.minZ + box.maxZ) / 2;
