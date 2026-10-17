import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

/**
 * Pose estática exportada do GoE (ver `public/assets/goe/poses/goe-poses.json`). Cada item
 * guarda, por osso, a transformação local final `[x, y, z, qx, qy, qz, qw]` no rig de jogo.
 */
export interface PosePreset {
  /** Nome do osso → `[x, y, z, qx, qy, qz, qw]`. */
  bones: Record<string, readonly number[]>;
}

interface PoseFile {
  rig: string;
  poses: Record<string, Record<string, readonly number[]>>;
}

/**
 * As poses são do rig de controle, mas o transform local de cada osso depende das medidas do corpo (braço, dedos,
 * coluna): cada gênero tem o seu arquivo, amostrado no próprio rig (`tools/goe/export_poses_male.py`).
 */
export type PoseGender = 'male' | 'female';

const POSE_URLS: Record<PoseGender, string> = {
  female: '/assets/goe/poses/goe-poses.json',
  male: '/assets/goe/poses/goe-poses-male.json',
};

/** Gênero das poses de um modelo de avatar. */
export const poseGenderOf = (model: 'goe-male' | 'goe-female'): PoseGender =>
  model === 'goe-male' ? 'male' : 'female';

const caches = new Map<PoseGender, Promise<Map<string, PosePreset>>>();

/** Carrega as poses do gênero uma vez (o arquivo é global, não por cena). */
export function loadPosePresets(gender: PoseGender = 'female'): Promise<Map<string, PosePreset>> {
  let cache = caches.get(gender);
  if (!cache) {
    cache = fetchPosePresets(gender);
    caches.set(gender, cache);
  }
  return cache;
}

function fetchPosePresets(gender: PoseGender): Promise<Map<string, PosePreset>> {
  return fetch(POSE_URLS[gender])
    .then((response) => {
      if (!response.ok) throw new Error(`poses: HTTP ${response.status}`);
      return response.json() as Promise<PoseFile>;
    })
    .then((file) => {
      const presets = new Map<string, PosePreset>();
      for (const [name, bones] of Object.entries(file.poses)) presets.set(name, { bones });
      return presets;
    })
    .catch((error: unknown) => {
      caches.delete(gender);
      throw error;
    });
}

/** Transformação local de repouso de um esqueleto, para voltar à pose procedural depois do preset. */
export type SkeletonRest = Map<string, { position: Vector3; rotation: Quaternion }>;

export function captureSkeletonRest(skeleton: Skeleton | undefined): SkeletonRest {
  const rest: SkeletonRest = new Map();
  if (!skeleton) return rest;
  for (const bone of skeleton.bones) {
    const node = bone.getTransformNode();
    if (!node) continue;
    const rotation = node.rotationQuaternion
      ? node.rotationQuaternion.clone()
      : Quaternion.FromEulerAngles(node.rotation.x, node.rotation.y, node.rotation.z);
    rest.set(bone.name, { position: node.position.clone(), rotation });
  }
  return rest;
}

/** Devolve os ossos ao repouso original (o movimento procedural reaplica a marcação no quadro). */
export function restoreSkeletonRest(skeleton: Skeleton | undefined, rest: SkeletonRest): void {
  if (!skeleton) return;
  for (const bone of skeleton.bones) {
    const node = bone.getTransformNode();
    const original = node ? rest.get(bone.name) : undefined;
    if (!node || !original) continue;
    node.position.copyFrom(original.position);
    const rotation = original.rotation.clone();
    node.rotationQuaternion = rotation;
  }
}

/** Nós dos ossos por nome, por esqueleto (os clipes reescrevem a pose a cada quadro: sem busca linear). */
const nodesByBone = new WeakMap<Skeleton, Map<string, TransformNode>>();

function boneNodes(skeleton: Skeleton): Map<string, TransformNode> {
  let nodes = nodesByBone.get(skeleton);
  if (!nodes) {
    nodes = new Map();
    for (const bone of skeleton.bones) {
      const node = bone.getTransformNode();
      if (node && !nodes.has(bone.name)) nodes.set(bone.name, node);
    }
    nodesByBone.set(skeleton, nodes);
  }
  return nodes;
}

/** Escreve a pose presetada nos ossos presentes no preset (os demais ficam no repouso). */
export function applyPresetToSkeleton(skeleton: Skeleton | undefined, preset: PosePreset): void {
  if (!skeleton) return;
  const nodes = boneNodes(skeleton);
  for (const [name, value] of Object.entries(preset.bones)) {
    const node = nodes.get(name);
    if (!node) continue;
    node.position.set(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
    const x = value[3] ?? 0;
    const y = value[4] ?? 0;
    const z = value[5] ?? 0;
    const w = value[6] ?? 1;
    if (node.rotationQuaternion) node.rotationQuaternion.set(x, y, z, w);
    else node.rotationQuaternion = new Quaternion(x, y, z, w);
  }
}
