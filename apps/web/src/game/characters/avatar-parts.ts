import './gltf-loaders';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {
  AVATAR_PARTS,
  PART_SLOTS,
  colorHex,
  isGoeModel,
  partFitsModel,
  type AvatarConfig,
  type AvatarModelId,
  type PartSlot,
} from '@3dx/contracts';
import type { Pose } from '../animation/walk-cycle';
import {
  GOE_BASE,
  GOE_JOINTS,
  GOE_POSE_AXES,
  JOINTS_3DX_FEMALE,
  JOINTS_3DX_MALE,
  bindJoints,
  pickRig,
  poseBones,
  skinTextureFor,
  softenAlphaMasks,
  stripDefaultMetallic,
  type JointDrive,
} from './avatar-model';
import { hairTint, linearColor, skinTint } from './avatar-colors';
import { effectiveMorphs, muscleBoosts } from './body-build';
import { applyMorphs, extractMorphs, morphLibraryOf, type MorphLibrary } from './morph-bake';
import { TintPlugin } from './tint-plugin';
import {
  applyPresetToSkeleton,
  captureSkeletonRest,
  restoreSkeletonRest,
  type PosePreset,
  type SkeletonRest,
} from './goe-poses';
import type { Joint } from './mannequin';

/**
 * Arquivo de cada peça da biblioteca. As peças GoE usam `goe/<id>.glb`; as do 3DX declaram o
 * caminho no catálogo (`file`, relativo a `/assets/`).
 */
const PART_FILES: Readonly<Record<string, string | undefined>> = Object.fromEntries(
  AVATAR_PARTS.map((part) => [
    part.id,
    part.file ? `/assets/${part.file}` : `/assets/goe/${part.id}.glb`,
  ]),
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
  // A anatomia masculina é uma malha à parte: com calça ou cueca ela some, senão atravessa o tecido.
  const wearsBottom = equipped.some((entry) => entry.slot === 'bottom');
  const wearsUnderwear = equipped.some((entry) => entry.slot === 'underwear');
  const wearsLower = wearsBottom || wearsUnderwear;
  // A cueca/calcinha fica por baixo da calça: com calça vestida ela não é desenhada (evita z-fighting
  // e o tecido aparecendo). Sem calça, o slot `underwear` mostra a peça sozinha.
  return equipped
    .filter((entry) => !(wearsOuterwear && entry.slot === 'top'))
    .filter((entry) => !(wearsLower && entry.slot === 'genitals'))
    .filter((entry) => !(wearsBottom && entry.slot === 'underwear'))
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
      extractMorphs(container);
      return container;
    })
    .catch((error: unknown) => {
      byId.delete(id);
      throw error;
    });
  byId.set(id, loading);
  return loading;
}

/** Como a cor da aparência chega numa peça: pele (anatomia), cabelo ou roupa (cima ou baixo). */
type PartColor = 'skin' | 'hair' | 'top' | 'bottom';

/**
 * Cor que a aparência dá à peça: a anatomia usa a pele do corpo, o cabelo usa `hairColor`, a camiseta e o casaco usam
 * `topColor` e a calça usa `bottomColor`. As demais (sapato, acessórios) ficam como o GLB veio.
 */
function colorOfPart(id: string): PartColor | undefined {
  switch (AVATAR_PARTS.find((part) => part.id === id)?.slot) {
    case 'genitals':
      return 'skin';
    case 'hair':
      return 'hair';
    case 'top':
    case 'outerwear':
      return 'top';
    case 'bottom':
    case 'underwear':
      return 'bottom';
    default:
      return undefined;
  }
}

interface PartEntry {
  /** Id da peça (nome do arquivo). */
  id: string;
  /** Peça da família GoE (pose/morphs). As do 3DX são só malha no repouso por enquanto. */
  goe: boolean;
  /** Dados das shape keys da peça (ver `morph-bake.ts`). */
  morphs: MorphLibrary;
  entries: InstantiatedEntries;
  drives: Partial<Record<Joint, JointDrive>>;
  rig: Skeleton | undefined;
  rest: SkeletonRest;
  meshes: AbstractMesh[];
  /** Materiais clonados só para este avatar (a cor e a pele são por avatar; o material do GLB é compartilhado). */
  materials: Material[];
  /** Recolorização das roupas (um por material clonado); vazio nas peças sem cor de roupa. */
  tints: TintPlugin[];
  dispose(): void;
}

