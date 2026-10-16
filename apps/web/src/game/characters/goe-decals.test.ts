import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { DecalChoice } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import './gltf-loaders';
import { DECAL_ANCHORS, createDecalLayer } from './goe-decals';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

async function loadBytes(scene: Scene, file: string): Promise<AssetContainer> {
  const bytes = new Uint8Array(readFileSync(`${publicDir}/assets/goe/${file}`));
  return LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
}

/** Um decalque por slot (a categoria é livre; checamos só a colocação geométrica). */
const decals: DecalChoice[] = (Object.keys(DECAL_ANCHORS) as DecalChoice['slot'][]).map((slot) => ({
  slot,
  category: '12_tattoo_oldschool',
  image: 'd_old_school_tattoo_01',
}));

describe('âncoras de decalque', () => {
  it('assentam na pele com a frente para fora e o topo para cima', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const body = await loadBytes(scene, 'GoE_Male.glb');
    const entries = body.instantiateModelsToScene(undefined, false);
    const skeleton = entries.skeletons[0];
    expect(skeleton).toBeDefined();
    skeleton?.prepare();

    const layer = createDecalLayer(scene, skeleton);
    layer.apply(decals, true);
    expect(layer.meshes).toHaveLength(decals.length);

    for (const mesh of layer.meshes) {
      const slot = mesh.name.split('-')[1] as DecalChoice['slot'];
      const anchor = DECAL_ANCHORS[slot];
      expect(anchor, mesh.name).toBeDefined();
      const bone = skeleton?.bones.find((candidate) => candidate.name === anchor.bone);
      const boneNode = bone?.getTransformNode();
      expect(boneNode, anchor.bone).toBeDefined();
      boneNode?.computeWorldMatrix(true);

      mesh.computeWorldMatrix(true);
      const rotation = mesh.getWorldMatrix().getRotationMatrix();
      // O plano do Babylon olha para -Z; a frente texturizada é o -Z transformado.
      const front = Vector3.TransformNormal(Vector3.Backward(), rotation).normalize();
      const top = Vector3.TransformNormal(Vector3.Up(), rotation).normalize();
      const bonePosition = (boneNode?.getAbsolutePosition() ?? Vector3.Zero()).clone();
      const outward = mesh.getAbsolutePosition().subtract(bonePosition);

      // Frente aponta para fora do osso (o plano não atravessa o corpo).
      expect(Vector3.Dot(front, outward), `${mesh.name}: frente para fora`).toBeGreaterThan(0);
      // Topo para cima (imagem em pé).
      expect(top.y, `${mesh.name}: topo para cima`).toBeGreaterThan(0.3);
    }

    layer.dispose();
    engine.dispose();
  }, 60000);
});
