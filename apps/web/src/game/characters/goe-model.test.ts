import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import './gltf-loaders';
import { describe, expect, it, vi } from 'vitest';
import type { Pose } from '../animation/walk-cycle';
import {
  GOE_BASE,
  GOE_JOINTS,
  GOE_POSE_AXES,
  bindJoints,
  pickRig,
  poseBones,
  softenAlphaMasks,
  stripDefaultMetallic,
} from './avatar-model';
import { MANNEQUIN_JOINTS } from './mannequin';

/**
 * Corpo GoE (GoE_Male.glb, GoE Character Creator). Verifica que os 10 ossos da convenção ligam e que
 * a pose procedural do ciclo de caminhada leva as pernas/braços para a FRENTE (+Z), com o joelho
 * dobrando para trás (-Z). Sem os `GOE_POSE_AXES` corretos a caminhada abriria em espacate.
 */
const file = fileURLToPath(new URL('../../../public/assets/goe/GoE_Male.glb', import.meta.url));

const idle: Pose = {
  leftHip: 0,
  rightHip: 0,
  leftKnee: 0,
  rightKnee: 0,
  leftShoulder: 0,
  rightShoulder: 0,
  leftElbow: 0,
  rightElbow: 0,
  bob: 0,
};

function refresh(node: TransformNode) {
  node.computeWorldMatrix(true);
  for (const child of node.getChildren()) if (child instanceof TransformNode) refresh(child);
}

describe('goe model', () => {
  it('liga todos os ossos e caminha para frente (+Z), dobrando o joelho para trás', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const container = await LoadAssetContainerAsync(new Uint8Array(readFileSync(file)), scene, {
      pluginExtension: '.glb',
    });
    const entries = container.instantiateModelsToScene(undefined, false);
    const root = new TransformNode('test-root', scene);
    for (const node of entries.rootNodes) node.parent = root;

    const rig = pickRig(entries.skeletons, GOE_JOINTS.pelvis);
    expect(rig, 'esqueleto com o quadril').toBeDefined();
    const drives = bindJoints(rig, GOE_JOINTS, GOE_POSE_AXES, GOE_BASE['goe-male']);
    for (const joint of MANNEQUIN_JOINTS) {
      expect(drives[joint], `osso ${joint}`).toBeDefined();
    }
    expect(warn, 'nenhum aviso de osso ausente').not.toHaveBeenCalled();

    const bone = (name: string) => rig!.bones.find((b) => b.name === name)!.getTransformNode()!;
    const zOf = (name: string) => {
      refresh(root);
      return bone(name).getAbsolutePosition().z;
    };
    const stride = (joint: keyof Pose, watch: string) => {
      poseBones(drives, idle);
      const before = zOf(watch);
      poseBones(drives, { ...idle, [joint]: 0.5 });
      return zOf(watch) - before;
    };
    const yOf = (name: string) => {
      refresh(root);
      return bone(name).getAbsolutePosition().y;
    };

    poseBones(drives, idle);
    expect(yOf('hand.l') - yOf('arm_stretch.l'), 'braço abaixado no repouso').toBeLessThan(-0.1);
    expect(yOf('hand.r') - yOf('arm_stretch.r'), 'braço abaixado no repouso').toBeLessThan(-0.1);

    expect(stride('leftHip', 'leg_stretch.l'), 'quadril esquerdo à frente').toBeGreaterThan(0.05);
    expect(stride('rightHip', 'leg_stretch.r'), 'quadril direito à frente').toBeGreaterThan(0.05);
    expect(stride('leftKnee', 'foot.l'), 'joelho esquerdo dobra').toBeLessThan(-0.05);
    expect(stride('rightKnee', 'foot.r'), 'joelho direito dobra').toBeLessThan(-0.05);
    expect(stride('leftShoulder', 'hand.l'), 'ombro esquerdo à frente').toBeGreaterThan(0.05);
    expect(stride('rightShoulder', 'hand.r'), 'ombro direito à frente').toBeGreaterThan(0.05);
    expect(stride('leftElbow', 'hand.l'), 'cotovelo esquerdo dobra').toBeGreaterThan(0.05);
    expect(stride('rightElbow', 'hand.r'), 'cotovelo direito dobra').toBeGreaterThan(0.05);

    warn.mockRestore();
    container.dispose();
    engine.dispose();
  }, 60000);

  it('zera a metalicidade que o GLB deixou no padrão do glTF (metal = 1)', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const load = (name: string): Promise<AssetContainer> =>
      LoadAssetContainerAsync(
        new Uint8Array(
          readFileSync(
            fileURLToPath(new URL(`../../../public/assets/goe/${name}.glb`, import.meta.url)),
          ),
        ),
        scene,
        { pluginExtension: '.glb' },
      );
    const materials = (container: AssetContainer) =>
      container.meshes
        .map((mesh) => mesh.material)
        .filter((material): material is PBRMaterial => material !== null);

    const body = await load('GoE_Male');
    const skin = materials(body);
    expect(
      skin.some((material) => material.metallic === 1 && material.metallicTexture),
      'corpo com metal no padrão do glTF',
    ).toBe(true);
    stripDefaultMetallic(body);
    for (const material of skin) {
      if (material.metallicTexture) expect(material.metallic, material.name).toBe(0);
    }

    // Cabelo já vem com o fator explícito (0) e sem a textura: o ajuste não pode mexer nele.
    const hair = await load('GoE_M_Hair03');
    const strands = materials(hair);
    stripDefaultMetallic(hair);
    for (const material of strands) expect(material.metallic, material.name).toBe(0);

    body.dispose();
    hair.dispose();
    engine.dispose();
  }, 60000);

  it('cabelo com alfa recortado (MASK) passa a misturar, senão fica ralo', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const hair = await LoadAssetContainerAsync(
      new Uint8Array(
        readFileSync(
          fileURLToPath(new URL('../../../public/assets/goe/GoE_M_Hair03.glb', import.meta.url)),
        ),
      ),
      scene,
      { pluginExtension: '.glb' },
    );
    const strands = hair.meshes
      .map((mesh) => mesh.material)
      .filter((material): material is PBRMaterial => material !== null);
    expect(
      strands.some((material) => material.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATEST),
      'cabelo vem recortado (MASK)',
    ).toBe(true);
    softenAlphaMasks(hair);
    for (const material of strands) {
      expect(material.transparencyMode, material.name).not.toBe(PBRMaterial.PBRMATERIAL_ALPHATEST);
    }
    expect(
      strands.some(
        (material) => material.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATESTANDBLEND,
      ),
    ).toBe(true);
    for (const material of strands) expect(material.alphaCutOff, material.name).toBeLessThan(0.2);

    hair.dispose();
    engine.dispose();
  }, 60000);
});
