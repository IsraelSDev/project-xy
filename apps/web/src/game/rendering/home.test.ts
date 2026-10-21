import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const roomFile = fileURLToPath(
  new URL('../../../public/assets/3dx/rooms/home/home.glb', import.meta.url),
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
  materials: { name?: string; alphaMode?: string }[];
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

describe('quarto padrão (home)', () => {
  it('é um GLB estático com o quarto, móveis e materiais', () => {
    const json = glbJson(roomFile);
    expect(json.asset?.version).toBe('2.0');
    expect(json.animations ?? []).toHaveLength(0);
    expect(json.skins ?? []).toHaveLength(0);
    expect(json.meshes.length).toBeGreaterThan(90);
    expect(json.materials.length).toBeGreaterThan(90);
    expect(json.images.length).toBeGreaterThan(70);
    expect(json.meshes.some((mesh) => /Bed/i.test(mesh.name ?? ''))).toBe(true);
    expect(json.meshes.some((mesh) => /Room_Walls/i.test(mesh.name ?? ''))).toBe(true);
    expect(
      json.materials.some(
        (material) => /Glass|Window/i.test(material.name ?? '') && material.alphaMode === 'BLEND',
      ),
      'vidro com transparência',
    ).toBe(true);
  });

  it('tem escala de sala (não um prop gigante ou uma caixa de colisão)', () => {
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
    const size = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
    expect(size[0]).toBeGreaterThan(5);
    expect(size[0]).toBeLessThan(12);
    expect(size[1]).toBeGreaterThan(4);
    expect(size[1]).toBeLessThan(8);
    expect(size[2]).toBeGreaterThan(7);
    expect(size[2]).toBeLessThan(15);
  });
});
