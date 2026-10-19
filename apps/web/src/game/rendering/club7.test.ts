import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const clubFile = fileURLToPath(
  new URL('../../../public/assets/3dx/rooms/club7/club7.glb', import.meta.url),
);

function glbJson(path: string): Record<string, any> {
  const buffer = readFileSync(path);
  expect(buffer.readUInt32LE(0), 'magic glTF').toBe(0x46546c67);
  expect(buffer.readUInt32LE(4), 'versão glTF').toBe(2);
  let offset = 12;
  while (offset < buffer.byteLength) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
    if (type === 0x4e4f534a) return JSON.parse(data.toString('utf8'));
  }
  throw new Error('GLB sem chunk JSON');
}

describe('balada nativa (level7)', () => {
  it('traz bar, DJ, móveis e texturas, sem animação', () => {
    const json = glbJson(clubFile);
    expect(json.asset?.version).toBe('2.0');
    expect(json.animations ?? []).toHaveLength(0);
    expect(json.skins ?? []).toHaveLength(0);
    expect(json.meshes.length).toBeGreaterThan(45);
    expect(json.materials.length).toBeGreaterThan(45);
    expect(json.images.length).toBeGreaterThan(20);
    expect(json.meshes.some((mesh: any) => /bar/i.test(mesh.name))).toBe(true);
    expect(json.meshes.some((mesh: any) => /dj_pult/i.test(mesh.name))).toBe(true);
    expect(json.meshes.some((mesh: any) => /sofa|stool/i.test(mesh.name))).toBe(true);
  });

  it('fica na escala de um clube (não um prop solto)', () => {
    const json = glbJson(clubFile);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION];
        const lower = accessor.min as number[];
        const upper = accessor.max as number[];
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis]!, lower[axis]!);
          max[axis] = Math.max(max[axis]!, upper[axis]!);
        }
      }
    }
    const size = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
    expect(size[0]).toBeGreaterThan(8);
    expect(size[0]).toBeLessThan(30);
    expect(size[1]).toBeGreaterThan(3);
    expect(size[1]).toBeLessThan(12);
    expect(size[2]).toBeGreaterThan(15);
    expect(size[2]).toBeLessThan(55);
  });
});
