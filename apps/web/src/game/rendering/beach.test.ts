import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { BEACH } from '@3dx/game-core';
import { describe, expect, it } from 'vitest';
import '../characters/gltf-loaders';
import { BEACH_OFFSET, BEACH_SAND } from './beach';

const roomFile = fileURLToPath(
  new URL('../../../public/assets/3dx/rooms/beach/beach.glb', import.meta.url),
);

interface GlbMesh {
  name?: string;
  primitives: { attributes: { POSITION: number } }[];
}

interface GlbJson {
  asset?: { version?: string };
  animations?: unknown[];
  skins?: unknown[];
  meshes: GlbMesh[];
  materials: { name?: string }[];
  images: unknown[];
  accessors: { min: number[]; max: number[] }[];
}

/** Lê o chunk JSON de um GLB sem carregar a geometria. */
function glbJson(path: string): GlbJson {
  const buffer = readFileSync(path);
  expect(buffer.readUInt32LE(0), 'magic glTF').toBe(0x46546c67);
  expect(buffer.readUInt32LE(4), 'versão glTF').toBe(2);
  let offset = 12;
  while (offset < buffer.byteLength) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
    if (type === 0x4e4f534a) return JSON.parse(data.toString('utf8')) as GlbJson;
  }
  throw new Error('GLB sem chunk JSON');
}

describe('praia (beach)', () => {
  it('é um GLB estático com o recorte da área jogável', () => {
    const json = glbJson(roomFile);
    expect(json.asset?.version).toBe('2.0');
    expect(json.animations ?? []).toHaveLength(0);
    expect(json.skins ?? []).toHaveLength(0);
    // O recorte descarta o mapa inteiro (240×193 m, ~23 mil triângulos de props); sobram as peças
    // da área jogável num arquivo pequeno o bastante para carregar com a sala.
    expect(statSync(roomFile).size).toBeLessThan(4 * 1024 * 1024);
    expect(json.meshes.length).toBeGreaterThanOrEqual(5);
    expect(json.meshes.length).toBeLessThan(20);
  });

  it('traz a mobília da praia (espreguiçadeira, deck, poste e pedra)', () => {
    const json = glbJson(roomFile);
    const names = json.meshes.map((mesh) => mesh.name ?? '').join(' ');
    expect(names).toMatch(/sunbed/i);
    expect(names).toMatch(/dock/i);
    expect(names).toMatch(/lamppost/i);
    expect(names).toMatch(/rock/i);
  });

  it('cabe na área de areia que o cliente desenha (58 × 26 m)', () => {
    const json = glbJson(roomFile);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION]!;
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis]!, accessor.min[axis]!);
          max[axis] = Math.max(max[axis]!, accessor.max[axis]!);
        }
      }
    }
    const sizeX = max[0]! - min[0]!;
    const sizeZ = max[2]! - min[2]!;
    // O GLB sai em Z-up do Blender; o layout é o mesmo em X/Z depois da conversão para Y-up.
    expect(sizeX).toBeLessThan(BEACH_SAND.width);
    expect(sizeZ).toBeLessThan(BEACH_SAND.depth + 12);
  });

  it('os assentos do layout ficam sobre as espreguiçadeiras do GLB', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('cam', new Vector3(0, 1, -5), scene);
    try {
      const bytes = new Uint8Array(readFileSync(roomFile));
      const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
      const entries = container.instantiateModelsToScene(undefined, false);
      const root = new TransformNode('beach-room', scene);
      root.position.set(BEACH_OFFSET.x, BEACH_OFFSET.y, BEACH_OFFSET.z);
      for (const node of entries.rootNodes) node.parent = root;

      const sunbed: { x: number; z: number }[] = [];
      for (const mesh of root.getChildMeshes(false)) {
        if (!/sunbed/i.test(mesh.name)) continue;
        const data = mesh.getVerticesData('position');
        if (!data) continue;
        mesh.computeWorldMatrix(true);
        const matrix = mesh.getWorldMatrix();
        for (let i = 0; i < data.length; i += 3) {
          const v = Vector3.TransformCoordinates(
            new Vector3(data[i], data[i + 1], data[i + 2]),
            matrix,
          );
          sunbed.push({ x: v.x, z: v.z });
        }
      }
      expect(sunbed.length).toBeGreaterThan(1000);

      // Cada assento precisa cair em cima de uma espreguiçadeira (senão o avatar senta no ar).
      for (const seat of BEACH.seats) {
        const distance = Math.min(
          ...sunbed.map((point) =>
            Math.hypot(point.x - seat.position.x, point.z - seat.position.z),
          ),
        );
        expect(distance, `assento em ${seat.position.x},${seat.position.z}`).toBeLessThan(0.5);
        // E olhar para o mar (-z): em `forward = (sin heading, cos heading)` o cosseno é negativo.
        expect(Math.cos(seat.heading), `heading ${seat.heading}`).toBeLessThan(-0.2);
      }
      entries.dispose();
    } finally {
      engine.dispose();
    }
  }, 60000);
});
