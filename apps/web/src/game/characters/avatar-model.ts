import './gltf-loaders';
import type { Animation } from '@babylonjs/core/Animations/animation';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
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
import {
  colorHex,
  isPairClipAction,
  resolveColorHex,
  type AvatarConfig,
  type DecalChoice,
  type PairClipAction,
  type PlayerAction,
} from '@3dx/contracts';
import type { SeatKind } from '@3dx/game-core';
import type { Pose } from '../animation/walk-cycle';
import { linearColor, skinTint } from './avatar-colors';
import { EyeTintPlugin } from './eye-tint-plugin';
import { DECAL_ANCHORS_3DX_FEMALE, DECAL_ANCHORS_3DX_MALE, createDecalLayer } from './decals-3dx';
import type { Joint } from './mannequin';
import { PAIR_CLIPS } from './pair-clips';

type AvatarModel = AvatarConfig['model'];

/** Altura alvo de qualquer modelo (m). */
const MODEL_HEIGHT = 1.7;

/**
 * Versão dos GLB nativos. Subir quando o corpo/actions mudarem para furar o cache do navegador
 * (o caminho do asset é estável e o GLB é grande demais para versionar por hash no cliente).
 */
export const NATIVE_ASSET_VERSION = 22;

const MODEL_FILES: Record<AvatarModel, string> = {
  '3dx-male': `/assets/3dx/character_male.glb?v=${NATIVE_ASSET_VERSION}`,
  '3dx-female': `/assets/3dx/character_female.glb?v=${NATIVE_ASSET_VERSION}`,
};

/** Clipes de par que o corpo não carrega: vêm de `clips/<gênero>/<ação>.glb` sob demanda. */
const LAZY_CLIPS: Record<AvatarModel, ReadonlySet<string>> = {
  '3dx-male': new Set(PAIR_CLIPS.male),
  '3dx-female': new Set(PAIR_CLIPS.female),
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
  clips: {
    idle: string;
    walk?: string;
    pose01?: string;
    dance?: string;
    dance2?: string;
    /** Clipes nativos de sentar, por tipo de móvel. */
    sitSofa?: string;
    sitChair?: string;
    sitStool?: string;
  } & Partial<Record<PairClipAction, string>>;
}

