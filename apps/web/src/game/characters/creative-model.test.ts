import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF';
import { describe, expect, it, vi } from 'vitest';
import type { Pose } from '../animation/walk-cycle';
import {
  CREATIVE_JOINTS,
  CREATIVE_POSE_AXES,
  bindJoints,
  pickRig,
  poseBones,
} from './avatar-model';
import { MANNEQUIN_JOINTS } from './mannequin';

/**
 * Corpo 'creative' (Body_010.glb, biblioteca de peças). O rig NÃO usa o eixo X padrão: girar cada
 * articulação no eixo X abre os membros para os LADOS. Verificamos que a pose procedural do ciclo de
 * caminhada leva as pernas/braços para a FRENTE (+Z) e que o joelho dobra para trás (-Z). Sem os
 * `CREATIVE_POSE_AXES` corretos, a caminhada fica com as pernas fazendo espacate.
 */
const file = fileURLToPath(new URL('../../../public/test-assets/Body_010.glb', import.meta.url));

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

describe('creative model', () => {
  it('carrega, liga todos os ossos e caminha para frente (+Z), dobrando o joelho para trás', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bytes = new Uint8Array(readFileSync(file));
    const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
    const entries = container.instantiateModelsToScene(undefined, false);
    const root = new TransformNode('test-root', scene);
    for (const node of entries.rootNodes) node.parent = root;

    const rig = pickRig(entries.skeletons, CREATIVE_JOINTS.pelvis);
    expect(rig, 'esqueleto com o quadril').toBeDefined();
    const drives = bindJoints(rig, CREATIVE_JOINTS, CREATIVE_POSE_AXES);
    for (const joint of MANNEQUIN_JOINTS) {
      expect(drives[joint], `osso ${joint}`).toBeDefined();
    }
    expect(warn, 'nenhum aviso de osso ausente').not.toHaveBeenCalled();

    const bone = (name: string) =>
      rig!.bones.find((b) => b.name === name)!.getTransformNode()!;
    // `z` (mundo) de um osso depois de recalcular as matrizes.
    const zOf = (name: string) => {
      refresh(root);
      return bone(name).getAbsolutePosition().z;
    };
    // Aplica só a articulação `joint` (o resto na pose neutra) e devolve o deslocamento em Z.
    const stride = (joint: keyof Pose, watch: string) => {
      poseBones(drives, idle);
      const before = zOf(watch);
      poseBones(drives, { ...idle, [joint]: 0.5 });
      return zOf(watch) - before;
    };

    // Quadril para frente: a perna avança.
    expect(stride('leftHip', 'LeftLeg'), 'quadril esquerdo à frente').toBeGreaterThan(0.05);
    expect(stride('rightHip', 'RightLeg'), 'quadril direito à frente').toBeGreaterThan(0.05);
    // Joelho dobra: o pé vai para trás.
    expect(stride('leftKnee', 'LeftFoot'), 'joelho esquerdo dobra').toBeLessThan(-0.05);
    expect(stride('rightKnee', 'RightFoot'), 'joelho direito dobra').toBeLessThan(-0.05);
    // Ombros balançam na frente.
    expect(stride('leftShoulder', 'LeftForeArm'), 'ombro esquerdo à frente').toBeGreaterThan(0.05);
    expect(stride('rightShoulder', 'RightForeArm'), 'ombro direito à frente').toBeGreaterThan(0.05);
    // Cotovelos dobram para a frente.
    expect(stride('leftElbow', 'LeftHand'), 'cotovelo esquerdo dobra').toBeGreaterThan(0.05);
    expect(stride('rightElbow', 'RightHand'), 'cotovelo direito dobra').toBeGreaterThan(0.05);

    warn.mockRestore();
    container.dispose();
    engine.dispose();
  }, 60000);
});
