import './gltf-loaders';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
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
  partFitsModel,
  type AvatarConfig,
  type AvatarModelId,
  type PartSlot,
} from '@3dx/contracts';
import {
  JOINTS_3DX_FEMALE,
  JOINTS_3DX_MALE,
  maximizeTextureQuality,
  pickRig,
  softenAlphaMasks,
  stripDefaultMetallic,
} from './avatar-model';
import { hairTint, linearColor } from './avatar-colors';
import { TintPlugin } from './tint-plugin';

/**
 * Arquivo de cada peça do catálogo. Toda peça 3DX declara o caminho em `file`, relativo a
 * `/assets/`.
 */
const PART_FILES: Readonly<Record<string, string | undefined>> = Object.fromEntries(
  AVATAR_PARTS.map((part) => [part.id, part.file ? `/assets/${part.file}` : undefined]),
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
  // A cueca/calcinha fica por baixo da calça: com calça vestida ela não é desenhada (evita z-fighting
  // e o tecido aparecendo). Sem calça, o slot `underwear` mostra a peça sozinha.
  const wearsBottom = equipped.some((entry) => entry.slot === 'bottom');
  return equipped
    .filter((entry) => !(wearsOuterwear && entry.slot === 'top'))
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
      maximizeTextureQuality(container);
      return container;
    })
    .catch((error: unknown) => {
      byId.delete(id);
      throw error;
    });
  byId.set(id, loading);
  return loading;
}

/** Como a cor da aparência chega numa peça: cabelo ou roupa (cima ou baixo). */
type PartColor = 'hair' | 'top' | 'bottom';

/**
 * Cor que a aparência dá à peça: o cabelo usa `hairColor`, a camiseta e o casaco usam `topColor` e
 * a calça usa `bottomColor`. As demais (sapato, acessórios) ficam como o GLB veio.
 */
function colorOfPart(id: string): PartColor | undefined {
  switch (AVATAR_PARTS.find((part) => part.id === id)?.slot) {
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
  entries: InstantiatedEntries;
  rig: Skeleton | undefined;
  meshes: AbstractMesh[];
  /** Materiais clonados só para este avatar (a cor é por avatar; o material do GLB é compartilhado). */
  materials: Material[];
  /** Recolorização das roupas (um por material clonado); vazio nas peças sem cor de roupa. */
  tints: TintPlugin[];
  dispose(): void;
}

export interface AvatarParts {
  /** Equipa as peças pedidas pelos slots da aparência (só as que servem no modelo atual). */
  apply(config: AvatarConfig): Promise<void>;
  /** Desconectado (aguardando reconexão) fica translúcido, como o corpo. */
  setConnected(connected: boolean): void;
  /** Total de malhas das peças equipadas. */
  meshCount(): number;
  dispose(): void;
}

/** O esqueleto da peça só pode ser trocado pelo do corpo se os ossos estiverem na mesma ordem. */
export function sameBoneLayout(left: Skeleton, right: Skeleton): boolean {
  if (left.bones.length !== right.bones.length) return false;
  return left.bones.every((bone, index) => bone.name === right.bones[index]?.name);
}

/**
 * Peças de vestuário em GLB presas ao avatar. Cada peça é um modelo próprio (mesmo esqueleto do
 * corpo) montado no mesmo `parent` (raiz do modelo). `bodySkeleton` faz a peça usar o esqueleto do
 * corpo, então ela acompanha o idle/animações nativas sem tocar um segundo esqueleto.
 */
export function attachAvatarParts(
  scene: Scene,
  parent: TransformNode,
  shadows?: ShadowGenerator,
  bodySkeleton?: Skeleton,
): AvatarParts {
  let connected = true;
  let generation = 0;
  /** Assinatura do último conjunto aplicado: evita refazer as peças quando só a cor mudou. */
  let applied: string | undefined;
  const equipped: PartEntry[] = [];

  const instantiate = (id: string, container: AssetContainer, model: AvatarModelId): PartEntry => {
    const joints = model === '3dx-female' ? JOINTS_3DX_FEMALE : JOINTS_3DX_MALE;
    const entries = container.instantiateModelsToScene(undefined, false);
    for (const node of entries.rootNodes) node.parent = parent;
    const rig = pickRig(entries.skeletons, joints.pelvis);
    const meshes = entries.rootNodes
      .flatMap((node) => node.getChildMeshes(false))
      .filter((mesh) => mesh.getTotalVertices() > 0);
    // A peça foi retargetada para o mesmo rest pose e a mesma ordem de ossos do corpo. Usar o
    // esqueleto do corpo (em vez do clone próprio) faz a malha seguir o idle nativo sem duplicar a
    // animação. Só troca quando o layout coincide; qualquer outro caso mantém o esqueleto da peça.
    const sharedRig =
      bodySkeleton && rig && sameBoneLayout(rig, bodySkeleton) ? bodySkeleton : undefined;
    for (const mesh of meshes) {
      if (sharedRig && mesh.isVerticesDataPresent(VertexBuffer.MatricesIndicesKind)) {
        mesh.skeleton = sharedRig;
      }
      mesh.receiveShadows = true;
      mesh.visibility = connected ? 1 : 0.35;
      shadows?.addShadowCaster(mesh);
    }
    const materials: Material[] = [];
    return {
      id,
      entries,
      rig,
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

  /** Cores da aparência (clona o material uma vez por peça). */
  const refresh = (config: AvatarConfig) => {
    for (const entry of equipped) {
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
        if (color === 'hair') pbr.albedoColor = hairTint(colorHex(config.hairColor));
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
        equipped.push(instantiate(id, container, model));
      }
      refresh(config);
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