export interface AvatarParts {
  /**
   * Equipa as peças pedidas pelos slots da aparência (só as que servem no modelo atual). Só refaz o
   * conjunto quando os slots que têm peça mudam (trocar a cor, por exemplo, não mexe nas malhas). Em qualquer
   * chamada aplica as shape keys (`morphs`) e a pele nas peças que a usam.
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

  const instantiate = (id: string, container: AssetContainer, model: AvatarModelId): PartEntry => {
    const goe = isGoeModel(model);
    const joints = goe ? GOE_JOINTS : model === '3dx-female' ? JOINTS_3DX_FEMALE : JOINTS_3DX_MALE;
    const entries = container.instantiateModelsToScene(undefined, false);
    for (const node of entries.rootNodes) node.parent = parent;
    const rig = pickRig(entries.skeletons, joints.pelvis);
    // No 3DX ainda não há pose procedural nem preset (Fase E): a peça fica no repouso do GLB.
    const drives = goe ? bindJoints(rig, GOE_JOINTS, GOE_POSE_AXES, GOE_BASE[model]) : {};
    const meshes = entries.rootNodes
      .flatMap((node) => node.getChildMeshes(false))
      .filter((mesh) => mesh.getTotalVertices() > 0);
    for (const mesh of meshes) {
      mesh.receiveShadows = true;
      mesh.visibility = connected ? 1 : 0.35;
      shadows?.addShadowCaster(mesh);
    }
    // No 3DX não há preset de pose: o mapa de repouso fica vazio.
    const rest = captureSkeletonRest(goe ? rig : undefined);
    if (activePreset && goe) applyPresetToSkeleton(rig, activePreset);
    const materials: Material[] = [];
    return {
      id,
      goe,
      morphs: morphLibraryOf(container),
      entries,
      drives,
      rig,
      rest,
      meshes,
      materials,
      tints: [],
      dispose() {
        for (const mesh of meshes) shadows?.removeShadowCaster(mesh);
        for (const material of materials) material.dispose();
        entries.dispose();
      },
    };
  };

  /** Shape keys do avatar em todas as peças e as cores da aparência (clona o material uma vez por peça). */
  const refresh = (config: AvatarConfig) => {
    for (const entry of equipped) {
      applyMorphs(entry.meshes, entry.morphs, effectiveMorphs(config), muscleBoosts(config.model));
      const color = colorOfPart(entry.id);
      if (!color) continue;
      if (entry.materials.length === 0) {
        for (const mesh of entry.meshes) {
          const clone = mesh.material?.clone(`${mesh.material.name}-${color}-${entry.id}`);
          if (!clone) continue;
          mesh.material = clone;
          entry.materials.push(clone);
          if (color === 'top' || color === 'bottom') entry.tints.push(new TintPlugin(clone));
        }
      }
      for (const material of entry.materials) {
        const pbr = material as PBRMaterial;
        if (color === 'skin') {
          pbr.albedoTexture = skinTextureFor(scene, config);
          pbr.albedoColor = skinTint(config);
        } else if (color === 'hair') {
          pbr.albedoColor = hairTint(colorHex(config.hairColor));
        }
      }
      for (const plugin of entry.tints) {
        plugin.tint.copyFrom(
          linearColor(colorHex(color === 'top' ? config.topColor : config.bottomColor)),
        );
        plugin.isEnabled = true;
      }
    }
  };

  const clear = () => {
    for (const entry of equipped) entry.dispose();
    equipped.length = 0;
  };

  return {
    async apply(config) {
      const model = config.model;
      const wanted = equippedPartIds(config);
      const signature = `${model}:${wanted.join(',')}`;
      if (signature === applied) {
        refresh(config);
        return;
      }
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
      for (const [index, container] of loaded.entries()) {
        const id = wanted[index];
        if (!container || !id) continue;
        const entry = instantiate(id, container, model);
        // Peça que chega depois do `applyPose` já nasce na pose do corpo (senão a manga fica em T).
        if (entry.goe && lastPose && !activePreset) poseBones(entry.drives, lastPose);
        equipped.push(entry);
      }
      refresh(config);
    },

    applyPose(pose) {
      lastPose = pose;
      if (activePreset) return;
      for (const entry of equipped) if (entry.goe) poseBones(entry.drives, pose);
    },

    setPosePreset(preset) {
      activePreset = preset;
      for (const entry of equipped) {
        // Presets são poses do GoE; o 3DX fica no repouso até a Fase E.
        if (!entry.goe) continue;
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
