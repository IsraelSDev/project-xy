import '@babylonjs/loaders/glTF';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { AvatarConfig, PlayerAction } from '@3dx/contracts';
import type { Pose } from '../animation/walk-cycle';
import type { Joint } from './mannequin';

type AvatarModel = AvatarConfig['model'];

/** Altura alvo de qualquer modelo (m). */
const MODEL_HEIGHT = 1.7;

const MODEL_FILES: Record<AvatarModel, string> = {
  creative: '/test-assets/Body_010.glb',
  feminine: '/test-assets/girl_in_yellow_animated.glb',
  masculine: '/test-assets/business_man_low_polygon_game_character.glb',
  // Universal Base Characters (Quaternius, CC0). GLB autocontido com as texturas embutidas.
  'superhero-female': '/models/superhero/Superhero_Female_FullBody.glb',
  'superhero-male': '/models/superhero/Superhero_Male_FullBody.glb',
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

interface Rig {
  /** Osso do GLB para cada articulação da convenção (ADR 0006). */
  joints: Record<Joint, string>;
  /**
   * Eixo local de flexão por articulação. O padrão (`x`) vale para o corpo creative e o manequim;
   * rigs com orientação de osso diferente (ex.: Unreal, dos Superhero) precisam de outro eixo/sinal,
   * senão os braços giram para o lado errado.
   */
  axes?: Partial<Record<Joint, PoseAxis>>;
  /** Nomes exatos dos clipes embutidos. Sem `clips` = só pose procedural. */
  clips?: { idle: string; walk: string; sit?: string };
}

/**
 * Ossos do corpo 'creative' (Body_010.glb) pela convenção de articulações. As peças da
 * biblioteca usam o MESMO esqueleto (44 ossos, mesma ordem), então reaproveitam este mapa.
 */
export const CREATIVE_JOINTS: Record<Joint, string> = {
  pelvis: 'Hips',
  head: 'Head',
  'left-hip': 'LeftUpLeg',
  'left-knee': 'LeftLeg',
  'right-hip': 'RightUpLeg',
  'right-knee': 'RightLeg',
  'left-shoulder': 'LeftArm',
  'left-elbow': 'LeftForeArm',
  'right-shoulder': 'RightArm',
  'right-elbow': 'RightForeArm',
};

/** Ossos no padrão Unreal Engine dos 'Universal Base Characters' (Superhero M/F). */
export const SUPERHERO_JOINTS: Record<Joint, string> = {
  pelvis: 'pelvis',
  head: 'Head',
  'left-hip': 'thigh_l',
  'left-knee': 'calf_l',
  'right-hip': 'thigh_r',
  'right-knee': 'calf_r',
  'left-shoulder': 'upperarm_l',
  'left-elbow': 'lowerarm_l',
  'right-shoulder': 'upperarm_r',
  'right-elbow': 'lowerarm_r',
};

/**
 * Ossos UE giram a flexão ao contrário do creative: quadris e joelhos já caem no eixo X padrão, mas
 * os braços (ombro/cotovelo) precisam do eixo X invertido para irem à frente do corpo. Medido in-loco
 * girando cada osso e observando o deslocamento do filho (ver `superhero-model.test.ts`).
 */
export const SUPERHERO_POSE_AXES: Partial<Record<Joint, PoseAxis>> = {
  'left-shoulder': '-x',
  'left-elbow': '-x',
  'right-shoulder': '-x',
  'right-elbow': '-x',
};

const RIGS: Record<AvatarModel, Rig> = {
  // Body_010.glb (corpo base da biblioteca; mesmo esqueleto das peças; sem animações).
  creative: { joints: CREATIVE_JOINTS },
  // girl_in_yellow_animated.glb (Mixamo)
  feminine: {
    joints: {
      pelvis: 'mixamorig:Hips_64',
      head: 'mixamorig:Head_1',
      'left-hip': 'mixamorig:LeftUpLeg_58',
      'left-knee': 'mixamorig:LeftLeg_57',
      'right-hip': 'mixamorig:RightUpLeg_63',
      'right-knee': 'mixamorig:RightLeg_62',
      'left-shoulder': 'mixamorig:LeftArm_25',
      'left-elbow': 'mixamorig:LeftForeArm_24',
      'right-shoulder': 'mixamorig:RightArm_49',
      'right-elbow': 'mixamorig:RightForeArm_48',
    },
    clips: { idle: 'Idle', walk: 'Walking' },
  },
  // business_man_low_polygon_game_character.glb
  masculine: {
    joints: {
      pelvis: 'Hips_01',
      head: 'Head_06',
      'left-hip': 'Upper_Leg_L_063',
      'left-knee': 'Lower_Leg_L_064',
      'right-hip': 'Upper_Leg_R_067',
      'right-knee': 'Lower_Leg_R_068',
      'left-shoulder': 'Upper_Arm_L_027',
      'left-elbow': 'Lower_Arm_L_028',
      'right-shoulder': 'Upper_Arm_R_046',
      'right-elbow': 'Lower_Arm_R_047',
    },
    clips: { idle: 'Rig|idle', walk: 'Rig|walk', sit: 'Rig|sitting_idle' },
  },
  'superhero-female': { joints: SUPERHERO_JOINTS, axes: SUPERHERO_POSE_AXES },
  'superhero-male': { joints: SUPERHERO_JOINTS, axes: SUPERHERO_POSE_AXES },
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
   * convenção de sinais do manequim). Clipe ausente no modelo cai na pose.
   */
  applyMotion(pose: Pose, clip: string | undefined): void;
  /** Desconectado (aguardando reconexão) fica translúcido, como o placeholder. */
  setConnected(connected: boolean): void;
  dispose(): void;
}

