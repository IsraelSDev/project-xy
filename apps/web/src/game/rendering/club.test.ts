import { CLUB } from '@3dx/game-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clubFloorHeight } from './club';

const roomFile = fileURLToPath(
  new URL('../../../public/assets/3dx/rooms/club7/club7.glb', import.meta.url),
);

/** Lê o chunk JSON de um GLB sem carregar a geometria. */
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

function material(json: Record<string, any>, token: string): any {
  const found = json.materials.find((item: any) => item.name.includes(token));
  expect(found, `material ${token}`).toBeDefined();
  return found;
}

describe('balada (club7)', () => {
  it('é um GLB estático com salão, lounge, bar e piso', () => {
    const json = glbJson(roomFile);
    expect(json.asset?.version).toBe('2.0');
    expect(json.animations ?? []).toHaveLength(0);
    expect(json.skins ?? []).toHaveLength(0);
    expect(json.meshes.length).toBeGreaterThanOrEqual(56);
    expect(json.materials.length).toBeGreaterThanOrEqual(56);

    const names = json.meshes.map((mesh: any) => mesh.name).join(' ');
    expect(names).toMatch(/concrete_floor/);
    expect(names).toMatch(/tile_1/);
    expect(names).toMatch(/bar/);
    expect(names).toMatch(/sofa/);
    expect(names).toMatch(/dj_pult/);
    expect(names).toMatch(/neon_yellow/);
  });

  it('tem escala de sala e piso em y=0', () => {
    const json = glbJson(roomFile);
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
    expect(size[0]).toBeGreaterThan(20);
    expect(size[0]).toBeLessThan(22);
    expect(size[1]).toBeGreaterThan(7);
    expect(size[1]).toBeLessThan(8);
    expect(size[2]).toBeGreaterThan(41);
    expect(size[2]).toBeLessThan(42);
    expect(Math.abs(min[1]!)).toBeLessThan(0.1);
  });

  it('leva normal maps e emissivos (detalhe e iluminação) com tangentes', () => {
    const json = glbJson(roomFile);
    expect(json.extensionsUsed).toContain('KHR_materials_emissive_strength');

    for (const token of ['concrete_floor', 'tile_2', 'sofa_3', 'bar_stool_1']) {
      expect(material(json, token).normalTexture, `normal de ${token}`).toBeDefined();
    }

    const neon = material(json, 'neon_yellow');
    expect(neon.emissiveTexture).toBeDefined();
    expect(neon.emissiveFactor).toEqual([1, 1, 1]);
    expect(neon.extensions?.KHR_materials_emissive_strength?.emissiveStrength).toBeGreaterThan(1);

    for (const token of ['soffit1_flare', 'soffit3_flare', 'bar_1']) {
      const item = material(json, token);
      expect(item.emissiveTexture, `emissivo de ${token}`).toBeDefined();
    }

    for (const mesh of json.meshes) {
      expect(mesh.primitives[0].attributes.TANGENT, `tangente de ${mesh.name}`).toBeDefined();
    }
  });

  it('sobe o avatar no piso elevado do bar (o servidor só replica x/z)', () => {
    expect(clubFloorHeight(-3, -6)).toBe(0.5);
    // O piso elevado vai até a grade do bar (x=0,5) — o spawn (0, -2,5) é em cima dele.
    expect(clubFloorHeight(0, -6)).toBe(0.5);
    expect(clubFloorHeight(0.5, -6)).toBe(0.5);
    expect(clubFloorHeight(-0.17, -6)).toBe(0.5);
    expect(clubFloorHeight(-0.5, -1.12)).toBe(0.5);
    // A escada leste só existe na faixa de neon z -7,09..-5,09, logo à frente da borda.
    expect(clubFloorHeight(0.87, -5.92)).toBeGreaterThan(0);
    expect(clubFloorHeight(0.87, -5.92)).toBeLessThan(0.5);
    // A escada norte só existe na faixa de neon x -0,50..0,50.
    expect(clubFloorHeight(0.82, -1.38)).toBe(0);
    // Nada de subir encostado na lateral do bar.
    expect(clubFloorHeight(1.25, -3.23)).toBe(0);
    expect(clubFloorHeight(9.5, -1.5)).toBe(0.5);
    expect(clubFloorHeight(8.8, -0.5)).toBe(0.5);
    // O palco visual é bem mais largo que a mesa do DJ; a borda fica além do avatar.
    expect(clubFloorHeight(10.3, 0)).toBe(0.5);
    expect(clubFloorHeight(11.2, 0.5)).toBe(0.5);
    // A escada do DJ só existe na faixa de neon z 0,80..1,47.
    expect(clubFloorHeight(9.8, 1.05)).toBeGreaterThan(0);
    expect(clubFloorHeight(9.8, 1.05)).toBeLessThan(0.5);
    expect(clubFloorHeight(9.8, -0.35)).toBe(0.5);
    expect(clubFloorHeight(3, -3.5)).toBe(0);
    expect(clubFloorHeight(0, 0)).toBe(0);
    // O spawn do layout (3, -3,5) é na pista, no piso baixo.
    expect(clubFloorHeight(CLUB.spawn.position.x, CLUB.spawn.position.z)).toBe(0);
  });

  it('embute as texturas em PNG na resolução nativa', () => {
    const json = glbJson(roomFile);
    expect(json.images.length).toBeGreaterThanOrEqual(55);
    for (const image of json.images) {
      expect(image.mimeType).toBe('image/png');
      expect(image.bufferView).toBeTypeOf('number');
    }
    // Nenhum atlas foi reduzido para 512: os materiais principais usam 1024.
    const bufferViews = json.bufferViews;
    const sizes = json.images.map((image: any) => bufferViews[image.bufferView].byteLength);
    expect(Math.max(...sizes)).toBeGreaterThan(200 * 1024);
  });
});