const RIGS: Record<AvatarModel, Rig> = {
  '3dx-male': {
    joints: JOINTS_3DX_MALE,
    clips: {
      idle: 'idle',
      walk: 'walk',
      pose01: 'pose01',
      pair01: 'pair01',
      pair02: 'pair02',
      pair03: 'pair03',
      pair04: 'pair04',
      pair06: 'pair06',
      pair07: 'pair07',
      pair08: 'pair08',
      pair09: 'pair09',
      pair10: 'pair10',
      pair11: 'pair11',
      pair12: 'pair12',
      pair13: 'pair13',
      pair14: 'pair14',
      pair15: 'pair15',
      pair16: 'pair16',
      pair17: 'pair17',
      pair18: 'pair18',
      pair19: 'pair19',
      pair20: 'pair20',
      pair21: 'pair21',
      pair22: 'pair22',
      pair23: 'pair23',
      pair24: 'pair24',
      pair25: 'pair25',
      pair26: 'pair26',
      pair27: 'pair27',
      pair28: 'pair28',
      pair29: 'pair29',
      pair30: 'pair30',
      pair31: 'pair31',
      pair32: 'pair32',
      pair33: 'pair33',
      pair34: 'pair34',
      pair35: 'pair35',
      pair36: 'pair36',
      pair37: 'pair37',
      // Pares M/M: as duas metades foram autoradas para o corpo masculino.
      mm_hug_a: 'mm_hug_a',
      mm_hug_b: 'mm_hug_b',
      mm_kiss_a: 'mm_kiss_a',
      mm_kiss_b: 'mm_kiss_b',
      mm_sofa_1_a: 'mm_sofa_1_a',
      mm_sofa_1_b: 'mm_sofa_1_b',
      mm_bed_1_a: 'mm_bed_1_a',
      mm_bed_1_b: 'mm_bed_1_b',
      mm_slow_dance_a: 'mm_slow_dance_a',
      mm_slow_dance_b: 'mm_slow_dance_b',
      mm_slow_dance_invert_a: 'mm_slow_dance_invert_a',
      mm_slow_dance_invert_b: 'mm_slow_dance_invert_b',
      mm_chair_1_a: 'mm_chair_1_a',
      mm_chair_1_b: 'mm_chair_1_b',
      mm_wall_1_a: 'mm_wall_1_a',
      mm_wall_1_b: 'mm_wall_1_b',
      mm_sofa_2_a: 'mm_sofa_2_a',
      mm_sofa_2_b: 'mm_sofa_2_b',
      mm_bed_2_a: 'mm_bed_2_a',
      mm_bed_2_b: 'mm_bed_2_b',
      mm_chair_2_a: 'mm_chair_2_a',
      mm_chair_2_b: 'mm_chair_2_b',
      sitSofa: 'sit_sofa',
      sitChair: 'sit_chair',
      sitStool: 'sit_stool',
    },
  },
  '3dx-female': {
    joints: JOINTS_3DX_FEMALE,
    clips: {
      idle: 'idle',
      walk: 'walk',
      pose01: 'pose01',
      pair01: 'pair01',
      pair02: 'pair02',
      pair03: 'pair03',
      pair04: 'pair04',
      pair06: 'pair06',
      pair07: 'pair07',
      pair08: 'pair08',
      pair09: 'pair09',
      pair10: 'pair10',
      pair11: 'pair11',
      pair12: 'pair12',
      pair13: 'pair13',
      pair14: 'pair14',
      pair15: 'pair15',
      pair16: 'pair16',
      pair17: 'pair17',
      pair18: 'pair18',
      pair19: 'pair19',
      pair20: 'pair20',
      pair21: 'pair21',
      pair22: 'pair22',
      pair23: 'pair23',
      pair24: 'pair24',
      pair25: 'pair25',
      pair26: 'pair26',
      pair27: 'pair27',
      pair28: 'pair28',
      pair29: 'pair29',
      pair30: 'pair30',
      pair31: 'pair31',
      pair32: 'pair32',
      pair33: 'pair33',
      pair34: 'pair34',
      pair35: 'pair35',
      pair36: 'pair36',
      pair37: 'pair37',
      // Pares F/F: as duas metades foram autoradas para o corpo feminino.
      ff_hug_a: 'ff_hug_a',
      ff_hug_b: 'ff_hug_b',
      ff_kiss_a: 'ff_kiss_a',
      ff_kiss_b: 'ff_kiss_b',
      ff_sofa_1_a: 'ff_sofa_1_a',
      ff_sofa_1_b: 'ff_sofa_1_b',
      ff_bed_1_a: 'ff_bed_1_a',
      ff_bed_1_b: 'ff_bed_1_b',
      ff_slow_dance_a: 'ff_slow_dance_a',
      ff_slow_dance_b: 'ff_slow_dance_b',
      ff_slow_dance_invert_a: 'ff_slow_dance_invert_a',
      ff_slow_dance_invert_b: 'ff_slow_dance_invert_b',
      ff_chair_1_a: 'ff_chair_1_a',
      ff_chair_1_b: 'ff_chair_1_b',
      ff_sofa_2_a: 'ff_sofa_2_a',
      ff_sofa_2_b: 'ff_sofa_2_b',
      ff_bed_2_a: 'ff_bed_2_a',
      ff_bed_2_b: 'ff_bed_2_b',
      ff_chair_2_a: 'ff_chair_2_a',
      ff_chair_2_b: 'ff_chair_2_b',
      ff_wall_1_a: 'ff_wall_1_a',
      ff_wall_1_b: 'ff_wall_1_b',
      dance: 'dance',
      dance2: 'dance2',
      sitSofa: 'sit_sofa',
      sitChair: 'sit_chair',
      sitStool: 'sit_stool',
    },
  },
};

/**
 * Clipe embutido para o estado do avatar; `undefined` = mantém o anterior.
 *
 * Sentar escolhe o clipe nativo da mobília (`seatKind`): sofá, cadeira ou banco. Sem a
 * mobília (posição antiga/desconhecida), usa o sofá.
 */
