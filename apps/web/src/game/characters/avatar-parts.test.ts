import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import './gltf-loaders';
import { DEFAULT_AVATAR, defaultAvatarFor, parseAvatar } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { GOE_JOINTS, bindJoints, pickRig } from './avatar-model';
import { equippedPartIds } from './avatar-parts';
import { MANNEQUIN_JOINTS } from './mannequin';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

async function loadBytes(scene: Scene, file: string): Promise<AssetContainer> {
  const bytes = new Uint8Array(readFileSync(`${publicDir}/assets/goe/${file}`));
  return LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
}

function drivesOf(container: AssetContainer) {
  const entries = container.instantiateModelsToScene(undefined, false);
  return bindJoints(pickRig(entries.skeletons, GOE_JOINTS.pelvis), GOE_JOINTS);
}

const noParts: typeof DEFAULT_AVATAR = {
  ...DEFAULT_AVATAR,
  top: 'none',
  outerwear: 'none',
  bottom: 'none',
  shoes: 'none',
};

describe('equippedPartIds', () => {
  it('reúne as peças do modelo, na ordem dos slots', () => {
    const config = parseAvatar({
      ...noParts,
      top: 'GoE_M_Top_Fitness',
      shoes: 'GoE_M_Shoes_Fitness',
    });
    expect(equippedPartIds(config)).toEqual(['GoE_M_Top_Fitness', 'GoE_M_Shoes_Fitness']);
  });

  it('ignora peça que não serve no modelo (outro gênero)', () => {
    const config = parseAvatar({ ...noParts, top: 'GoE_F_Top_Sportswear' });
    expect(equippedPartIds(config)).toEqual([]);
  });

  it('com o casaco vestido a camiseta não é desenhada (mesma camada)', () => {
    const config = parseAvatar({
      ...noParts,
      top: 'GoE_M_Top_Fitness',
      outerwear: 'GoE_M_Outerwear_Street',
      shoes: 'GoE_M_Shoes_Fitness',
    });
    expect(equippedPartIds(config)).toEqual(['GoE_M_Outerwear_Street', 'GoE_M_Shoes_Fitness']);
  });

  it('a anatomia masculina só aparece sem short ou calça', () => {
    const bare = parseAvatar({ ...noParts, genitals: 'GoE_M_Genitals' });
    expect(equippedPartIds(bare)).toEqual(['GoE_M_Genitals']);
    for (const bottom of ['GoE_M_Bottom_Fitness', 'GoE_M_Bottom_Street']) {
      expect(equippedPartIds({ ...bare, bottom })).toEqual([bottom]);
    }
  });

  it('casaco que não serve no modelo não esconde a camiseta', () => {
    const config = parseAvatar({
      ...noParts,
      model: 'goe-female',
      top: 'GoE_F_Top_CasualSport',
      outerwear: 'GoE_M_Outerwear_Street',
    });
    expect(equippedPartIds(config)).toEqual(['GoE_F_Top_CasualSport']);
  });

  it('monta o conjunto grátis padrão de cada gênero', () => {
    expect(equippedPartIds(defaultAvatarFor('goe-male'))).toEqual([
      'GoE_M_Hair03',
      'GoE_M_Top_Fitness',
      'GoE_M_Bottom_Fitness',
      'GoE_M_Shoes_Fitness',
    ]);
    expect(equippedPartIds(defaultAvatarFor('goe-female'))).toEqual([
      'GoE_F_Hair01',
      'GoE_F_Top_CasualSport',
      'GoE_F_Bottom_CasualSport',
      'GoE_F_Shoes_Casual',
    ]);
  });

  it('a roupa íntima 3DX fica sob a calça e aparece sozinha sem ela', () => {
    const dressed = defaultAvatarFor('3dx-male');
    // Conjunto padrão: cabelo + camisa + calça (a cueca existe no config, mas não é desenhada).
    expect(equippedPartIds(dressed)).toEqual([
      '3dx_m_hair_15',
      '3dx_m_top_shirt',
      '3dx_m_bottom_pants',
    ]);
    // Sem calça, a cueca entra; sem calça e sem cueca, só cabelo e camisa.
    expect(equippedPartIds({ ...dressed, bottom: 'none' })).toEqual([
      '3dx_m_hair_15',
      '3dx_m_top_shirt',
      '3dx_m_underwear_briefs',
    ]);
    expect(equippedPartIds({ ...dressed, bottom: 'none', underwear: 'none' })).toEqual([
      '3dx_m_hair_15',
      '3dx_m_top_shirt',
    ]);
  });
});

describe('peças da biblioteca', () => {
  it('têm a mesma pose de repouso do corpo GoE', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const body = await loadBytes(scene, 'GoE_Male.glb');
    const shirt = await loadBytes(scene, 'GoE_M_Top_Fitness.glb');
    const bodyDrives = drivesOf(body);
    const shirtDrives = drivesOf(shirt);

    for (const joint of MANNEQUIN_JOINTS) {
      const bodyJoint = bodyDrives[joint];
      const shirtJoint = shirtDrives[joint];
      expect(bodyJoint, joint).toBeDefined();
      expect(shirtJoint, joint).toBeDefined();
      // |dot| = 1: mesma rotação (o sinal do quatérnio pode vir trocado).
      const dot = Math.abs(Quaternion.Dot(bodyJoint!.rest, shirtJoint!.rest));
      expect(dot, joint).toBeCloseTo(1, 4);
    }

    body.dispose();
    shirt.dispose();
    engine.dispose();
  }, 60000);
});

/** `extensionsRequired` do GLB, lido direto do cabeçalho (sem decodificar a cena). */
function requiredExtensions(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    extensionsRequired?: string[];
  };
  return json.extensionsRequired ?? [];
}

describe('cabelo original (sem compressão)', () => {
  it('carrega com skinning e mantém os ossos do corpo GoE', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    // GLBs exportados sem compressão nem quantização: posições em float32 (ver tools/goe).
    for (const file of ['GoE_M_Hair01.glb', 'GoE_F_Hair02.glb']) {
      const bytes = readFileSync(`${publicDir}/assets/goe/${file}`);
      expect(requiredExtensions(new Uint8Array(bytes)), file).not.toContain(
        'EXT_meshopt_compression',
      );

      const hair = await loadBytes(scene, file);
      const entries = hair.instantiateModelsToScene(undefined, false);
      const meshes = entries.rootNodes
        .flatMap((node) => node.getChildMeshes(false))
        .filter((mesh) => mesh.getTotalVertices() > 0);
      expect(meshes.length, file).toBeGreaterThan(0);

      const rig = pickRig(entries.skeletons, GOE_JOINTS.pelvis);
      expect(rig, `${file}: esqueleto com o quadril`).toBeDefined();
      expect(
        rig!.bones.some((bone) => bone.name === 'head.x'),
        file,
      ).toBe(true);

      for (const mesh of meshes) {
        expect(mesh.isVerticesDataPresent(VertexBuffer.MatricesIndicesKind), file).toBe(true);
        expect(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsKind), file).toBe(true);
      }
      hair.dispose();
    }
    engine.dispose();
  }, 60000);
});
