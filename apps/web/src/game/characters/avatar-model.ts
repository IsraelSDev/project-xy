import './gltf-loaders';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { colorHex, type AvatarConfig, type DecalChoice, type PlayerAction } from '@3dx/contracts';
import type { Pose } from '../animation/walk-cycle';
import { linearColor } from './avatar-colors';
import { DECAL_ANCHORS_3DX_FEMALE, DECAL_ANCHORS_3DX_MALE, createDecalLayer } from './decals-3dx';
import type { Joint } from './mannequin';

type AvatarModel = AvatarConfig['model'];

/** Altura alvo de qualquer modelo (m). */
const MODEL_HEIGHT = 1.7;

/**
 * Versão dos GLB nativos. Subir quando o corpo/actions mudarem para furar o cache do navegador
 * (o caminho do asset é estável e o GLB é grande demais para versionar por hash no cliente).
 */
const NATIVE_ASSET_VERSION = 9;

const MODEL_FILES: Record<AvatarModel, string> = {
  '3dx-male': `/assets/3dx/character_male.glb?v=${NATIVE_ASSET_VERSION}`,
  '3dx-female': `/assets/3dx/character_female.glb?v=${NATIVE_ASSET_VERSION}`,
};

/**
 * Ossos do 3DX nativo: o `export_glb.py` nomeia cada osso pelo índice na lista `bones` do JSON
 * (`b0..bN`), e os índices mudam por gênero (ver `tools/3dx/build/character_*.json`).
 */
export const JOINTS_3DX_MALE: Record<Joint, string> = {
  pelvis: 'b4',
  head: 'b148',
  'left-hip': 'b23',
  'left-knee': 'b24',
  'right-hip': 'b49',
  'right-knee': 'b50',
  'left-shoulder': 'b90',
  'left-elbow': 'b91',
  'right-shoulder': 'b269',
  'right-elbow': 'b270',
};

export const JOINTS_3DX_FEMALE: Record<Joint, string> = {
  pelvis: 'b1',
  head: 'b156',
  'left-hip': 'b3',
  'left-knee': 'b4',
  'right-hip': 'b39',
  'right-knee': 'b40',
  'left-shoulder': 'b78',
  'left-elbow': 'b79',
  'right-shoulder': 'b332',
  'right-elbow': 'b333',
};

/**
 * Velocidade natural do clipe `walk` nativo (m/s). O ciclo tem 1,2 s e a passada
 * medida nos pés é ~1,4 m (dois passos), então o clipe foi autorado para ~1,17 m/s.
 * O jogo anda a 1,35 m/s; tocar o clipe em 1x faria os pés patinarem.
 */
const NATIVE_WALK_SPEED = 1.4 / 1.2;

interface Rig {
  /** Osso do GLB para cada articulação da convenção (ADR 0006). */
  joints: Record<Joint, string>;
  /** Nomes exatos dos clipes embutidos. */
  clips: { idle: string; walk?: string; pose01?: string; pair01?: string };
}

const RIGS: Record<AvatarModel, Rig> = {
  '3dx-male': {
    joints: JOINTS_3DX_MALE,
    clips: { idle: 'idle', walk: 'walk', pose01: 'pose01', pair01: 'pair01' },
  },
  '3dx-female': {
    joints: JOINTS_3DX_FEMALE,
    clips: { idle: 'idle', walk: 'walk', pose01: 'pose01', pair01: 'pair01' },
  },
};

/** Clipe embutido para o estado do avatar; `undefined` = mantém o anterior. */
export function motionClip(model: AvatarModel, action: PlayerAction, moving: boolean) {
  const clips = RIGS[model].clips;
  if (action === '') return moving ? clips.walk : clips.idle;
  if (action === 'pose01') return clips.pose01;
  if (action === 'pair01') return clips.pair01;
  return undefined;
}