export function motionClip(
  model: AvatarModel,
  action: PlayerAction,
  moving: boolean,
  seatKind: SeatKind = 'sofa',
) {
  const clips = RIGS[model].clips;
  if (action === '') return moving ? clips.walk : clips.idle;
  if (action === 'pose01') return clips.pose01;
  if (action === 'sit') {
    if (seatKind === 'stool') return clips.sitStool;
    if (seatKind === 'chair') return clips.sitChair;
    // Cama e sofá usam o mesmo clipe sentado até o par de cama entrar em cena.
    return clips.sitSofa;
  }
  if (isPairClipAction(action)) {
    // Clipe de par de móvel/F-F/M-M não vem no corpo: devolve a ação e o avatar carrega sob
    // demanda (`ensureClip`); até chegar, o `playClip` mantém o clipe anterior.
    return clips[action] ?? (LAZY_CLIPS[model].has(action) ? action : undefined);
  }
  if (action === 'dance') return clips.dance;
  if (action === 'dance2') return clips.dance2;
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
   *
   * `syncStartedAt` alinha o clipe com um relógio comum (pares): o frame é corrigido se o
   * avatar começou a tocar depois do parceiro.
   */
  applyMotion(pose: Pose, clip: string | undefined, speed?: number, syncStartedAt?: number): void;
  /**
   * Garante que um clipe de par sob demanda (`clips/...`) está carregado; idempotente. O clipe entra
   * no mapa interno e passa a tocar no próximo `applyMotion`. Ação de base é no-op.
   */
  ensureClip(action: string): void;
  /** Aplica o tom de pele e as cores da aparência ao corpo. */
  applyAppearance(config: AvatarConfig): void;
  /**
   * Escala o modelo para uma altura relativa (1 = 1,70 m), em torno dos pés. Os pares de móvel
   * usam uma escala comum entre os dois corpos: o clipe foi autorado para esqueletos iguais.
   */
  setHeight(ratio: number): void;
  /** Recoloca os decalques (tatuagens) conforme a aparência. */
  applyDecals(decals: readonly DecalChoice[]): void;
  /** Desconectado (aguardando reconexão) fica translúcido, como o placeholder. */
  setConnected(connected: boolean): void;
  dispose(): void;
}

// Cada modelo carrega uma vez por cena; cada avatar recebe um clone (esqueleto e clipes próprios,
// materiais compartilhados). Erro de carga é esquecido para poder tentar de novo.
const containers = new WeakMap<Scene, Map<AvatarModel, Promise<AssetContainer>>>();
/** Containers dos clipes de par sob demanda, por cena (as animações precisam continuar vivas). */
const clipContainers = new WeakMap<Scene, Map<string, Promise<AssetContainer | undefined>>>();

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
    // Máxima nitidez possível em cabelo/roupa/acesório (o driver limita ao suportado).
    texture.anisotropicFilteringLevel = 16;
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

/** Lê um componente da chave de uma animação de translação (Vector3 ou número). */
const keyComponent = (value: unknown, axis: 'x' | 'y' | 'z'): number => {
  if (typeof value === 'number') return value;
  const vector = value as Partial<Record<'x' | 'y' | 'z', number>> | undefined;
  const component = vector?.[axis];
  return typeof component === 'number' ? component : 0;
};

/**
 * `true` quando a translação animada varia ao longo do clipe — o root motion de verdade.
 *
 * A posição do quadril nos clipes de sentar é **constante**: ela desce o corpo até o assento e
 * faz parte da pose. Tratá-la como root motion deixa o quadril na altura de pé enquanto o resto
 * do corpo senta (no masculino a pelve fica 0,33 m acima das pernas) e rasga a malha do quadril.
 */
function translationMoves(animation: Animation): boolean {
  const keys = animation.getKeys();
  const first = keys[0]?.value as unknown;
  if (keys.length < 2 || first === undefined) return false;
  return keys.some((key) =>
    (['x', 'y', 'z'] as const).some(
      (axis) =>
        Math.abs(keyComponent(key.value as unknown, axis) - keyComponent(first, axis)) > 1e-4,
    ),
  );
}

