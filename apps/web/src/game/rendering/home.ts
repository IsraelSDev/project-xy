import '../characters/gltf-loaders';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { maximizeTextureQuality } from '../characters/avatar-model';

/** Quarto padrão do 3DXChat (exportado de `char_editor_decor.unity`). */
export const HOME_URL = '/assets/3dx/rooms/home/home.glb';
export const CLOSET_ROOM_URL = HOME_URL;

/**
 * O GLB foi assado nas coordenadas do projeto; o piso fica em y=0, mas o centro da sala não está
 * na origem. Este deslocamento centraliza o piso em X/Z para o layout de colisão (`HOME`) e os
 * spawns do jogo. O `__root__` do loader glTF espelha a cena em X, mas `HOME` foi medido nas
 * coordenadas do projeto (sem espelho), então a sala desfaz o espelho para casar com o layout.
 */
const HOME_OFFSET_X = 0.401;
const HOME_OFFSET_Z = 0.52;

export interface HomeRoom {
  root: TransformNode;
  meshes: AbstractMesh[];
  dispose(): void;
}

/** Carrega o quarto padrão como geometria estática; falhas são tratadas pelo chamador. */
export async function loadHome(scene: Scene): Promise<HomeRoom> {
  const container: AssetContainer = await LoadAssetContainerAsync(HOME_URL, scene, {
    pluginExtension: '.glb',
  });
  maximizeTextureQuality(container);
  const entries: InstantiatedEntries = container.instantiateModelsToScene(undefined, false);
  const root = new TransformNode('home-room', scene);
  root.position.set(HOME_OFFSET_X, 0, HOME_OFFSET_Z);
  root.scaling.x = -1;
  for (const node of entries.rootNodes) node.parent = root;
  const meshes = root.getChildMeshes(false).filter((mesh) => mesh.getTotalVertices() > 0);
  for (const mesh of meshes) {
    mesh.receiveShadows = true;
    mesh.isPickable = false;
  }
  // Piso invisível para o toque/clique (as malhas do GLB não são pickable).
  const picker = CreateGround('home-floor-picker', { width: 5.3, height: 10 }, scene);
  picker.parent = root;
  picker.position.y = 0.01;
  picker.visibility = 0;
  picker.isPickable = true;
  return {
    root,
    meshes,
    dispose() {
      entries.dispose();
      picker.dispose();
      root.dispose();
    },
  };
}