export interface AvatarModelAttachment {
  meshCount: number;
  /** Raiz do modelo (escala e posição já normalizadas para a altura do avatar). */
  root: TransformNode;
  /** Esqueleto principal do corpo (as peças casam pela mesma ordem de ossos). */
  skeleton: Skeleton | undefined;
  /**
   * Toca o clipe `clip` (nome exato) ou o `idle` embutido quando não há clipe. No 3DX não há pose
   * procedural calibrada: sem clipe, toca o `idle` nativo.
   *
   * `speed` é a velocidade do avatar (m/s), usada para acelerar/desacelerar o `walk` nativo
   * conforme o deslocamento; sem ela, o clipe toca na velocidade natural.
   */
  applyMotion(pose: Pose, clip: string | undefined, speed?: number): void;
  /** Aplica o tom de pele e as cores da aparência ao corpo. */
  applyAppearance(config: AvatarConfig): void;
  /** Recoloca os decalques (tatuagens) conforme a aparência. */
  applyDecals(decals: readonly DecalChoice[]): void;
  /** Desconectado (aguardando reconexão) fica translúcido, como o placeholder. */
  setConnected(connected: boolean): void;
  dispose(): void;
}

// Cada modelo carrega uma vez por cena; cada avatar recebe um clone (esqueleto e clipes próprios,
// materiais compartilhados). Erro de carga é esquecido para poder tentar de novo.
const containers = new WeakMap<Scene, Map<AvatarModel, Promise<AssetContainer>>>();

/**
 * Tira a metalicidade que ficou no padrão do glTF. Os GLB podem trazer a textura de
 * metal-rugosidade e deixar o fator de fora — e o padrão do glTF é 1 (metal). Sem ambiente (IBL)
 * na cena, metal só devolve a luz direta, o que aparece como faixa clara na pele e no pano. Nada
 * do catálogo é metal, então o fator vai a zero; a rugosidade continua valendo.
 */
export function stripDefaultMetallic(container: AssetContainer) {
  const seen = new Set<Material>();
  for (const mesh of container.meshes) {
    const material = mesh.material;
    if (!material || seen.has(material)) continue;
    seen.add(material);
    const pbr = material as PBRMaterial;
    if (pbr.metallic === 1 && pbr.metallicTexture) pbr.metallic = 0;
  }
}

/**
 * Filtro anisotrópico nas texturas do avatar. O atlas de pele é grande e visto em ângulo
 * (ombro, rosto); sem anisotropia o mipmap borra/“pixela” a superfície.
 */
export function maximizeTextureQuality(container: AssetContainer) {
  for (const texture of container.textures) {
    if (!(texture instanceof Texture)) continue;
    texture.anisotropicFilteringLevel = 8;
    texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  }
}

/** Corte do alfa para o cabelo: abaixo disso o fio é misturado, acima é opaco (ver `softenAlphaMasks`). */
const SOFT_ALPHA_CUTOFF = 0.15;

/**
 * Cabelo e sobrancelha são cartões com alfa suave. O glTF vem como MASK, com corte duro em 0,5:
 * somem os fios de alfa baixo e o cabelo fica ralo, com a pele aparecendo pelos furos.
 * ALPHATESTANDBLEND com corte baixo desenha quase todo o fio opaco e só a franja misturada, sem a
 * ordenação por triângulo que o blend puro exigiria.
 */
export function softenAlphaMasks(container: AssetContainer) {
  const seen = new Set<Material>();
  for (const mesh of container.meshes) {
    const material = mesh.material;
    if (!material || seen.has(material)) continue;
    seen.add(material);
    const pbr = material as PBRMaterial;
    if (pbr.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATEST) {
      pbr.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATESTANDBLEND;
      pbr.alphaCutOff = SOFT_ALPHA_CUTOFF;
    }
  }
}

function loadContainer(scene: Scene, model: AvatarModel): Promise<AssetContainer> {
  const byModel = containers.get(scene) ?? new Map<AvatarModel, Promise<AssetContainer>>();
  containers.set(scene, byModel);
  const cached = byModel.get(model);
  if (cached) return cached;
  const url = MODEL_FILES[model];
  const loading = LoadAssetContainerAsync(url, scene, {
    pluginExtension: url.endsWith('.gltf') ? '.gltf' : '.glb',
  })
    .then((container) => {
      stripDefaultMetallic(container);
      softenAlphaMasks(container);
      maximizeTextureQuality(container);
      return container;
    })
    .catch((error: unknown) => {
      byModel.delete(model);
      throw error;
    });
  byModel.set(model, loading);
  return loading;
}

