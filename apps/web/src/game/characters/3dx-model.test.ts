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
  freezeFaceOnSit,
  JOINTS_3DX_FEMALE,
  JOINTS_3DX_MALE,
  motionClip,
  pickRig,
  stripRootMotion,
} from './avatar-model';
import { sameBoneLayout } from './avatar-parts';
import { AVATAR_PARTS, partFitsModel } from '@3dx/contracts';
import type { Joint } from './mannequin';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

/** 3DX nativo: arquivo, nomes das malhas e o mapa de juntas (que muda de índice por gênero). */
const GENDERS = [
  {
    model: '3dx-male',
    file: 'character_male.glb',
    // O masculino leva a anatomia como quarta peça (Fase B3); a feminina ainda não tem peça própria.
    meshes: ['man_body', 'man_head', 'man_eyelashes', 'man_jaw_eyes_atlas', 'man_penis'],
    joints: JOINTS_3DX_MALE,
  },
  {
    model: '3dx-female',
    file: 'character_female.glb',
    meshes: ['woman_body', 'woman_head', 'woman_eyelashes', 'woman_jaw_eyes_atlas'],
    joints: JOINTS_3DX_FEMALE,
  },
] as const;

/** Clipes de par embutidos em ambos os corpos (pair05 é só o piloto F/F, não publicado). */
const PAIR_ACTIONS = [
  'pair01',
  'pair02',
  'pair03',
  'pair04',
  'pair06',
  'pair07',
  'pair08',
  'pair09',
] as const;

/** Pares M/F de móvel (sofa/chair/bed), importados dos bundles nativos. */
const SEATED_PAIR_ACTIONS = [
  'pair10',
  'pair11',
  'pair12',
  'pair13',
  'pair14',
  'pair15',
  'pair16',
  'pair17',
] as const;
const SEATED_PAIR_LENGTHS: Readonly<Record<(typeof SEATED_PAIR_ACTIONS)[number], number>> = {
  pair10: 4.0,
  pair11: 4.0,
  pair12: 4.0,
  pair13: 6.63,
  pair14: 4.0,
  pair15: 6.67,
  pair16: 6.63,
  pair17: 8.0,
};

/** Clipes nativos de sentar, um por tipo de móvel. */
const SIT_ACTIONS = ['sit_chair', 'sit_sofa', 'sit_stool'] as const;
// O masculino não tem clipe de sofá próprio que caiba nos nossos sofás (o `man@sofa_sit`
// original é uma pose de chaise longa, com o tronco deitado e os braços abertos), então o
// `sit_sofa` dele vem do clipe de cadeira (postura sentada ereta, com as mãos no colo).
const SIT_LENGTHS = {
  '3dx-male': { sit_sofa: 4.0, sit_chair: 4.0, sit_stool: 2.0 },
  '3dx-female': { sit_sofa: 6.67, sit_chair: 4.0, sit_stool: 2.0 },
} as const;

async function load(scene: Scene, file: string): Promise<AssetContainer> {
  const bytes = new Uint8Array(readFileSync(`${publicDir}/assets/3dx/${file}`));
  return LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
}