/**
 * Clipes de pose (pares e sentar). A translação do quadril que varia aqui é o corpo se movendo
 * contra o móvel, não root motion. As raízes ligadas à cintura (`man_Spine`, Gen_Ass, pênis)
 * mantêm essa mesma translação no clipe; tirá-la só do quadril deixa o quadril parado enquanto o
 * resto se move (8 a 13 cm no masculino) e a cintura racha. Por isso esses clipes não são tocados.
 */
const POSE_CLIP = /^(pair\d+|sit_)/;

/**
 * Tira só o root motion do quadril: a translação que **varia** dentro do clipe (o quadril anda
 * em relação aos pés), mantendo a translação constante da pose. As rotações continuam intactas.
 */
export function stripRootMotion(groups: AnimationGroup[], pelvis: TransformNode) {
  for (const group of groups) {
    if (POSE_CLIP.test(clipName(group.name))) continue;
    const targeted = group.targetedAnimations;
    for (let i = targeted.length - 1; i >= 0; i--) {
      const entry = targeted[i];
      if (
        entry?.target === pelvis &&
        entry.animation.targetProperty === 'position' &&
        translationMoves(entry.animation)
      ) {
        targeted.splice(i, 1);
      }
    }
  }
}

/**
 * Clipes em que a face fica congelada: sentar e os pares de móvel não usam expressão, e a
 * cadeia facial vinda dos bundles distorce a malha do rosto no retarget.
 */
const FACE_FREEZE_CLIPS = new Set([
  'sit_sofa',
  'sit_chair',
  'sit_stool',
  'pair10',
  'pair11',
  'pair12',
  'pair13',
  'pair14',
  'pair15',
  'pair16',
  'pair17',
  'pair18',
  'pair19',
  'pair20',
  'pair21',
  'pair22',
  'pair23',
  'pair24',
  'pair25',
  'pair26',
  'pair27',
  'pair28',
  'pair29',
  'pair30',
  'pair31',
  'pair32',
  'pair33',
  'pair34',
  'pair35',
  'pair36',
  'pair37',
]);

/**
 * Ossos da face (descendentes do osso principal da cabeça) que distorcem a malha quando o clipe
 * de sentar traz as rotações da cadeia facial do bundle de origem.
 *
 * O osso principal é o que tem mais peso na malha `_head` (b157 no feminino, b148 no masculino);
 * o próprio osso fica de fora, então a cabeça continua acompanhando o tronco.
 */
function faceBoneNodes(skeleton: Skeleton, meshes: readonly AbstractMesh[]): Set<TransformNode> {
  const head = meshes.find(
    (mesh) =>
      /(^|_)head$/i.test(mesh.name.replace(CLONE_PREFIX, '')) &&
      !/jaw_eyes|eyelash/i.test(mesh.name),
  );
  if (!head) return new Set();
  const indices = head.getVerticesData(VertexBuffer.MatricesIndicesKind);
  const weights = head.getVerticesData(VertexBuffer.MatricesWeightsKind);
  if (!indices || !weights) return new Set();
  const totals = new Map<number, number>();
  for (let i = 0; i < weights.length; i += 4) {
    for (let k = 0; k < 4; k++) {
      const weight = weights[i + k] ?? 0;
      const bone = indices[i + k];
      if (weight > 0 && bone !== undefined) {
        totals.set(bone, (totals.get(bone) ?? 0) + weight);
      }
    }
  }
  let main = -1;
  let mainWeight = 0;
  for (const [bone, weight] of totals) {
    if (weight > mainWeight) {
      main = bone;
      mainWeight = weight;
    }
  }
  const root = main >= 0 ? skeleton.bones[main] : undefined;
  if (!root) return new Set();
  const nodes = new Set<TransformNode>();
  const stack = [...root.getChildren()];
  while (stack.length > 0) {
    const bone = stack.pop()!;
    const node = bone.getTransformNode();
    if (node) nodes.add(node);
    stack.push(...bone.getChildren());
  }
  return nodes;
}

