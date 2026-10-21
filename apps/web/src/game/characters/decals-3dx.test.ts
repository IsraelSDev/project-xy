import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import type { DecalChoice } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import './gltf-loaders';
import { JOINTS_3DX_FEMALE, JOINTS_3DX_MALE, pickRig } from './avatar-model';
import { DECAL_ANCHORS_3DX_FEMALE, DECAL_ANCHORS_3DX_MALE, createDecalLayer } from './decals-3dx';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

async function load(scene: Scene, file: string) {
  const bytes = new Uint8Array(readFileSync(`${publicDir}/assets/3dx/${file}`));
  return LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
}

const choices = (): DecalChoice[] =>
  (Object.keys(DECAL_ANCHORS_3DX_MALE) as DecalChoice['slot'][]).map((slot) => ({
    slot,
    category: '14_tattoo_autoral',
    image: 'd_tattoo_snake',
  }));

describe('decalques 3DX', () => {
  it('encontra as 10 tatuagens no manifesto e nos arquivos', () => {
    const manifest = JSON.parse(
      readFileSync(`${publicDir}/assets/3dx/decals/manifest.json`, 'utf8'),
    ) as Record<string, string[]>;
    const images = manifest['14_tattoo_autoral'];
    expect(images).toBeDefined();
    if (!images) return;
    expect(images).toHaveLength(10);
    for (const image of images) {
      expect(
        existsSync(`${publicDir}/assets/3dx/decals/14_tattoo_autoral/${image}.webp`),
        image,
      ).toBe(true);
    }
  });

  it.each([
    ['male', 'character_male.glb', JOINTS_3DX_MALE, DECAL_ANCHORS_3DX_MALE],
    ['female', 'character_female.glb', JOINTS_3DX_FEMALE, DECAL_ANCHORS_3DX_FEMALE],
  ] as const)(
    '%s: projeta os decalques no corpo e na cabeça',
    async (_gender, file, joints, anchors) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const container = await load(scene, file);
        const entries = container.instantiateModelsToScene(undefined, false);
        const skeleton = pickRig(entries.skeletons, joints.pelvis);
        expect(skeleton).toBeDefined();
        const bodies = entries.rootNodes
          .flatMap((root) => root.getChildMeshes(false))
          .filter(
            (mesh): mesh is Mesh =>
              mesh instanceof Mesh && /body|head/i.test(mesh.name) && mesh.getTotalVertices() > 0,
          );
        expect(bodies.length).toBeGreaterThanOrEqual(2);

        const layer = createDecalLayer(scene, skeleton, bodies, anchors);
        layer.apply(choices(), true);
        expect(layer.meshes).toHaveLength(8);
        // O pescoço pode cair no plano reto (a malha do corpo termina na base do pescoço); as
        // outras regiões precisam ser pedaços conformados da pele.
        expect(layer.meshes.filter((mesh) => mesh.skeleton).length).toBeGreaterThanOrEqual(7);
        for (const mesh of layer.meshes) {
          expect(mesh.material, mesh.name).toBeDefined();
          expect(mesh.isVisible, mesh.name).toBe(true);
        }

        const centers = new Map(
          layer.meshes.map((mesh) => {
            mesh.computeWorldMatrix(true);
            return [
              mesh.name.split('-')[1],
              mesh.getBoundingInfo().boundingBox.centerWorld,
            ] as const;
          }),
        );
        expect(centers.get('face')!.y).toBeGreaterThan(1.5);
        expect(centers.get('chest')!.z).toBeGreaterThan(0.04);
        // O corpo publicado é exportado com as normais suaves do JSON (vértices compartilhados), então
        // o centro do pedaço conformado anda ~0,3 mm em relação ao corpo facetado antigo.
        expect(centers.get('back')!.z).toBeLessThan(-0.035);
        expect(Math.abs(centers.get('armLeft')!.x)).toBeGreaterThan(0.15);
        expect(Math.abs(centers.get('armRight')!.x)).toBeGreaterThan(0.15);
        expect(centers.get('thighLeft')!.y).toBeLessThan(0.9);
        expect(centers.get('thighRight')!.y).toBeLessThan(0.9);
      } finally {
        engine.dispose();
      }
    },
  );
});
