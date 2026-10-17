import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import './gltf-loaders';
import { describe, expect, it } from 'vitest';
import { GOE_JOINTS, pickRig } from './avatar-model';
import {
  applyPresetToSkeleton,
  captureSkeletonRest,
  poseGenderOf,
  restoreSkeletonRest,
} from './goe-poses';

const glb = fileURLToPath(new URL('../../../public/assets/goe/GoE_Male.glb', import.meta.url));
const posesFile = fileURLToPath(
  new URL('../../../public/assets/goe/poses/goe-poses.json', import.meta.url),
);

describe('poses exportadas do GoE', () => {
  it('o arquivo traz as 20 poses (10 neutras e 10 íntimas), com 7 valores por osso', () => {
    const data = JSON.parse(readFileSync(posesFile, 'utf8')) as {
      rig: string;
      poses: Record<string, Record<string, number[]>>;
    };
    const names = Object.keys(data.poses);
    expect(names).toHaveLength(20);
    expect(names.filter((name) => name.startsWith('pose'))).toHaveLength(10);
    expect(names.filter((name) => name.startsWith('sex'))).toHaveLength(10);
    // Nenhuma pose repete outra (a `Goe_F_Pose05` do blend era cópia da 01).
    expect(new Set(Object.values(data.poses).map((pose) => JSON.stringify(pose))).size).toBe(20);
    for (const pose of Object.values(data.poses)) {
      expect(Object.keys(pose).length).toBeGreaterThan(50);
      for (const value of Object.values(pose)) expect(value).toHaveLength(7);
    }
  });

  it('aplica a pose no esqueleto e devolve os ossos ao repouso ao limpar', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const container = await LoadAssetContainerAsync(new Uint8Array(readFileSync(glb)), scene, {
      pluginExtension: '.glb',
    });
    const entries = container.instantiateModelsToScene(undefined, false);
    const rig = pickRig(entries.skeletons, GOE_JOINTS.pelvis);
    expect(rig).toBeDefined();
    const rest = captureSkeletonRest(rig);
    const node = rig!.bones.find((bone) => bone.name === 'spine_01.x')!.getTransformNode()!;
    const before = node.position.clone();

    applyPresetToSkeleton(rig, { bones: { 'spine_01.x': [0.5, 0.4, 0.3, 0, 0, 0, 1] } });
    expect(Vector3.Distance(node.position, new Vector3(0.5, 0.4, 0.3))).toBeLessThan(1e-6);

    restoreSkeletonRest(rig, rest);
    expect(Vector3.Distance(node.position, before)).toBeLessThan(1e-6);
  });
});

describe('poses por gênero', () => {
  const read = (name: string) =>
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../../public/assets/goe/poses/${name}`, import.meta.url)),
        'utf8',
      ),
    ) as { poses: Record<string, Record<string, number[]>> };

  it('o modelo escolhe o arquivo do seu gênero', () => {
    expect(poseGenderOf('goe-male')).toBe('male');
    expect(poseGenderOf('goe-female')).toBe('female');
  });

  it('os dois arquivos têm as mesmas poses e os mesmos ossos de dedo', () => {
    const female = read('goe-poses.json').poses;
    const male = read('goe-poses-male.json').poses;
    expect(Object.keys(male).sort()).toEqual(Object.keys(female).sort());
    for (const id of Object.keys(female)) {
      const fingers = (poses: Record<string, Record<string, number[]>>) =>
        Object.keys(poses[id]!)
          .filter((bone) => /thumb|index|middle|ring|pinky/.test(bone))
          .sort();
      expect(fingers(male)).toEqual(fingers(female));
    }
  });
});
