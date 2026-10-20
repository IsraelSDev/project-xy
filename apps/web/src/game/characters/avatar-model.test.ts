import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { normalizeModelTo } from './avatar-model';

/** Centro e piso (mundo) do modelo, depois das matrizes de mundo recalculadas. */
function worldBounds(mesh: ReturnType<typeof CreateBox>) {
  mesh.computeWorldMatrix(true);
  const box = mesh.getBoundingInfo().boundingBox;
  return {
    center: box.minimumWorld.add(box.maximumWorld).scale(0.5),
    minY: box.minimumWorld.y,
    height: box.maximumWorld.y - box.minimumWorld.y,
  };
}

const box = (scene: Scene, name: string, parent: TransformNode) => {
  const mesh = CreateBox(name, { width: 0.4, height: 1.8, depth: 0.3 }, scene);
  mesh.parent = parent;
  // Modelo autoral descentrado (não nasce na origem).
  mesh.position.set(0.5, 0.9, 0.2);
  return mesh;
};

describe('normalizeModelTo', () => {
  it('centraliza o modelo em X, põe os pés em y=0 e mantém a raiz em Z', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode('root', scene);
    const mesh = box(scene, 'model', root);

    normalizeModelTo(root, [mesh], 1.7);

    const { center, minY, height } = worldBounds(mesh);
    expect(center.x).toBeCloseTo(0, 6);
    // O 3DX não centraliza em Z: a raiz do GLB (pés) é a referência do offset de par.
    expect(center.z).toBeCloseTo(0.2 * (1.7 / 1.8), 6);
    expect(minY).toBeCloseTo(0, 6);
    expect(height).toBeCloseTo(1.7, 6);
    engine.dispose();
  });

  it('não desloca o modelo quando a raiz do avatar está longe da origem', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const avatarRoot = new TransformNode('avatar', scene);
    avatarRoot.position.set(120, 0, -45);
    const root = new TransformNode('model-root', scene);
    root.parent = avatarRoot;
    const mesh = box(scene, 'model', root);

    normalizeModelTo(root, [mesh], 1.7);

    const { center, minY } = worldBounds(mesh);
    // A raiz do GLB fica na raiz do avatar no plano XZ (não vaza a posição do mundo), mas o
    // centro do corpo pode estar deslocado em Z pelo próprio modelo.
    expect(center.x).toBeCloseTo(120, 5);
    expect(center.z).toBeGreaterThan(-45);
    expect(minY).toBeCloseTo(0, 5);
    engine.dispose();
  });
});
