import './gltf-loaders';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  colorHex,
  isGoeModel,
  type AvatarConfig,
  type DecalChoice,
  type PlayerAction,
} from '@3dx/contracts';
import type { Pose } from '../animation/walk-cycle';
import { effectiveMorphs, muscleBoosts, underClothes } from './body-build';
import { createDecalLayer } from './goe-decals';
import {
  applyPresetToSkeleton,
  captureSkeletonRest,
  restoreSkeletonRest,
  type PosePreset,
} from './goe-poses';
import type { Joint } from './mannequin';
import { eyebrowTint, skinTint } from './avatar-colors';
import { applyMorphs, extractMorphs, morphLibraryOf } from './morph-bake';

type AvatarModel = AvatarConfig['model'];

/** Altura alvo de qualquer modelo (m). */
const MODEL_HEIGHT = 1.7;

const MODEL_FILES: Record<AvatarModel, string> = {
  // GoE Character Creator (DanilGOE, licença comercial). Corpo nu (a roupa vem das peças).
  'goe-male': '/assets/goe/GoE_Male.glb',
  'goe-female': '/assets/goe/GoE_Female.glb',
  // 3DXChat nativo (ver ADR 0016): corpo + cabeça + cílios, com um clipe de teste embutido.
  '3dx-male': '/assets/3dx/character_male.glb',
  '3dx-female': '/assets/3dx/character_female.glb',
};

/** Eixo local de flexão de uma articulação na pose procedural (padrão 'x'). */
export type PoseAxis = 'x' | '-x' | 'y' | '-y' | 'z' | '-z';

const POSE_AXIS_VECTORS: Record<PoseAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  '-x': new Vector3(-1, 0, 0),
  y: new Vector3(0, 1, 0),
  '-y': new Vector3(0, -1, 0),
  z: new Vector3(0, 0, 1),
  '-z': new Vector3(0, 0, -1),
};

/** Rotação de repouso extra (além da do osso) que tira o membro da pose de fabricação do modelo. */
export interface RigBase {
  /** Eixo local: um dos eixos nomeados ou um vetor (normalizado ao usar). */
  axis: PoseAxis | readonly [number, number, number];
  angle: number;
  /** Deslocamento do osso no espaço local do pai (m), somado à posição de repouso. */
  offset?: readonly [number, number, number];
}

const axisVector = (axis: RigBase['axis']): Vector3 =>
  typeof axis === 'string'
    ? POSE_AXIS_VECTORS[axis]
    : new Vector3(axis[0], axis[1], axis[2]).normalize();

interface Rig {
  /** Osso do GLB para cada articulação da convenção (ADR 0006). */
  joints: Record<Joint, string>;
  /**
   * Eixo local de flexão por articulação. O padrão (`x`) vale para o manequim; rigs com orientação
   * de osso diferente (ex.: GoE) precisam de outro eixo/sinal, senão os braços giram para o lado
   * errado.
   */
  axes?: Partial<Record<Joint, PoseAxis>>;
  /**
   * Deslocamento de repouso por articulação, aplicado antes da pose. Modelos modelados em T-pose
   * (o GoE) precisam dos braços abaixados; sem isto a pose procedural só gira o braço na horizontal.
   */
  base?: Partial<Record<Joint, RigBase>>;
  /** Nomes exatos dos clipes embutidos. Sem `clips` = só pose procedural. */
  clips?: { idle: string; walk?: string; sit?: string };
}

/**
 * Ossos do corpo GoE (GoE_Male.glb / GoE_Female.glb, mesmo esqueleto nos dois gêneros). As
 * articulações ficam nos ossos deform (`*_stretch`), o quadril na primeira vértebra.
 */
export const GOE_JOINTS: Record<Joint, string> = {
  pelvis: 'spine_01.x',
  head: 'head.x',
  'left-hip': 'thigh_stretch.l',
  'left-knee': 'leg_stretch.l',
  'right-hip': 'thigh_stretch.r',
  'right-knee': 'leg_stretch.r',
  'left-shoulder': 'arm_stretch.l',
  'left-elbow': 'forearm_stretch.l',
  'right-shoulder': 'arm_stretch.r',
  'right-elbow': 'forearm_stretch.r',
};

