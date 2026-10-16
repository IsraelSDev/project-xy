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
  SUPERHERO_JOINTS,
  SUPERHERO_POSE_AXES,
  bindJoints,
  pickRig,
  poseBones,
  type JointDrive,
} from './avatar-model';
import { MANNEQUIN_JOINTS, type Joint } from './mannequin';

/**
 * 'Universal Base Characters' (Quaternius, CC0): corpo 'Superhero' M/F. Verificamos que o GLB
 * carrega, que todos os ossos da convenção dão bind e que a pose procedural leva os membros para a
 * FRENTE (+Z) quando o ângulo é positivo — os ossos UE giram a flexão ao contrário do creative.
 */
const dir = fileURLToPath(new URL('../../../public/models/superhero', import.meta.url));
const files = ['Superhero_Male_FullBody.glb', 'Superhero_Female_FullBody.glb'];

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

function zOf(drives: Partial<Record<Joint, JointDrive>>, joint: Joint): number {
  const drive = drives[joint];
  if (!drive) throw new Error(`sem osso para ${joint}`);
  return drive.node.getAbsolutePosition().z;
}

describe.each(files)('%s', (file) => {
  it('carrega, liga todos os ossos e move os membros para frente (+Z)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bytes = new Uint8Array(readFileSync(`${dir}/${file}`));
    const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
    const entries = container.instantiateModelsToScene(undefined, false);
    const root = new TransformNode('test-root', scene);
    for (const node of entries.rootNodes) node.parent = root;

    expect(entries.rootNodes.flatMap((n) => n.getChildMeshes(false)).length).toBeGreaterThan(0);

    const rig = pickRig(entries.skeletons, SUPERHERO_JOINTS.pelvis);
    expect(rig, 'esqueleto com o quadril').toBeDefined();
    const drives = bindJoints(rig, SUPERHERO_JOINTS, SUPERHERO_POSE_AXES);
    for (const joint of MANNEQUIN_JOINTS) {
      expect(drives[joint], `osso ${joint}`).toBeDefined();
    }
    expect(warn, 'nenhum aviso de osso ausente').not.toHaveBeenCalled();

    poseBones(drives, idle);
    refresh(root);
    const hipBefore = zOf(drives, 'left-knee');
    const shoulderBefore = zOf(drives, 'left-elbow');

    poseBones(drives, { ...idle, leftHip: 0.5, leftShoulder: 0.5 });
    refresh(root);

    expect(zOf(drives, 'left-knee'), 'joelho à frente').toBeGreaterThan(hipBefore + 0.05);
    expect(zOf(drives, 'left-elbow'), 'cotovelo à frente').toBeGreaterThan(shoulderBefore + 0.05);

    warn.mockRestore();
    container.dispose();
    engine.dispose();
  }, 60000);
});