/** Toda peça 3DX do catálogo (roupa, cabelo e acessório), retargetada para o corpo. */
const filesFor = (model: '3dx-male' | '3dx-female') =>
  AVATAR_PARTS.filter((part) => part.file && partFitsModel(part, model)).map((part) =>
    (part.file as string).replace(/^3dx\//, ''),
  );

const OUTFITS = [
  { model: '3dx-male', files: filesFor('3dx-male'), joints: JOINTS_3DX_MALE },
  { model: '3dx-female', files: filesFor('3dx-female'), joints: JOINTS_3DX_FEMALE },
] as const;

describe('modelo 3DX nativo (corpo + cabeça + cílios [+ anatomia no masculino])', () => {
  it.each(GENDERS)(
    '$model: idle nativo, esqueleto do mapa de juntas e malhas com skinning',
    async ({ model, file, meshes: expected, joints }) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const container = await load(scene, file);

      // Fase E: o corpo carrega os clipes nativos (`stay_pose_1` e `walk` assados no rest pose).
      expect(container.animationGroups.map((group) => group.name).sort()).toEqual(
        [
          'idle',
          ...PAIR_ACTIONS,
          ...SEATED_PAIR_ACTIONS,
          ...SIT_ACTIONS,
          'pose01',
          'walk',
          ...(model === '3dx-female' ? ['dance', 'dance2'] : []),
        ].sort(),
      );
      expect(motionClip(model, '', false)).toBe('idle');
      expect(motionClip(model, '', true)).toBe('walk');
      expect(motionClip(model, 'pose01', false)).toBe('pose01');
      for (const action of [...PAIR_ACTIONS, ...SEATED_PAIR_ACTIONS]) {
        expect(motionClip(model, action, false)).toBe(action);
      }
      expect(motionClip(model, 'dance', false)).toBe(model === '3dx-female' ? 'dance' : undefined);
      expect(motionClip(model, 'dance2', false)).toBe(
        model === '3dx-female' ? 'dance2' : undefined,
      );
      expect(motionClip(model, 'sit', false, 'sofa')).toBe('sit_sofa');
      expect(motionClip(model, 'sit', false, 'chair')).toBe('sit_chair');
      expect(motionClip(model, 'sit', false, 'stool')).toBe('sit_stool');
      // Sem mobília conhecida, senta como sofá (comportamento anterior preservado).
      expect(motionClip(model, 'sit', false)).toBe('sit_sofa');
      const walk = container.animationGroups.find((group) => group.name === 'walk');
      expect(walk?.getLength()).toBeCloseTo(1.2, 3);
      const pose = container.animationGroups.find((group) => group.name === 'pose01');
      expect(pose?.getLength()).toBeCloseTo(1.33, 2);
      for (const action of PAIR_ACTIONS) {
        const group = container.animationGroups.find((item) => item.name === action);
        expect(group?.getLength(), action).toBeCloseTo(3.67, 2);
      }
      for (const action of SEATED_PAIR_ACTIONS) {
        const group = container.animationGroups.find((item) => item.name === action);
        expect(group?.getLength(), action).toBeCloseTo(SEATED_PAIR_LENGTHS[action], 2);
      }
      for (const action of SIT_ACTIONS) {
        const group = container.animationGroups.find((item) => item.name === action);
        expect(group?.getLength(), action).toBeCloseTo(SIT_LENGTHS[model][action], 2);
      }

      const entries = container.instantiateModelsToScene(undefined, false);
      const rig = pickRig(entries.skeletons, joints.pelvis);
      expect(rig, 'esqueleto com o osso do quadril').toBeDefined();
      expect(
        entries.animationGroups.map((group) => group.name.replace(/^Clone of /, '')).sort(),
      ).toEqual(
        [
          'idle',
          ...PAIR_ACTIONS,
          ...SEATED_PAIR_ACTIONS,
          ...SIT_ACTIONS,
          'pose01',
          'walk',
          ...(model === '3dx-female' ? ['dance', 'dance2'] : []),
        ].sort(),
      );

      // Todos os ossos do mapa precisam existir no GLB, senão a raiz/poses não acham o osso.
      for (const joint of Object.keys(joints) as Joint[]) {
        expect(
          rig?.bones.some((bone) => bone.name === joints[joint]),
          joint,
        ).toBe(true);
      }

      if (model === '3dx-male') {
        // No masculino a pelve (b4) é a raiz da malha do quadril: 553 vértices têm peso 1 nela.
        // A translação do clipe de sentar é a descida até o assento (pose), não root motion. Se
        // `stripRootMotion` a remover, a pelve fica na altura de pé (0,88 m) enquanto as pernas
        // sentam (0,48 m) e o quadril rasga — só no jogo, pois o GLB está correto.
        const pelvisNode = rig!.bones
          .find((bone) => bone.name === joints.pelvis)
          ?.getTransformNode();
        const sit = entries.animationGroups.find(
          (group) => group.name.replace(/^Clone of /, '') === 'sit_sofa',
        );
        expect(pelvisNode, 'osso do quadril').toBeDefined();
        expect(sit, 'clipe sit_sofa').toBeDefined();
        stripRootMotion(entries.animationGroups, pelvisNode!);
        new FreeCamera('sit-camera', new Vector3(0, 1, -5), scene);
        sit!.start(true, 1);
        sit!.pause();
        sit!.goToFrame(0);
        scene.render();
        expect(pelvisNode!.position.y, 'pelve desce até o assento').toBeCloseTo(0.548, 2);
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

      // Sentar congela a cadeia facial (mandíbula/lábios/olhos): no corpo retargetado ela deforma
      // o rosto e deixa a boca torta. Só os clipes de sentar perdem essas animações.
      const groupNamed = (name: string) =>
        entries.animationGroups.find((group) => group.name.replace(/^Clone of /, '') === name)!;
      const sitSofa = groupNamed('sit_sofa');
      const idle = groupNamed('idle');
      const sitBefore = sitSofa.targetedAnimations.length;
      const idleBefore = idle.targetedAnimations.length;
      freezeFaceOnSit(entries.animationGroups, rig!, names);
      expect(sitSofa.targetedAnimations.length, 'face congelada no sentar').toBeLessThan(sitBefore);
      expect(idle.targetedAnimations.length, 'idle preservado').toBe(idleBefore);

      // Fase F: o corpo/cabeça levam o atlas nativo no albedo e o normal map no bump; os cílios são
      // um recorte com alfa (sem normal). Sem isso o modelo volta a ser uma pele chapada.
      for (const mesh of names) {
        const material = mesh.material;
        expect(material instanceof PBRMaterial, mesh.name).toBe(true);
        if (!(material instanceof PBRMaterial)) continue;
        expect(material.albedoTexture, `${mesh.name}: albedo`).not.toBeNull();
        expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind), `${mesh.name}: UV`).toBe(true);
        if (/eyelash/i.test(mesh.name)) {
          expect(material.bumpTexture, `${mesh.name}: sem normal`).toBeNull();
        } else {
          expect(material.bumpTexture, `${mesh.name}: normal`).not.toBeNull();
        }
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

describe('peças 3DX (roupas, cabelo e acessórios) no esqueleto do corpo', () => {
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
          } else if (file.startsWith('clothes/')) {
            // Roupa leva o normal map do tecido (e o albedo quando a peça tem): é o que tira o
            // aspecto de pano chapado; o albedo branco recebe a cor do `TintPlugin` no jogo.
            for (const mesh of meshes) {
              expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind), `${file}: UV`).toBe(true);
            }
            expect(
              meshes.some(
                (mesh) =>
                  mesh.material instanceof PBRMaterial && mesh.material.bumpTexture !== null,
              ),
              `${file}: normal map`,
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
