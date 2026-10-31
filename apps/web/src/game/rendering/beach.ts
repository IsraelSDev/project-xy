import '../characters/gltf-loaders';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { maximizeTextureQuality } from '../characters/avatar-model';

/**
 * Praia (`scenes/beach.unity`). A cena original é um **mapa aberto** de ~240×193 m e o chão dela é
 * um Unity Terrain — não vem como malha. O GLB daqui é o recorte da área jogável (deck, espreguiçadeiras,
 * guarda-sóis, postes e pedras), exportado com `--clip`; areia e mar são desenhados no cliente.
 */
export const BEACH_URL = '/assets/3dx/rooms/beach/beach.glb';

/**
 * Deslocamento do recorte para o espaço do jogo, medido no GLB carregado (NullEngine):
 * centro do recorte em XZ e a areia em y≈1,96 m (os pés das espreguiçadeiras).
 */
export const BEACH_OFFSET = { x: 71.68, y: -1.96, z: -98.54 } as const;

/** Área de areia desenhada no cliente (o layout `BEACH` usa as mesmas medidas). */
export const BEACH_SAND = {
  width: 58,
  depth: 32,
  /** Deslocamento em Z: a areia vai da linha d'água (`BEACH_SHORE_Z`) para dentro. */
  offsetZ: 3,
} as const;

/** Linha d'água: daqui para -Z é mar (as pedras do GLB aparecem na arrebentação). */
export const BEACH_SHORE_Z = -13;

export interface BeachRoom {
  root: TransformNode;
  meshes: AbstractMesh[];
  dispose(): void;
}

/** Carrega a praia (props nativos) e desenha areia e mar; falhas são tratadas pelo chamador. */
export async function loadBeach(scene: Scene): Promise<BeachRoom> {
  const container: AssetContainer = await LoadAssetContainerAsync(BEACH_URL, scene, {
    pluginExtension: '.glb',
  });
  maximizeTextureQuality(container);
  const entries: InstantiatedEntries = container.instantiateModelsToScene(undefined, false);
  const root = new TransformNode('beach-room', scene);
  root.position.set(BEACH_OFFSET.x, BEACH_OFFSET.y, BEACH_OFFSET.z);
  for (const node of entries.rootNodes) node.parent = root;
  const meshes = root.getChildMeshes(false).filter((mesh) => mesh.getTotalVertices() > 0);
  for (const mesh of meshes) {
    mesh.receiveShadows = true;
    mesh.isPickable = false;
  }

  const sand = ground(scene, 'beach-floor', BEACH_SAND.width, BEACH_SAND.depth, 0);
  sand.position.z = BEACH_SAND.offsetZ;
  const sandMaterial = new StandardMaterial('beach-sand-material', scene);
  sandMaterial.diffuseColor = new Color3(0.78, 0.68, 0.5);
  sandMaterial.specularColor = new Color3(0.08, 0.08, 0.08);
  sand.material = sandMaterial;
  sand.receiveShadows = true;

  // Mar à frente da areia, um pouco abaixo dela; o fundo (areia) termina na linha d'água.
  const seaDepth = 200;
  const sea = ground(scene, 'beach-sea', 400, seaDepth, -0.4);
  sea.position.z = BEACH_SHORE_Z - seaDepth / 2;
  const seaMaterial = new StandardMaterial('beach-sea-material', scene);
  seaMaterial.diffuseColor = new Color3(0.05, 0.3, 0.45);
  seaMaterial.emissiveColor = new Color3(0.02, 0.1, 0.16);
  seaMaterial.specularColor = new Color3(0.5, 0.55, 0.6);
  sea.material = seaMaterial;

  return {
    root,
    meshes,
    dispose() {
      entries.dispose();
      sand.dispose();
      sea.dispose();
      root.dispose();
    },
  };
}

function ground(scene: Scene, name: string, width: number, height: number, y: number) {
  const mesh = CreateGround(name, { width, height, subdivisions: 1 }, scene);
  mesh.position.y = y;
  // O clique/toque move o avatar pelo piso: `pointer.ts` só aceita malhas da lista de pisos.
  mesh.isPickable = name === 'beach-floor';
  return mesh;
}
