import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import '@babylonjs/loaders/glTF';
import { DEFAULT_AVATAR, parseAvatar } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { CREATIVE_JOINTS, bindJoints, pickRig } from './avatar-model';
import { equippedPartIds } from './avatar-parts';
import { MANNEQUIN_JOINTS } from './mannequin';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

async function loadBytes(scene: Scene, file: string): Promise<AssetContainer> {
  const bytes = new Uint8Array(readFileSync(`${publicDir}/test-assets/${file}`));
  return LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
}

function drivesOf(container: AssetContainer) {
  const entries = container.instantiateModelsToScene(undefined, false);
  return bindJoints(pickRig(entries.skeletons, CREATIVE_JOINTS.pelvis), CREATIVE_JOINTS);
}

const noParts: typeof DEFAULT_AVATAR = {
  ...DEFAULT_AVATAR,
  hair: 'none',
  top: 'none',
  bottom: 'none',
};

describe('equippedPartIds', () => {
  it('reúne as peças por slot, em ordem, só no modelo creative', () => {
    const config = parseAvatar({ ...noParts, hat: 'Hat_010', glasses: 'Glasses_004' });
    expect(equippedPartIds(config)).toEqual(['Hat_010', 'Glasses_004']);
    expect(equippedPartIds(parseAvatar({ ...config, model: 'feminine' }))).toEqual([]);
  });

  it('ignora valor do catálogo antigo (sem arquivo de peça)', () => {
    const config = parseAvatar({ ...noParts, hair: 'long', shoes: 'Shoe_Sneakers_009' });
    expect(equippedPartIds(config)).toEqual(['Shoe_Sneakers_009']);
  });
});

describe('peças da biblioteca', () => {
  it('têm a mesma pose de repouso do corpo creative', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const body = await loadBytes(scene, 'Body_010.glb');
    const shirt = await loadBytes(scene, 'T-Shirt_009.glb');
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
