import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF';
import { describe, it } from 'vitest';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

async function probe(file: string, clipNames: string[]) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const bytes = new Uint8Array(readFileSync(`${publicDir}/test-assets/${file}`));
  const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
  const entries = container.instantiateModelsToScene(undefined, false);
  console.log('=====', file);
  console.log(
    'GROUP NAMES:',
    entries.animationGroups.map((g) => JSON.stringify(g.name)).join(' | '),
  );
  const rig = [...entries.skeletons].sort((a, b) => b.bones.length - a.bones.length)[0];
  console.log(
    'skeletons:',
    entries.skeletons.map((s) => `${s.name}(${s.bones.length})`).join(', '),
    '| picked',
    rig?.name,
  );
  const hip = entries.skeletons.flatMap((s) => s.bones).find((b) => /Hips_01|Hips_64/.test(b.name));
  console.log('hip bone', hip?.name, 'TN', hip?.getTransformNode()?.name);
  for (const clip of clipNames) {
    const group = entries.animationGroups.find((g) => g.name === clip || g.name.endsWith(clip));
    if (!group) {
      console.log(`clip ${clip}: NOT FOUND`);
      continue;
    }
    const posTargets: string[] = [];
    for (const entry of group.targetedAnimations) {
      const t = entry.target as { name?: string };
      if (entry.animation.targetProperty === 'position') posTargets.push(t?.name ?? '?');
    }
    const targetExample = group.targetedAnimations[0]?.target as { getClassName?: () => string };
    const pelvisTN = group.targetedAnimations.some(
      (entry) => entry.target === hip?.getTransformNode(),
    );
    const pelvisBone = group.targetedAnimations.some((entry) => entry.target === hip);
    console.log(
      `clip ${clip}: len=${group.getLength?.()} targetClass=${targetExample?.getClassName?.()} posTargets=${JSON.stringify(posTargets)} pelvisTN=${pelvisTN} pelvisBone=${pelvisBone}`,
    );
  }
  entries.dispose();
  engine.dispose();
}

describe('glb probe', () => {
  it('business man', async () => {
    await probe('business_man_low_polygon_game_character.glb', [
      'Rig|walk',
      'Rig|idle',
      'Rig|sitting_idle',
    ]);
  }, 60000);

  it('girl', async () => {
    await probe('girl_in_yellow_animated.glb', ['Walking', 'Idle']);
  }, 60000);
});