// Cada modelo carrega uma vez por cena; cada avatar recebe um clone (esqueleto e clipes próprios,
// materiais compartilhados). Erro de carga é esquecido para poder tentar de novo.
const containers = new WeakMap<Scene, Map<AvatarModel, Promise<AssetContainer>>>();

function loadContainer(scene: Scene, model: AvatarModel): Promise<AssetContainer> {
  const byModel = containers.get(scene) ?? new Map<AvatarModel, Promise<AssetContainer>>();
  containers.set(scene, byModel);
  const cached = byModel.get(model);
  if (cached) return cached;
  const url = MODEL_FILES[model];
  const loading = LoadAssetContainerAsync(url, scene, {
    pluginExtension: url.endsWith('.gltf') ? '.gltf' : '.glb',
  }).catch((error: unknown) => {
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
    drives[joint] = {
      node,
      rest,
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
  /** Rotação escrita a cada quadro (mesma instância de `node.rotationQuaternion`). */
  current: Quaternion;
  /** Altura de repouso (só o quadril usa, para o balanço vertical). */
  restY: number;
  /** Eixo local em que a pose gira a articulação (ver `Rig.axes`). */
  axis: Vector3;
}

/** Rotação temporária do eixo X (aplicações de pose não são reentrantes). */
const axisDelta = new Quaternion();

/** Aplica a mesma convenção de sinais de `Mannequin.applyPose` nos ossos mapeados. */
export function poseBones(drives: Partial<Record<Joint, JointDrive>>, pose: Pose) {
  const apply = (joint: Joint, angle: number) => {
    const bone = drives[joint];
    if (!bone) return;
    Quaternion.RotationAxisToRef(bone.axis, angle, axisDelta);
    bone.rest.multiplyToRef(axisDelta, bone.current);
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

  const rig = RIGS[model];
  const skeleton = pickRig(entries.skeletons, rig.joints.pelvis);
  const drives = bindJoints(skeleton, rig.joints, rig.axes);
  if (drives.pelvis) stripRootMotion(entries.animationGroups, drives.pelvis.node);

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
      if (playClip(clip)) {
        resetPelvis(drives);
        return;
      }
      poseBones(drives, pose);
    },
    setConnected(connected) {
      for (const mesh of meshes) mesh.visibility = connected ? 1 : 0.35;
    },
    dispose() {
      playing?.stop();
      for (const mesh of meshes) shadows.removeShadowCaster(mesh);
      entries.dispose();
      modelRoot.dispose();
    },
  };
}
