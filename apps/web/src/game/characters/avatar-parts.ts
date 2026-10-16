import '@babylonjs/loaders/glTF';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { PART_CATALOG, PART_SLOTS, type AvatarConfig } from '@3dx/contracts';
import type { Pose } from '../animation/walk-cycle';
import {
  CREATIVE_JOINTS,
  CREATIVE_POSE_AXES,
  bindJoints,
  pickRig,
  poseBones,
  type JointDrive,
} from './avatar-model';
import type { Joint } from './mannequin';

/** Arquivo de cada peça da biblioteca (id do catálogo = nome do arquivo sem extensão). */
const PART_FILES: Readonly<Record<string, string | undefined>> = Object.fromEntries(
  PART_CATALOG.map((part) => [part.id, `/test-assets/${part.id}.glb`]),
);

/**
 * Peças pedidas pelos slots da aparência, na ordem de `PART_SLOTS`. Só o corpo 'creative' tem o
 * mesmo esqueleto das peças; nos outros modelos a lista é vazia.
 */
export function equippedPartIds(config: AvatarConfig): string[] {
  if (config.model !== 'creative') return [];
  const ids: string[] = [];
  for (const slot of PART_SLOTS) {
    const id = config[slot];
    if (id !== 'none' && PART_FILES[id]) ids.push(id);
  }
  return ids;
}

/** Cada peça carrega uma vez por cena; cada avatar recebe um clone (malhas e esqueleto próprios). */
const containers = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();

function loadPart(scene: Scene, id: string): Promise<AssetContainer> {
  const byId = containers.get(scene) ?? new Map<string, Promise<AssetContainer>>();
  containers.set(scene, byId);
  const cached = byId.get(id);
  if (cached) return cached;
  const file = PART_FILES[id];
  if (!file) return Promise.reject(new Error(`Peça desconhecida: ${id}`));
  const loading = LoadAssetContainerAsync(file, scene, { pluginExtension: '.glb' }).catch(
    (error: unknown) => {
      byId.delete(id);
      throw error;
    },
  );
  byId.set(id, loading);
  return loading;
}

interface PartEntry {
  entries: InstantiatedEntries;
  drives: Partial<Record<Joint, JointDrive>>;
  meshes: AbstractMesh[];
  dispose(): void;
}

export interface AvatarParts {
  /**
   * Equipa as peças pedidas pelos slots da aparência. Só o corpo 'creative' tem o mesmo esqueleto
   * das peças; nos outros modelos nenhuma peça é montada. Só refaz o conjunto quando os slots que
   * têm peça mudam (trocar a cor, por exemplo, não mexe nas malhas).
   */
  apply(config: AvatarConfig): Promise<void>;
  /** Aplica a mesma pose procedural do corpo às peças equipadas. */
  applyPose(pose: Pose): void;
  /** Desconectado (aguardando reconexão) fica translúcido, como o corpo. */
  setConnected(connected: boolean): void;
  /** Total de malhas das peças equipadas. */
  meshCount(): number;
  dispose(): void;
}

/**
 * Peças de vestuário em GLB presas ao avatar. Cada peça é um modelo próprio (mesmo esqueleto do
 * corpo) montado no mesmo `parent` (raiz do modelo) e movido pela mesma pose. `id` é o nome do
 * arquivo; ver `PART_CATALOG`.
 */
export function attachAvatarParts(
  scene: Scene,
  parent: TransformNode,
  shadows?: ShadowGenerator,
): AvatarParts {
  let connected = true;
  let generation = 0;
  /** Assinatura do último conjunto aplicado: evita refazer as peças quando só a cor mudou. */
  let applied: string | undefined;
  const equipped: PartEntry[] = [];

  const instantiate = (container: AssetContainer): PartEntry => {
    const entries = container.instantiateModelsToScene(undefined, false);
    for (const node of entries.rootNodes) node.parent = parent;
    const rig = pickRig(entries.skeletons, CREATIVE_JOINTS.pelvis);
    const drives = bindJoints(rig, CREATIVE_JOINTS, CREATIVE_POSE_AXES);
    const meshes = entries.rootNodes
      .flatMap((node) => node.getChildMeshes(false))
      .filter((mesh) => mesh.getTotalVertices() > 0);
    for (const mesh of meshes) {
      mesh.receiveShadows = true;
      mesh.visibility = connected ? 1 : 0.35;
      shadows?.addShadowCaster(mesh);
    }
    return {
      entries,
      drives,
      meshes,
      dispose() {
        for (const mesh of meshes) shadows?.removeShadowCaster(mesh);
        entries.dispose();
      },
    };
  };

  const clear = () => {
    for (const entry of equipped) entry.dispose();
    equipped.length = 0;
  };

  return {
    async apply(config) {
      const wanted = equippedPartIds(config);
      const signature = `${config.model}:${wanted.join(',')}`;
      if (signature === applied) return;
      const token = ++generation;
      applied = signature;
      clear();
      if (wanted.length === 0) return;

      const loaded = await Promise.all(
        wanted.map(async (id) => {
          try {
            return await loadPart(scene, id);
          } catch (error: unknown) {
            console.warn(`Não foi possível carregar a peça ${id}.`, error);
            return undefined;
          }
        }),
      );
      // Uma chamada mais nova substituiu esta: o resultado que chegou tarde é descartado.
      if (token !== generation) return;
      for (const container of loaded) {
        if (container) equipped.push(instantiate(container));
      }
    },

    applyPose(pose) {
      for (const entry of equipped) poseBones(entry.drives, pose);
    },

    setConnected(value) {
      connected = value;
      for (const entry of equipped) {
        for (const mesh of entry.meshes) mesh.visibility = value ? 1 : 0.35;
      }
    },

    meshCount() {
      let total = 0;
      for (const entry of equipped) total += entry.meshes.length;
      return total;
    },

    dispose() {
      generation += 1;
      applied = undefined;
      clear();
    },
  };
}
