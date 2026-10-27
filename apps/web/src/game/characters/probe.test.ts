import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { it } from 'vitest';
import './gltf-loaders';
import { normalizeModelTo } from './avatar-model';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

it('probe sit placement', async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 0, -3), scene);
  const bytes = new Uint8Array(readFileSync(`${publicDir}/assets/3dx/character_male.glb`));
  const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
  const entries = container.instantiateModelsToScene(undefined, false);
  const modelRoot = new TransformNode('root', scene);
  for (const root of entries.rootNodes) root.parent = modelRoot;
  const meshes = entries.rootNodes
    .flatMap((root) => root.getChildMeshes(false))
    .filter((mesh) => mesh.getTotalVertices() > 0);
  normalizeModelTo(modelRoot, meshes, 1.7);
  console.log('modelRoot', modelRoot.position.toString(), modelRoot.scaling.toString());
  console.log('groups', entries.animationGroups.map((g) => g.name).join(','));
  const group = entries.animationGroups.find((g) => g.name.includes('sit_sofa'));
  if (!group) throw new Error('sem sit_sofa');
  group.start(true, 1, 0, 0);
  scene.render();
  const skeleton = entries.skeletons[0];
  for (const name of ['b0', 'b4', 'b18', 'b148']) {
    const node = skeleton?.bones.find((bone) => bone.name === name)?.getTransformNode();
    console.log(name, node?.getAbsolutePosition().toString());
  }
  void Vector3;
});
