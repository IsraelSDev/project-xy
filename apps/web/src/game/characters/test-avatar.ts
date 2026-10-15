import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

const TEST_MODEL_URL = '/test-assets/red-bikini-model.glb';
const TEST_MODEL_HEIGHT = 1.7;

export interface TestAvatarAttachment {
  meshCount: number;
  /** Desconectado (aguardando reconexão) fica translúcido, como o placeholder. */
  setConnected(connected: boolean): void;
  dispose(): void;
}

/** Carrega o GLB local de teste, centraliza os pés no piso e encaixa o modelo na raiz do avatar. */
export async function attachTestAvatar(
  scene: Scene,
  avatarRoot: TransformNode,
  shadows: ShadowGenerator,
): Promise<TestAvatarAttachment> {
  const container = await LoadAssetContainerAsync(TEST_MODEL_URL, scene, {
    pluginExtension: '.glb',
  });
  container.addAllToScene();

  const modelRoot = new TransformNode('test-avatar-model-root', scene);
  modelRoot.parent = avatarRoot;
  const importedRoots = [...container.rootNodes];
  for (const root of importedRoots) root.parent = modelRoot;

  const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  for (const mesh of meshes) mesh.computeWorldMatrix(true);
  const min = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const max = new Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  for (const mesh of meshes) {
    const bounds = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(bounds.minimumWorld);
    max.maximizeInPlace(bounds.maximumWorld);
  }

  const height = max.y - min.y;
  const scale = Number.isFinite(height) && height > 0 ? TEST_MODEL_HEIGHT / height : 1;
  modelRoot.scaling.setAll(scale);
  modelRoot.position.set(
    -((min.x + max.x) / 2) * scale,
    -min.y * scale,
    -((min.z + max.z) / 2) * scale,
  );
  for (const mesh of meshes) shadows.addShadowCaster(mesh);

  return {
    meshCount: meshes.length,
    setConnected(connected) {
      for (const mesh of meshes) mesh.visibility = connected ? 1 : 0.35;
    },
    dispose() {
      for (const mesh of meshes) shadows.removeShadowCaster(mesh);
      container.dispose();
      modelRoot.dispose();
    },
  };
}