/** Escolhe o esqueleto principal (o que tem o quadril; entre eles, o maior). */
export function pickRig(skeletons: readonly Skeleton[], pelvisBone: string): Skeleton | undefined {
  let rig: Skeleton | undefined;
  for (const skeleton of skeletons) {
    const hasHip = skeleton.bones.some((bone) => bone.name === pelvisBone);
    if (hasHip && (!rig || skeleton.bones.length > rig.bones.length)) rig = skeleton;
  }
  return rig;
}

/**
 * `instantiateModelsToScene` renomeia os grupos de animação com o prefixo "Clone of ", então o
 * nome do clipe original (o que `RIGS` guarda) é o nome sem esse prefixo.
 */
const CLONE_PREFIX = 'Clone of ';
function clipName(groupName: string): string {
  return groupName.startsWith(CLONE_PREFIX) ? groupName.slice(CLONE_PREFIX.length) : groupName;
}

/**
 * Escala e posiciona o `modelRoot` para a altura `targetHeight`, com os pés em y=0. As malhas são
 * medidas com o `modelRoot` sem pai e sem transform próprio, então a posição/rotação que o avatar
 * tem no mundo NÃO desloca o modelo. O 3DX fica com a raiz do GLB nos pés (como no viewer/render de
 * par), então não centraliza em Z para o offset de 0,25 m do par ser medido entre os modelos.
 */
export function normalizeModelTo(
  modelRoot: TransformNode,
  meshes: readonly AbstractMesh[],
  targetHeight: number,
): void {
  if (meshes.length === 0) return;
  const parent = modelRoot.parent;
  modelRoot.parent = null;
  modelRoot.scaling.setAll(1);
  modelRoot.position.setAll(0);
  modelRoot.computeWorldMatrix(true);
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(bounds.minimumWorld);
    max.maximizeInPlace(bounds.maximumWorld);
  }
  const height = max.y - min.y;
  const scale = Number.isFinite(height) && height > 0 ? targetHeight / height : 1;
  modelRoot.scaling.setAll(scale);
  modelRoot.position.set(-((min.x + max.x) / 2) * scale, -min.y * scale, 0);
  modelRoot.parent = parent;
}

/**
 * Tira a translação do quadril dos clipes. Os clipes do GLB trazem root motion (o quadril anda
 * dentro do avatar), o que faz o corpo escorregar em relação aos pés. Sai só a posição do quadril;
 * as rotações dos clipes continuam.
 */
function stripRootMotion(groups: AnimationGroup[], pelvis: TransformNode) {
  for (const group of groups) {
    const targeted = group.targetedAnimations;
    for (let i = targeted.length - 1; i >= 0; i--) {
      const entry = targeted[i];
      if (entry?.target === pelvis && entry.animation.targetProperty === 'position') {
        targeted.splice(i, 1);
      }
    }
  }
}