/**
 * Congela a cadeia facial nos clipes de sentar e nos pares de móvel. Esses clipes vêm de pose
 * bundles com a mandíbula, lábios, língua e olhos animados; no corpo retargetado a deformação não
 * fecha com o atlas de olhos/boca preso ao osso Head, e a boca sai torta. Essas poses não precisam
 * de expressão: remove as animações dos descendentes do osso principal da cabeça (o Head continua
 * animando).
 */
export function freezeFaceOnSit(
  groups: readonly AnimationGroup[],
  skeleton: Skeleton,
  meshes: readonly AbstractMesh[],
) {
  const face = faceBoneNodes(skeleton, meshes);
  if (face.size === 0) return;
  for (const group of groups) {
    if (!FACE_FREEZE_CLIPS.has(clipName(group.name))) continue;
    const targeted = group.targetedAnimations;
    for (let i = targeted.length - 1; i >= 0; i--) {
      const target = targeted[i]?.target as TransformNode | undefined;
      if (target && face.has(target)) targeted.splice(i, 1);
    }
  }
}

/**
 * Carrega um clipe de par sob demanda (`clips/<gênero>/<ação>.glb`) e amarra ao esqueleto do corpo
 * atual pelo **nome do osso**. Os arquivos não têm malha: só a hierarquia de nós + uma animação.
 * O container fica em cache por cena (as animações são compartilhadas entre avatares).
 */
