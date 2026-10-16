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

const POSE_URL = '/assets/goe/poses/goe-poses.json';

let cache: Promise<Map<string, PosePreset>> | undefined;

/** Carrega as poses uma vez (o arquivo é global, não por cena). */
export function loadPosePresets(): Promise<Map<string, PosePreset>> {
  cache ??= fetch(POSE_URL)
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
      cache = undefined;
      throw error;
    });
  return cache;
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

/** Escreve a pose presetada nos ossos presentes no preset (os demais ficam no repouso). */
export function applyPresetToSkeleton(skeleton: Skeleton | undefined, preset: PosePreset): void {
  if (!skeleton) return;
  for (const [name, value] of Object.entries(preset.bones)) {
    const node: TransformNode | undefined =
      skeleton.bones.find((bone) => bone.name === name)?.getTransformNode() ?? undefined;
    if (!node) continue;
    node.position.set(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
    node.rotationQuaternion = new Quaternion(
      value[3] ?? 0,
      value[4] ?? 0,
      value[5] ?? 0,
      value[6] ?? 1,
    );
  }
}