/** Monta o avatar de um modelo num `TransformNode` (a raiz do avatar). */
export async function attachAvatarModel(
  scene: Scene,
  avatarRoot: TransformNode,
  shadows: ShadowGenerator,
  model: AvatarModel,
): Promise<AvatarModelAttachment> {
  const container = await loadContainer(scene, model);
  const entries: InstantiatedEntries = container.instantiateModelsToScene(undefined, false);

  const modelRoot = new TransformNode(`avatar-model-root-${model}`, scene);
  modelRoot.parent = avatarRoot;
  for (const root of entries.rootNodes) root.parent = modelRoot;

  const meshes = entries.rootNodes
    .flatMap((root) => root.getChildMeshes(false))
    .filter((mesh) => mesh.getTotalVertices() > 0);
  normalizeModelTo(modelRoot, meshes, MODEL_HEIGHT);
  for (const mesh of meshes) shadows.addShadowCaster(mesh);
  // Escala/posição base (altura de referência MODEL_HEIGHT): a altura do avatar multiplica esta, em
  // torno dos pés (escalar posição e escala junto mantém os pés em y=0; no 3DX o Z base é 0).
  const baseScale = modelRoot.scaling.y;
  const basePosition = modelRoot.position.clone();

  // Materiais do GLB são compartilhados por todas as instâncias; a primeira troca de cor clona o
  // material da malha só para este avatar (uma vez por malha: as trocas seguintes mexem no clone).
  const ownMaterials = new Map<AbstractMesh, PBRMaterial>();
  const ownMaterial = (mesh: AbstractMesh): PBRMaterial | undefined => {
    const found = ownMaterials.get(mesh);
    if (found) return found;
    const clone = mesh.material?.clone(`${mesh.material.name}-${model}-${mesh.name}`);
    if (!(clone instanceof PBRMaterial)) return undefined;
    mesh.material = clone;
    ownMaterials.set(mesh, clone);
    return clone;
  };
  const white = new Color3(1, 1, 1);
  const applyAppearance = (config: AvatarConfig) => {
    // Altura: escala a raiz inteira (corpo e peças, que são filhas dela) em torno dos pés.
    modelRoot.scaling.setAll(baseScale * config.height);
    modelRoot.position.copyFrom(basePosition.scale(config.height));
    // O atlas de pele/rosto é multiplicado pelo tom escolhido. Os cílios ficam com o preto do
    // próprio atlas; só a pele (corpo, cabeça e anatomia) recebe o tom.
    const tint = linearColor(colorHex(config.skin));
    const hideAnatomy = config.bottom !== 'none' || config.underwear !== 'none';
    for (const mesh of meshes) {
      if (/penis/i.test(mesh.name)) mesh.isVisible = !hideAnatomy;
      const material = ownMaterial(mesh);
      if (material) material.albedoColor = /eyelash/i.test(mesh.name) ? white : tint;
    }
  };

  const rig = RIGS[model];
  const skeleton = pickRig(entries.skeletons, rig.joints.pelvis);
  const bodyMeshes = meshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && /body|head/i.test(mesh.name),
  );
  const decals = createDecalLayer(
    scene,
    skeleton,
    bodyMeshes,
    model === '3dx-female' ? DECAL_ANCHORS_3DX_FEMALE : DECAL_ANCHORS_3DX_MALE,
  );
  const pelvis = skeleton?.bones
    .find((bone) => bone.name === rig.joints.pelvis)
    ?.getTransformNode();
  if (pelvis) stripRootMotion(entries.animationGroups, pelvis);
  let connected = true;

  const clips = new Map<string, AnimationGroup>(
    entries.animationGroups.map((group): [string, AnimationGroup] => [clipName(group.name), group]),
  );
  const warnedClips = new Set<string>();
  let playing: AnimationGroup | undefined;
  /** Troca o clipe (corte seco, sem mistura). Devolve `false` se não há clipe para tocar. */
  const playClip = (name: string | undefined): boolean => {
    const next = name === undefined ? undefined : clips.get(name);
    if (name !== undefined && !next && !warnedClips.has(name)) {
      warnedClips.add(name);
      console.warn(`Animação ${name} não encontrada no modelo de avatar.`);
    }
    if (next !== playing) {
      playing?.stop();
      // Bones not keyed by the new clip would otherwise keep the previous clip's last frame.
      skeleton?.returnToRest();
      playing = next;
      if (next) {
        skeleton?.returnToRest();
        next.start(true, 1);
      }
    }
    return next !== undefined;
  };

  return {
    meshCount: meshes.length,
    root: modelRoot,
    skeleton,
    applyMotion(_pose, clip, speed) {
      const name = clip ?? rig.clips.idle;
      if (playClip(name) && playing) {
        // O clipe de caminhada foi autorado para ~1,17 m/s; acompanha a velocidade exibida para o
        // pé não patinar. A velocidade do jogo (1,35 m/s) deixa a cadência mais calma.
        playing.speedRatio =
          name === rig.clips.walk
            ? Math.min(1.8, Math.max(0.6, (speed ?? NATIVE_WALK_SPEED) / NATIVE_WALK_SPEED))
            : 1;
      }
    },
    applyAppearance,
    applyDecals(list) {
      decals.apply(list, connected);
    },
    setConnected(value) {
      connected = value;
      for (const mesh of meshes) mesh.visibility = value ? 1 : 0.35;
      decals.setOpacity(value ? 1 : 0.35);
    },
    dispose() {
      playing?.stop();
      decals.dispose();
      for (const mesh of meshes) shadows.removeShadowCaster(mesh);
      for (const clone of ownMaterials.values()) clone.dispose();
      entries.dispose();
      modelRoot.dispose();
    },
  };
}
