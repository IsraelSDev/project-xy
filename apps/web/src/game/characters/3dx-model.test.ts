import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { describe, expect, it } from 'vitest';
import './gltf-loaders';
import {
  JOINTS_3DX_FEMALE,
  JOINTS_3DX_MALE,
  bindJoints,
  motionClip,
  pickRig,
} from './avatar-model';
import { sameBoneLayout } from './avatar-parts';
import type { Joint } from './mannequin';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

/** 3DX nativo: arquivo, nomes das malhas e o mapa de juntas (que muda de índice por gênero). */
const GENDERS = [
  {
    model: '3dx-male',
    file: 'character_male.glb',
    // O masculino leva a anatomia como quarta peça (Fase B3); a feminina ainda não tem peça própria.
    meshes: ['man_body', 'man_head', 'man_eyelashes', 'man_penis'],
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

/** Fase C: primeira roupa nativa, já retargetada para o mesmo esqueleto do corpo. */
const OUTFITS = [
  {
    model: '3dx-male',
    files: [
      'clothes/top/3dx_m_top_shirt.glb',
      'clothes/bottom/3dx_m_bottom_pants.glb',
      'clothes/underwear/3dx_m_underwear_briefs.glb',
      'hair/3dx_m_hair_15.glb',
    ],
    joints: JOINTS_3DX_MALE,
  },
  {
    model: '3dx-female',
    files: [
      'clothes/top/3dx_f_top_shirt.glb',
      'clothes/bottom/3dx_f_bottom_pants.glb',
      'clothes/underwear/3dx_f_underwear_panties.glb',
      'hair/3dx_f_hair_30.glb',
    ],
    joints: JOINTS_3DX_FEMALE,
  },
] as const;

describe('modelo 3DX nativo (corpo + cabeça + cílios [+ anatomia no masculino])', () => {
  it.each(GENDERS)(
    '$model: idle nativo, esqueleto do mapa de juntas e malhas com skinning',
    async ({ model, file, meshes: expected, joints }) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const container = await load(scene, file);

      // Fase E: o corpo carrega os clipes nativos (`stay_pose_1` e `walk` assados no rest pose).
      expect(container.animationGroups.map((group) => group.name).sort()).toEqual([
        'idle',
        'pose01',
        'walk',
      ]);
      expect(motionClip(model, '', false)).toBe('idle');
      expect(motionClip(model, '', true)).toBe('walk');
      expect(motionClip(model, 'pose01', false)).toBe('pose01');
      const walk = container.animationGroups.find((group) => group.name === 'walk');
      expect(walk?.getLength()).toBeCloseTo(1.2, 3);
      const pose = container.animationGroups.find((group) => group.name === 'pose01');
      expect(pose?.getLength()).toBeCloseTo(1.33, 2);

      const entries = container.instantiateModelsToScene(undefined, false);
      const rig = pickRig(entries.skeletons, joints.pelvis);
      expect(rig, 'esqueleto com o osso do quadril').toBeDefined();
      expect(
        entries.animationGroups.map((group) => group.name.replace(/^Clone of /, '')).sort(),
      ).toEqual(['idle', 'pose01', 'walk']);

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

describe('walk 3DX masculino (balançada lateral)', () => {
  it('a cabeça não oscila mais que ~6 cm de um lado ao outro', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const container = await load(scene, 'character_male.glb');
      const entries = container.instantiateModelsToScene(undefined, false);
      const rig = pickRig(entries.skeletons, JOINTS_3DX_MALE.pelvis);
      expect(rig, 'esqueleto do corpo').toBeDefined();
      const head = rig!.bones
        .find((bone) => bone.name === JOINTS_3DX_MALE.head)
        ?.getTransformNode();
      expect(head, 'osso da cabeça').toBeDefined();
      const walk = entries.animationGroups.find(
        (group) => group.name.replace(/^Clone of /, '') === 'walk',
      );
      expect(walk, 'clipe walk').toBeDefined();
      // NullEngine precisa de câmera para `scene.render()` aplicar as animações.
      new FreeCamera('test-camera', new Vector3(0, 1, -5), scene);

      walk!.start(true, 1);
      walk!.pause();
      const xs: number[] = [];
      for (let frame = 0; frame <= walk!.to; frame++) {
        walk!.goToFrame(frame);
        scene.render();
        head!.computeWorldMatrix(true);
        xs.push(head!.getAbsolutePosition().x);
      }
      const sway = Math.max(...xs) - Math.min(...xs);
      expect(sway, `balançada da cabeça: ${(sway * 100).toFixed(2)} cm`).toBeLessThan(0.06);
      expect(sway, 'o clipe precisa estar aplicando a animação').toBeGreaterThan(0.005);
      walk!.stop();
      entries.dispose();
    } finally {
      engine.dispose();
    }
  }, 60000);
});

describe('roupas 3DX da Fase C (retargetadas para o esqueleto do corpo)', () => {
  it.each(OUTFITS)(
    '$model: GLBs em rest, mesmo esqueleto e skinning',
    async ({ model, files, joints }) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        // O corpo é a fonte do esqueleto: as peças trocam o clone próprio por ele e passam a
        // acompanhar o idle nativo (ver `attachAvatarParts`).
        const body = await load(
          scene,
          model === '3dx-male' ? 'character_male.glb' : 'character_female.glb',
        );
        const bodyEntries = body.instantiateModelsToScene(undefined, false);
        const bodyRig = pickRig(bodyEntries.skeletons, joints.pelvis);
        expect(bodyRig, 'esqueleto do corpo').toBeDefined();
        for (const file of files) {
          const container = await load(scene, file);
          expect(container.animationGroups, file).toHaveLength(0);
          const entries = container.instantiateModelsToScene(undefined, false);
          const rig = pickRig(entries.skeletons, joints.pelvis);
          expect(rig, `${file}: quadril ${joints.pelvis}`).toBeDefined();
          // O esqueleto da peça é o mesmo do corpo (322 ossos no masculino, 464 no feminino).
          expect(rig!.bones.length, file).toBeGreaterThan(300);
          expect(sameBoneLayout(rig!, bodyRig!), `${file}: ordem dos ossos`).toBe(true);
          const meshes = entries.rootNodes
            .flatMap((root) => root.getChildMeshes(false))
            .filter((mesh) => mesh.getTotalVertices() > 0);
          expect(meshes.length, file).toBeGreaterThan(0);
          for (const mesh of meshes) {
            expect(
              mesh.isVerticesDataPresent(VertexBuffer.MatricesIndicesKind),
              `${file}: ${mesh.name}`,
            ).toBe(true);
            expect(
              mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsKind),
              `${file}: ${mesh.name}`,
            ).toBe(true);
            mesh.skeleton = bodyRig!;
            expect(mesh.skeleton, `${file}: ${mesh.name}`).toBe(bodyRig);
          }
          if (file.startsWith('hair/')) {
            // Cabelo é atlas de fios com alfa; sem UV ou textura vira um bloco opaco.
            for (const mesh of meshes) {
              expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind), `${file}: UV`).toBe(true);
            }
            expect(
              meshes.some(
                (mesh) =>
                  mesh.material instanceof PBRMaterial && mesh.material.albedoTexture !== null,
              ),
              `${file}: textura de cabelo`,
            ).toBe(true);
          }
          entries.dispose();
        }
        bodyEntries.dispose();
      } finally {
        engine.dispose();
      }
    },
    60000,
  );
});
