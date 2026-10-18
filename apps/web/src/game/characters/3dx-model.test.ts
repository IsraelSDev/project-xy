import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { describe, expect, it } from 'vitest';
import './gltf-loaders';
import { JOINTS_3DX_FEMALE, JOINTS_3DX_MALE, bindJoints, pickRig } from './avatar-model';
import type { Joint } from './mannequin';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

/** 3DX nativo: arquivo, nomes das malhas e o mapa de juntas (que muda de índice por gênero). */
const GENDERS = [
  {
    model: '3dx-male',
    file: 'character_male.glb',
    meshes: ['man_body', 'man_head', 'man_eyelashes'],
    joints: JOINTS_3DX_MALE,
  },
  {
    model: '3dx-female',
    file: 'character_female.glb',
    meshes: ['woman_body', 'woman_head', 'woman_eyelashes'],
    joints: JOINTS_3DX_FEMALE,
  },
] as const;

async function load(scene: Scene, file: string): Promise<AssetContainer> {
  const bytes = new Uint8Array(readFileSync(`${publicDir}/assets/3dx/${file}`));
  return LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
}

describe('modelo 3DX nativo (corpo + cabeça + cílios)', () => {
  it.each(GENDERS)(
    '$model: sem animação, esqueleto do mapa de juntas e malhas com skinning',
    async ({ file, meshes: expected, joints }) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const container = await load(scene, file);

      // As animações entram na Fase E: por ora o GLB é só a pose de repouso.
      expect(container.animationGroups).toHaveLength(0);

      const entries = container.instantiateModelsToScene(undefined, false);
      const rig = pickRig(entries.skeletons, joints.pelvis);
      expect(rig, 'esqueleto com o osso do quadril').toBeDefined();

      const drives = bindJoints(rig, joints);
      // Todos os ossos do mapa precisam existir no GLB, senão a pose/raiz não acham o osso.
      for (const joint of Object.keys(joints) as Joint[]) {
        expect(drives[joint], joint).toBeDefined();
      }

      const names = entries.rootNodes
        .flatMap((root) => root.getChildMeshes(false))
        .filter((mesh) => mesh.getTotalVertices() > 0);
      // `instantiateModelsToScene` prefixa as malhas clonadas com "Clone of ".
      expect(names.map((mesh) => mesh.name.replace(/^Clone of /, '')).sort()).toEqual(
        [...expected].sort(),
      );
      for (const mesh of names) {
        expect(mesh.isVerticesDataPresent(VertexBuffer.MatricesIndicesKind), mesh.name).toBe(true);
        expect(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsKind), mesh.name).toBe(true);
      }

      entries.dispose();
      engine.dispose();
    },
    60000,
  );
});