export async function loadPairClipGroup(
  scene: Scene,
  model: AvatarModel,
  action: string,
  skeleton: Skeleton,
  meshes: readonly AbstractMesh[],
  pelvis: TransformNode | null | undefined,
  /** Injetável nos testes (no navegador o loader busca pela URL). */
  load: (url: string) => Promise<AssetContainer | undefined> = (url) =>
    LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' }).catch(() => undefined),
): Promise<AnimationGroup | undefined> {
  let byKey = clipContainers.get(scene);
  if (!byKey) {
    byKey = new Map();
    clipContainers.set(scene, byKey);
  }
  const key = `${model}/${action}`;
  let pending = byKey.get(key);
  if (!pending) {
    const gender = model === '3dx-female' ? 'female' : 'male';
    const url = `/assets/3dx/clips/${gender}/${action}.glb?v=${NATIVE_ASSET_VERSION}`;
    pending = load(url);
    byKey.set(key, pending);
  }
  const container = await pending;
  const source = container?.animationGroups[0];
  if (!source) return undefined;

  const group = new AnimationGroup(action, scene);
  const boneByName = new Map(skeleton.bones.map((bone) => [bone.name, bone.getTransformNode()]));
  for (const entry of source.targetedAnimations) {
    const name = (entry.target as { name?: string } | null)?.name;
    const node = name ? boneByName.get(name) : undefined;
    if (node) group.addTargetedAnimation(entry.animation, node);
  }
  if (group.targetedAnimations.length === 0) {
    group.stop();
    return undefined;
  }
  if (pelvis) stripRootMotion([group], pelvis);
  freezeFaceOnSit([group], skeleton, meshes);
  return group;
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
  // Plugin por malha (o material é clonado uma vez; a cor da íris só troca o uniforme).
  const eyePlugins = new Map<AbstractMesh, EyeTintPlugin>();
  const applyAppearance = (config: AvatarConfig) => {
    // Altura: escala a raiz inteira (corpo e peças, que são filhas dela) em torno dos pés.
    modelRoot.scaling.setAll(baseScale * config.height);
    modelRoot.position.copyFrom(basePosition.scale(config.height));
    // O atlas de pele/rosto já traz a pele; o tom escolhido entra como multiplicador relativo a ele
    // (`skinTint`). Os cílios ficam com o preto do próprio atlas; só a pele (corpo, cabeça e
    // anatomia) recebe o tom.
    const tint = skinTint(model, colorHex(config.skin));
    const eyeTint = linearColor(resolveColorHex(config.eyeColor, config.eyeColorHex));
    const hideAnatomy = config.bottom !== 'none' || config.underwear !== 'none';
    for (const mesh of meshes) {
      if (/penis/i.test(mesh.name)) mesh.isVisible = !hideAnatomy;
      const material = ownMaterial(mesh);
      if (!material) continue;
      if (/jaw_eyes|eyes_atlas/i.test(mesh.name)) {
        // A íris é um mapa cinza no atlas: o `EyeTintPlugin` pinta só ela e deixa a esclera branca.
        material.albedoColor = white;
        let plugin = eyePlugins.get(mesh);
        if (!plugin) {
          plugin = new EyeTintPlugin(material);
          eyePlugins.set(mesh, plugin);
        }
        plugin.tint.copyFrom(eyeTint);
        plugin.isEnabled = true;
        continue;
      }
      material.albedoColor = /eyelash/i.test(mesh.name) ? white : tint;
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
  if (skeleton) freezeFaceOnSit(entries.animationGroups, skeleton, meshes);
  let connected = true;

  const clips = new Map<string, AnimationGroup>(
    entries.animationGroups.map((group): [string, AnimationGroup] => [clipName(group.name), group]),
  );
  const warnedClips = new Set<string>();
  let playing: AnimationGroup | undefined;
  const pendingClips = new Set<string>();
  const lazyGroups = new Set<AnimationGroup>();
  /** Carrega clipes de par sob demanda (fora do GLB do corpo) uma única vez por avatar. */
  const ensureClip = (action: string) => {
    if (clips.has(action) || !LAZY_CLIPS[model].has(action) || pendingClips.has(action)) return;
    pendingClips.add(action);
    void loadPairClipGroup(scene, model, action, skeleton!, meshes, pelvis).then((group) => {
      pendingClips.delete(action);
      if (!group || modelRoot.isDisposed()) {
        group?.stop();
        return;
      }
      clips.set(action, group);
      lazyGroups.add(group);
    });
  };
  /** Troca o clipe (corte seco, sem mistura). Devolve `false` se não há clipe para tocar. */
  const playClip = (name: string | undefined): boolean => {
    const next = name === undefined ? undefined : clips.get(name);
    if (name !== undefined && !next) {
      // Clipe de par sob demanda ainda não chegou: segue no anterior (sem aviso no console).
      if (LAZY_CLIPS[model].has(name)) return false;
      if (!warnedClips.has(name)) {
        warnedClips.add(name);
        console.warn(`Animação ${name} não encontrada no modelo de avatar.`);
      }
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
    ensureClip,
    applyMotion(_pose, clip, speed, syncStartedAt) {
      const name = clip ?? rig.clips.idle;
      if (playClip(name) && playing) {
        // O clipe de caminhada foi autorado para ~1,17 m/s; acompanha a velocidade exibida para o
        // pé não patinar. Na corrida de 10x a cadência satura no limite (o deslocamento domina).
        playing.speedRatio =
          name === rig.clips.walk
            ? Math.min(2.4, Math.max(0.6, (speed ?? NATIVE_WALK_SPEED) / NATIVE_WALK_SPEED))
            : 1;
        if (syncStartedAt !== undefined) {
          // Pares assimétricos (M/F) são clipes separados; se um lado começa depois do outro,
          // o loop fica fora de fase. Pula para o frame do relógio comum do par.
          const length = playing.getLength();
          const frameCount = playing.to;
          if (length > 0 && frameCount > 0) {
            const fps = frameCount / length;
            const target = ((performance.now() - syncStartedAt) / 1000) % length;
            const current = playing.getCurrentFrame() / fps;
            const drift = Math.abs(((current - target + length / 2) % length) - length / 2);
            if (drift > 0.12) playing.goToFrame(target * fps);
          }
        }
      }
    },
    applyAppearance,
    applyDecals(list) {
      decals.apply(list, connected);
    },
    setHeight(ratio) {
      modelRoot.scaling.setAll(baseScale * ratio);
      modelRoot.position.copyFrom(basePosition.scale(ratio));
    },
    setConnected(value) {
      connected = value;
      for (const mesh of meshes) mesh.visibility = value ? 1 : 0.35;
      decals.setOpacity(value ? 1 : 0.35);
    },
    dispose() {
      playing?.stop();
      for (const group of lazyGroups) group.stop();
      lazyGroups.clear();
      decals.dispose();
      for (const mesh of meshes) shadows.removeShadowCaster(mesh);
      for (const clone of ownMaterials.values()) clone.dispose();
      entries.dispose();
      modelRoot.dispose();
    },
  };
}
