import './gltf-loaders';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import {
  AVATAR_PARTS,
  PART_SLOTS,
  partFitsModel,
  type AvatarConfig,
  type PartSlot,
} from '@3dx/contracts';
import type { Pose } from '../animation/walk-cycle';
import {
  GOE_BASE,
  type RigBase,
  GOE_JOINTS,
  GOE_POSE_AXES,
  bindJoints,
  pickRig,
  poseBones,
  softenAlphaMasks,
  stripDefaultMetallic,
  type JointDrive,
} from './avatar-model';
import {
  applyPresetToSkeleton,
  captureSkeletonRest,
  restoreSkeletonRest,
  type PosePreset,
  type SkeletonRest,
} from './goe-poses';
import type { Joint } from './mannequin';

/** Arquivo de cada peça da biblioteca (id do catálogo = nome do arquivo sem extensão). */
const PART_FILES: Readonly<Record<string, string | undefined>> = Object.fromEntries(
  AVATAR_PARTS.map((part) => [part.id, `/assets/goe/${part.id}.glb`]),
);

/**
 * Peças pedidas pelos slots da aparência, na ordem de `PART_SLOTS`. Só entram peças que servem no
 * modelo do avatar (cada peça tem o esqueleto do seu gênero); as do outro gênero são ignoradas.
 */
export function equippedPartIds(config: AvatarConfig): string[] {
  const equipped: { slot: PartSlot; id: string }[] = [];
  for (const slot of PART_SLOTS) {
    const id = config[slot];
    if (id === 'none') continue;
    const part = AVATAR_PARTS.find((item) => item.slot === slot && item.id === id);
    if (part && partFitsModel(part, config.model) && PART_FILES[id]) equipped.push({ slot, id });
  }
  // Casaco e camiseta ocupam a mesma camada: com o casaco vestido a camiseta não é desenhada. Os
  // editores já impedem os dois juntos; isto cobre aparências antigas que tenham os dois salvos.
  const wearsOuterwear = equipped.some((entry) => entry.slot === 'outerwear');
  return equipped
    .filter((entry) => !(wearsOuterwear && entry.slot === 'top'))
    .map((entry) => entry.id);
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
  const loading = LoadAssetContainerAsync(file, scene, { pluginExtension: '.glb' })
    .then((container) => {
      stripDefaultMetallic(container);
      softenAlphaMasks(container);
      return container;
    })
    .catch((error: unknown) => {
      byId.delete(id);
      throw error;
    });
  byId.set(id, loading);
  return loading;
}

interface PartEntry {
  entries: InstantiatedEntries;
  drives: Partial<Record<Joint, JointDrive>>;
  rig: Skeleton | undefined;
  rest: SkeletonRest;
  meshes: AbstractMesh[];
  dispose(): void;
}

export interface AvatarParts {
  /**
   * Equipa as peças pedidas pelos slots da aparência (só as que servem no modelo atual). Só refaz o
   * conjunto quando os slots que têm peça mudam (trocar a cor, por exemplo, não mexe nas malhas).
   */
  apply(config: AvatarConfig): Promise<void>;
  /** Aplica a mesma pose procedural do corpo às peças equipadas. */
  applyPose(pose: Pose): void;
  /** Trava as peças numa pose estática exportada do GoE (ou volta à procedural com `undefined`). */
  setPosePreset(preset: PosePreset | undefined): void;
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
  /** Pose estática ativa (ver `setPosePreset`); ausente = pose procedural. */
  let activePreset: PosePreset | undefined;
  /** Última pose procedural do corpo: as peças que chegam depois dela nascem nessa pose. */
  let lastPose: Pose | undefined;
  /** Assinatura do último conjunto aplicado: evita refazer as peças quando só a cor mudou. */
  let applied: string | undefined;
  const equipped: PartEntry[] = [];

  const instantiate = (container: AssetContainer, base: Partial<Record<Joint, RigBase>>): PartEntry => {
    const entries = container.instantiateModelsToScene(undefined, false);
    for (const node of entries.rootNodes) node.parent = parent;
    const rig = pickRig(entries.skeletons, GOE_JOINTS.pelvis);
    const drives = bindJoints(rig, GOE_JOINTS, GOE_POSE_AXES, base);
    const meshes = entries.rootNodes
      .flatMap((node) => node.getChildMeshes(false))
      .filter((mesh) => mesh.getTotalVertices() > 0);
    for (const mesh of meshes) {
      mesh.receiveShadows = true;
      mesh.visibility = connected ? 1 : 0.35;
      shadows?.addShadowCaster(mesh);
    }
    const rest = captureSkeletonRest(rig);
    if (activePreset) applyPresetToSkeleton(rig, activePreset);
    return {
      entries,
      drives,
      rig,
      rest,
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
        if (!container) continue;
        const entry = instantiate(container, GOE_BASE[config.model]);
        // Peça que chega depois do `applyPose` já nasce na pose do corpo (senão a manga fica em T).
        if (lastPose && !activePreset) poseBones(entry.drives, lastPose);
        equipped.push(entry);
      }
    },

    applyPose(pose) {
      lastPose = pose;
      if (activePreset) return;
      for (const entry of equipped) poseBones(entry.drives, pose);
    },

    setPosePreset(preset) {
      activePreset = preset;
      for (const entry of equipped) {
        if (preset) applyPresetToSkeleton(entry.rig, preset);
        else restoreSkeletonRest(entry.rig, entry.rest);
      }
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
      activePreset = undefined;
      clear();
    },
  };
}
