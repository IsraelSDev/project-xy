import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { Pose } from '../animation/walk-cycle';
import type { Vec2 } from '@3dx/game-core';

/** Altura do quadril em relação ao piso (m). */
const HIP_HEIGHT = 0.95;
/** Altura do ponto que a câmera acompanha (m). */
export const MANNEQUIN_FOCUS_HEIGHT = 1.45;

export interface Mannequin {
  root: TransformNode;
  meshes: Mesh[];
  place(position: Vec2, heading: number): void;
  applyPose(pose: Pose): void;
}

/**
 * Manequim humanoide genérico montado com primitivas (PLACEHOLDER, sem asset licenciado).
 * Hierarquia de pivôs nas articulações, para a pose procedural girar membros inteiros.
 * Frente do corpo = +Z local.
 */
export function createMannequin(scene: Scene): Mannequin {
  const material = new StandardMaterial('placeholder-mannequin-material', scene);
  material.diffuseColor = new Color3(0.78, 0.76, 0.74);
  material.specularColor = new Color3(0.15, 0.15, 0.15);

  const meshes: Mesh[] = [];
  const root = new TransformNode('placeholder-mannequin', scene);
  const pelvis = pivot('pelvis', root, new Vector3(0, HIP_HEIGHT, 0));

  const part = (mesh: Mesh, parent: TransformNode, position: Vector3) => {
    mesh.material = material;
    mesh.parent = parent;
    mesh.position = position;
    meshes.push(mesh);
    return mesh;
  };
  function pivot(name: string, parent: TransformNode, position: Vector3) {
    const node = new TransformNode(`placeholder-mannequin-${name}`, scene);
    node.parent = parent;
    node.position = position;
    return node;
  }
  const capsule = (name: string, height: number, radius: number) =>
    CreateCapsule(`placeholder-mannequin-${name}`, { height, radius, tessellation: 12 }, scene);

  // Tronco e cabeça
  part(capsule('torso', 0.62, 0.17), pelvis, new Vector3(0, 0.27, 0));
  part(capsule('neck', 0.14, 0.05), pelvis, new Vector3(0, 0.6, 0));
  const head = part(
    CreateSphere('placeholder-mannequin-head', { diameter: 0.24, segments: 16 }, scene),
    pelvis,
    new Vector3(0, 0.75, 0),
  );
  head.scaling = new Vector3(0.9, 1.1, 1);

  // Pernas: quadril -> coxa -> joelho -> canela -> pé
  const leg = (side: 1 | -1, name: string) => {
    const hip = pivot(`${name}-hip`, pelvis, new Vector3(0.1 * side, 0, 0));
    part(capsule(`${name}-thigh`, 0.47, 0.075), hip, new Vector3(0, -0.225, 0));
    const knee = pivot(`${name}-knee`, hip, new Vector3(0, -0.45, 0));
    part(capsule(`${name}-shin`, 0.47, 0.06), knee, new Vector3(0, -0.225, 0));
    const foot = part(
      CreateBox(
        `placeholder-mannequin-${name}-foot`,
        { width: 0.1, height: 0.06, depth: 0.24 },
        scene,
      ),
      knee,
      new Vector3(0, -0.47, 0.05),
    );
    foot.receiveShadows = true;
    return { hip, knee };
  };
  const leftLeg = leg(-1, 'left');
  const rightLeg = leg(1, 'right');

  // Braços: ombro -> braço -> cotovelo -> antebraço -> mão
  const arm = (side: 1 | -1, name: string) => {
    const shoulder = pivot(`${name}-shoulder`, pelvis, new Vector3(0.22 * side, 0.49, 0));
    part(capsule(`${name}-upper-arm`, 0.3, 0.05), shoulder, new Vector3(0, -0.14, 0));
    const elbow = pivot(`${name}-elbow`, shoulder, new Vector3(0, -0.28, 0));
    part(capsule(`${name}-forearm`, 0.28, 0.045), elbow, new Vector3(0, -0.13, 0));
    part(
      CreateSphere(`placeholder-mannequin-${name}-hand`, { diameter: 0.09, segments: 8 }, scene),
      elbow,
      new Vector3(0, -0.29, 0),
    );
    return { shoulder, elbow };
  };
  const leftArm = arm(-1, 'left');
  const rightArm = arm(1, 'right');

  return {
    root,
    meshes,
    place(position, heading) {
      root.position.set(position.x, 0, position.z);
      root.rotation.y = heading;
    },
    applyPose(pose) {
      pelvis.position.y = HIP_HEIGHT + pose.bob;
      // Em Babylon, rotação positiva em X leva um membro pendurado para trás (-Z);
      // a pose usa positivo = à frente, por isso os sinais invertidos.
      leftLeg.hip.rotation.x = -pose.leftHip;
      rightLeg.hip.rotation.x = -pose.rightHip;
      leftLeg.knee.rotation.x = pose.leftKnee;
      rightLeg.knee.rotation.x = pose.rightKnee;
      leftArm.shoulder.rotation.x = -pose.leftShoulder;
      rightArm.shoulder.rotation.x = -pose.rightShoulder;
      leftArm.elbow.rotation.x = -pose.elbow;
      rightArm.elbow.rotation.x = -pose.elbow;
    },
  };
}