/**
 * Ossos GoE: a flexão acontece no eixo local Z (o X abre os membros para os lados). O lado direito é
 * espelhado. Medido in-loco girando cada osso e observando o deslocamento do filho (ver
 * `goe-model.test.ts`).
 */
export const GOE_POSE_AXES: Partial<Record<Joint, PoseAxis>> = {
  'left-hip': 'z',
  'right-hip': '-z',
  'left-knee': 'z',
  'right-knee': '-z',
  'left-shoulder': 'z',
  'right-shoulder': '-z',
  'left-elbow': 'z',
  'right-elbow': '-z',
};

/**
 * O corpo GoE é modelado em T-pose (braços na horizontal) com os cotovelos dobrados ~25° para dentro
 * (repouso do GLB). A pose procedural assume o membro para baixo e reto:
 * - ~77° no eixo X do ombro: o braço superior fica a ~13° da vertical;
 * - ~25° em Z no cotovelo (espelhado): endireita o antebraço, que agora segue o braço (rig FK).
 * Medido no navegador (braço superior ~12,7° da vertical, antebraço sem dobra). O balanço da pose
 * continua nos eixos de `GOE_POSE_AXES`.
 */
export const GOE_BASE: Record<'goe-male' | 'goe-female', Partial<Record<Joint, RigBase>>> = {
  // Calibrado contra a pose avaliada do blend (constraints aplicados, medida no Blender): o osso do braço gira
  // 50,3° em torno de um eixo com torção e balanço (não só X) e o pivô do ombro desce 8 cm e entra 4 cm junto.
  // Sem o deslocamento do pivô o deltoide fica pendurado no ombro alto e o trapézio some. Eixo e deslocamento
  // convertidos do espaço do osso do Blender para o local do glTF; o cotovelo não recebe base.
  'goe-male': {
    'left-shoulder': {
      axis: [-0.979, 0.132, -0.158],
      angle: 0.878,
      offset: [-0.0182, -0.039, -0.08],
    },
    'right-shoulder': {
      axis: [-0.979, -0.132, 0.158],
      angle: 0.878,
      offset: [0.0182, -0.039, -0.08],
    },
  },
  // O repouso do GLB feminino já é a pose do artista no blend: braço a 39,2° da vertical e cotovelo com
  // 13° de dobra. Sem base, senão o braço vai para trás do corpo.
  'goe-female': {},
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

const RIGS: Record<AvatarModel, Rig> = {
  // GoE Character Creator: mesmo esqueleto nos dois gêneros, só pose procedural (sem clipes).
  'goe-male': { joints: GOE_JOINTS, axes: GOE_POSE_AXES, base: GOE_BASE['goe-male'] },
  'goe-female': { joints: GOE_JOINTS, axes: GOE_POSE_AXES, base: GOE_BASE['goe-female'] },
  // 3DX nativo: esqueleto por gênero (índices próprios) e o idle nativo embutido no corpo. O clipe
  // `idle` é o `stay_pose_1` do cliente, já assado no rest pose do corpo (ver Fase E / ADR 0016).
  '3dx-male': { joints: JOINTS_3DX_MALE, clips: { idle: 'idle' } },
  '3dx-female': { joints: JOINTS_3DX_FEMALE, clips: { idle: 'idle' } },
};

/** Clipe embutido para o estado do avatar; `undefined` = pose procedural. */
export function motionClip(model: AvatarModel, action: PlayerAction, moving: boolean) {
  const clips = RIGS[model].clips;
  if (!clips) return undefined;
  if (action === '') return moving ? clips.walk : clips.idle;
  if (action === 'sit') return clips.sit;
  return undefined;
}

export interface AvatarModelAttachment {
  meshCount: number;
  /** Raiz do modelo (escala e posição já normalizadas para a altura do avatar). */
  root: TransformNode;
  /** Esqueleto principal do corpo (as peças casam pela mesma ordem de ossos). */
  skeleton: Skeleton | undefined;
  /**
   * Toca o clipe `clip` (nome exato) ou, sem clipe, aplica a pose procedural nos ossos (mesma
   * convenção de sinais do manequim). Clipe ausente no modelo cai na pose. No 3DX não há pose
   * procedural calibrada: sem clipe, toca o `idle` nativo embutido.
   */
  applyMotion(pose: Pose, clip: string | undefined): void;
  /**
   * Troca as texturas de pele e olhos do corpo pela aparência do avatar e aplica as shape keys (`morphs`).
   * Os materiais do GLB são compartilhados entre instâncias, então a primeira troca clona o material do corpo
   * (e dos olhos) só para este avatar.
   */
  applyAppearance(config: AvatarConfig): void;
  /** Recoloca os decalques (tatuagem, cicatriz…) conforme a aparência. */
  applyDecals(decals: readonly DecalChoice[]): void;
  /**
   * Trava o esqueleto numa pose estática exportada do GoE (ou volta à pose procedural com
   * `undefined`). Enquanto ativa, `applyMotion` não mexe nos ossos.
   */
  setPosePreset(preset: PosePreset | undefined): void;
  /**
   * Abre/fecha a mandíbula (`jawbone.x`) por cima da pose atual, em radianos (0 = fechada). A UAL não
   * traz animação facial, então a boca da conversa é procedural (ver `talkJaw` em `avatars.ts`);
   * chamar a cada quadro depois de `setPosePreset`. Sem o osso, é um no-op.
   */
  setJaw(angle: number): void;
  /** Desconectado (aguardando reconexão) fica translúcido, como o placeholder. */
  setConnected(connected: boolean): void;
  dispose(): void;
}

// Cada modelo carrega uma vez por cena; cada avatar recebe um clone (esqueleto e clipes próprios,
// materiais compartilhados). Erro de carga é esquecido para poder tentar de novo.
const containers = new WeakMap<Scene, Map<AvatarModel, Promise<AssetContainer>>>();

/** Texturas de aparência (pele/olhos) compartilhadas por cena — evitam um download por avatar. */
const appearanceTextures = new WeakMap<Scene, Map<string, Texture>>();

function appearanceTexture(scene: Scene, url: string): Texture {
  const byUrl = appearanceTextures.get(scene) ?? new Map<string, Texture>();
  appearanceTextures.set(scene, byUrl);
  let texture = byUrl.get(url);
  if (!texture) {
    // invertY=false: os UVs do glTF têm origem no canto superior esquerdo (o padrão do Babylon, true, vira
    // o atlas de cabeça para baixo: mamilos na virilha, boca no queixo, olhos sem íris).
    texture = new Texture(url, scene, false, false);
    byUrl.set(url, texture);
  }
  return texture;
}

/** Caminho da textura de pele/olhos na biblioteca de assets (ver `public/assets/goe`). */
const SKIN_URL = (gender: 'male' | 'female', id: string) =>
  `/assets/goe/skins/${gender}/${id}.webp`;

/** Textura de pele escolhida na aparência (a mesma do corpo; peças de pele, como a anatomia, usam ela). */
export function skinTextureFor(scene: Scene, config: AvatarConfig): Texture {
  return appearanceTexture(
    scene,
    SKIN_URL(config.model === 'goe-male' ? 'male' : 'female', config.skinTexture),
  );
}

const EYES_URL = (id: string) => `/assets/goe/eyes/${id}.webp`;

/**
 * Tira a metalicidade que ficou no padrão do glTF. Os GLB do GoE (corpo, camisa, calça, bota, moletom)
 * trazem a textura de metal-rugosidade e deixam o fator de fora — e o padrão do glTF é 1 (metal). Sem
 * ambiente (IBL) na cena, metal só devolve a luz direta, o que aparece como faixa clara na pele e no
 * pano (ombro e braço). Nada na biblioteca é metal, então o fator vai a zero; a rugosidade (canal
 * verde) e o resto do material continuam valendo.
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

/** Corte do alfa para o cabelo: abaixo disso o fio é misturado, acima é opaco (ver `softenAlphaMasks`). */
const SOFT_ALPHA_CUTOFF = 0.15;

/**
 * Cabelo e sobrancelha são cartões com alfa suave (no blend o material usa transparência por dithering, que
 * acumula camadas e cobre bem). O glTF vem como MASK, com corte duro em 0,5: somem os fios de alfa baixo e o
 * cabelo fica ralo, com a pele aparecendo pelos furos. ALPHATESTANDBLEND com corte baixo desenha quase todo o
 * fio opaco e só a franja misturada, sem a ordenação por triângulo que o blend puro exigiria.
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
      extractMorphs(container);
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

/** Liga cada articulação ao nó do osso no esqueleto principal. */
export function bindJoints(
  rig: Skeleton | undefined,
  joints: Record<Joint, string>,
  axes: Partial<Record<Joint, PoseAxis>> = {},
  base: Partial<Record<Joint, RigBase>> = {},
) {
  const drives: Partial<Record<Joint, JointDrive>> = {};
  if (!rig) {
    console.warn('Esqueleto com o quadril não encontrado no modelo de avatar.');
    return drives;
  }
  for (const [joint, boneName] of Object.entries(joints) as [Joint, string][]) {
    const node = rig.bones.find((bone) => bone.name === boneName)?.getTransformNode();
    if (!node) {
      console.warn(`Osso ${boneName} não encontrado no modelo de avatar.`);
      continue;
    }
    const rest = node.rotationQuaternion
      ? node.rotationQuaternion.clone()
      : Quaternion.FromEulerAngles(node.rotation.x, node.rotation.y, node.rotation.z);
    const current = rest.clone();
    node.rotationQuaternion = current;
    const adjust = base[joint];
    const posedRest = adjust
      ? rest.multiply(Quaternion.RotationAxis(axisVector(adjust.axis), adjust.angle))
      : rest;
    if (adjust?.offset) node.position.addInPlace(new Vector3(...adjust.offset));
    drives[joint] = {
      node,
      rest,
      posedRest,
      current,
      restY: node.position.y,
      axis: POSE_AXIS_VECTORS[axes[joint] ?? 'x'],
    };
  }
  return drives;
}

export interface JointDrive {
  node: TransformNode;
  /** Rotação de repouso do osso (sem pose). */
  rest: Quaternion;
  /** Repouso já com o deslocamento base (`Rig.base`); é o que a pose gira. */
  posedRest: Quaternion;
  /** Rotação escrita a cada quadro (mesma instância de `node.rotationQuaternion`). */
  current: Quaternion;
  /** Altura de repouso (só o quadril usa, para o balanço vertical). */
  restY: number;
  /** Eixo local em que a pose gira a articulação (ver `Rig.axes`). */
  axis: Vector3;
}

/** Rotação temporária do eixo X (aplicações de pose não são reentrantes). */
const axisDelta = new Quaternion();

/** Eixo local da mandíbula do GoE (`jawbone.x`): a abertura gira em torno do X do próprio osso. */
const JAW_AXIS = new Vector3(1, 0, 0);
const jawDelta = new Quaternion();

/** Aplica a mesma convenção de sinais de `Mannequin.applyPose` nos ossos mapeados. */
export function poseBones(drives: Partial<Record<Joint, JointDrive>>, pose: Pose) {
  const apply = (joint: Joint, angle: number) => {
    const bone = drives[joint];
    if (!bone) return;
    Quaternion.RotationAxisToRef(bone.axis, angle, axisDelta);
    bone.posedRest.multiplyToRef(axisDelta, bone.current);
    // Os clipes podem trocar a rotação do nó; reatribuir mantém o osso na pose calculada.
    bone.node.rotationQuaternion = bone.current;
  };
  const pelvis = drives.pelvis;
  if (pelvis) {
    // `bob` é em metros do mundo; o quadril está dentro de ancestrais com escala própria
    // (o GLB business tem o nó `Rig` com scale 100), então converte pela escala do pai.
    const parent = pelvis.node.parent;
    const worldPerLocal = parent instanceof TransformNode ? parent.absoluteScaling.y : 1;
    pelvis.node.position.y = pelvis.restY + pose.bob / worldPerLocal;
  }
  apply('left-hip', -pose.leftHip);
  apply('right-hip', -pose.rightHip);
  apply('left-knee', pose.leftKnee);
  apply('right-knee', pose.rightKnee);
  apply('left-shoulder', -pose.leftShoulder);
  apply('right-shoulder', -pose.rightShoulder);
  apply('left-elbow', -pose.leftElbow);
  apply('right-elbow', -pose.rightElbow);
}

/** Devolve o quadril à altura de repouso (usado quando um clipe assume a pose). */
export function resetPelvis(drives: Partial<Record<Joint, JointDrive>>) {
  const pelvis = drives.pelvis;
  if (pelvis) pelvis.node.position.y = pelvis.restY;
}

/**
 * Tira a translação do quadril dos clipes. Os clipes do GLB trazem root motion (o quadril anda
 * dentro do avatar: até ~45 cm no clipe "Talking on Phone"), o que faz o corpo escorregar em
 * relação aos pés. Sai só a posição do quadril; as rotações dos clipes continuam.
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

/**
 * `instantiateModelsToScene` renomeia os grupos de animação com o prefixo "Clone of ", então o
 * nome do clipe original (o que `RIGS` guarda) é o nome sem esse prefixo.
 */
const CLONE_PREFIX = 'Clone of ';
function clipName(groupName: string): string {
  return groupName.startsWith(CLONE_PREFIX) ? groupName.slice(CLONE_PREFIX.length) : groupName;
}

/**
 * Escala e posiciona o `modelRoot` para a altura `targetHeight`, centrado no próprio `modelRoot` e
 * com os pés em y=0. As malhas são medidas com o `modelRoot` sem pai e sem transform próprio, então
 * a posição/rotação que o avatar tem no mundo NÃO desloca o modelo (bug do avatar saindo da tela).
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
  modelRoot.position.set(
    -((min.x + max.x) / 2) * scale,
    -min.y * scale,
    -((min.z + max.z) / 2) * scale,
  );
  modelRoot.parent = parent;
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
  // torno dos pés (`modelRoot.position` centraliza; escalar os dois mantém os pés em y=0).
  const baseScale = modelRoot.scaling.y;
  const basePosition = modelRoot.position.clone();

  // Materiais do GLB são compartilhados por todas as instâncias; a primeira troca de textura ou de cor clona o material
  // da malha só para este avatar (uma vez por malha: as trocas seguintes mexem no mesmo clone).
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
  const skinUrl = (config: AvatarConfig) =>
    SKIN_URL(model === 'goe-male' ? 'male' : 'female', config.skinTexture);
  const white = new Color3(1, 1, 1);
  const applyAppearance = (config: AvatarConfig) => {
    // Altura: escala a raiz inteira (corpo e peças, que são filhas dela) em torno dos pés.
    modelRoot.scaling.setAll(baseScale * config.height);
    modelRoot.position.copyFrom(basePosition.scale(config.height));
    // 3DX: um material só, provisório (cor de pele chapada). Atlas de pele/olhos e shape keys são do
    // GoE — o 3DX ainda não tem catálogo de texturas nem morphs (ver ADR 0016 / Fase F).
    if (!isGoeModel(model)) {
      const tint = skinTint(config);
      // A anatomia masculina é uma malha do próprio corpo 3DX (não um slot): some com calça ou cueca,
      // senão atravessa o tecido. `isVisible` não é tocado por `setConnected` (que usa `visibility`).
      const hideAnatomy = config.bottom !== 'none' || config.underwear !== 'none';
      for (const mesh of meshes) {
        if (/penis/i.test(mesh.name)) mesh.isVisible = !hideAnatomy;
        const material = ownMaterial(mesh);
        if (material) material.albedoColor = tint;
      }
      return;
    }
    applyMorphs(
      meshes,
      morphLibraryOf(container),
      effectiveMorphs(config),
      muscleBoosts(config.model),
      underClothes(config),
    );
    for (const mesh of meshes) {
      const material = ownMaterial(mesh);
      if (!material) continue;
      if (/eyes/i.test(mesh.name)) {
        material.albedoTexture = appearanceTexture(scene, EYES_URL(config.eyes));
      } else if (/eyebrow/i.test(mesh.name)) {
        // A sobrancelha segue a cor do cabelo (mais escura).
        material.albedoColor = eyebrowTint(colorHex(config.hairColor));
      } else if (/body|teeth|tongue/i.test(mesh.name)) {
        // Corpo, dentes e língua usam o atlas de pele; só o corpo leva o tom de pele escolhido.
        material.albedoTexture = appearanceTexture(scene, skinUrl(config));
        material.albedoColor = /body/i.test(mesh.name) ? skinTint(config) : white;
      }
    }
  };

  const rig = RIGS[model];
  const skeleton = pickRig(entries.skeletons, rig.joints.pelvis);
  const drives = bindJoints(skeleton, rig.joints, rig.axes, rig.base);
  if (drives.pelvis) stripRootMotion(entries.animationGroups, drives.pelvis.node);

  const rest = captureSkeletonRest(skeleton);
  // Mandíbula (GoE): a conversa abre a boca por aqui, já que os clipes da UAL não têm face.
  const jawNode = skeleton?.bones.find((bone) => bone.name === 'jawbone.x')?.getTransformNode();
  const jawRest = jawNode ? rest.get('jawbone.x')?.rotation : undefined;
  // Os decalques são um pedaço da pele: nascem da malha do corpo (a que tem "Body" no nome).
  const bodyMesh = meshes.find(
    (mesh): mesh is Mesh => mesh instanceof Mesh && /body/i.test(mesh.name),
  );
  const decals = createDecalLayer(scene, skeleton, bodyMesh);
  let presetActive = false;
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
      playing = next;
      next?.start(true, 1);
    }
    return next !== undefined;
  };

  return {
    meshCount: meshes.length,
    root: modelRoot,
    skeleton,
    applyMotion(pose, clip) {
      if (presetActive) return;
      if (!isGoeModel(model)) {
        // 3DX: sem pose procedural calibrada, o estado parado toca o idle nativo embutido no corpo.
        // As peças compartilham o esqueleto do corpo (ver `attachAvatarParts`), então deformam junto.
        playClip(clip ?? rig.clips?.idle);
        return;
      }
      if (playClip(clip)) {
        resetPelvis(drives);
        return;
      }
      poseBones(drives, pose);
    },
    applyAppearance,
    applyDecals(list) {
      decals.apply(list, connected);
    },
    setPosePreset(preset) {
      if (preset) {
        applyPresetToSkeleton(skeleton, preset);
        presetActive = true;
        return;
      }
      if (!presetActive) return;
      presetActive = false;
      restoreSkeletonRest(skeleton, rest);
    },
    setJaw(angle) {
      if (!jawNode || !jawRest) return;
      Quaternion.RotationAxisToRef(JAW_AXIS, angle, jawDelta);
      jawNode.rotationQuaternion = jawRest.multiply(jawDelta);
    },
    setConnected(value) {
      connected = value;
      for (const mesh of meshes) mesh.visibility = value ? 1 : 0.35;
      decals.setOpacity(value ? 1 : 0.35);
    },
    dispose() {
      playing?.stop();
      for (const mesh of meshes) shadows.removeShadowCaster(mesh);
      decals.dispose();
      for (const clone of ownMaterials.values()) clone.dispose();
      entries.dispose();
      modelRoot.dispose();
    },
  };
}
