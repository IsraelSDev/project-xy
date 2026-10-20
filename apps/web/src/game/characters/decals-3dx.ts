import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { DecalChoice } from '@3dx/contracts';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { selectDecalPatch, skinVertices } from './decal-projection';

/** Caminho da textura de um decalque 3DX (`public/assets/3dx/decals`). */
const decalUrl = (choice: DecalChoice) =>
  `/assets/3dx/decals/${choice.category}/${choice.image}.webp`;

/**
 * Onde cada slot é colado no corpo 3DX: osso do GLB (`bN`) + posição/quaternion no espaço local do
 * osso. Calibrado por raycast na superfície do corpo em repouso; o plano assenta na pele com a
 * frente para fora e o topo para cima. O corpo 3DX não tem espelhamento, então a escala é
 * `(1, 1, 1)`.
 */
export interface DecalAnchor {
  bone: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  size: number;
}

export const DECAL_ANCHORS_3DX_MALE: Record<DecalChoice['slot'], DecalAnchor> = {
  face: {
    bone: 'b148',
    position: [-0.118788, 0.169176, -0.000001],
    quaternion: [-0.446782, -0.548075, -0.446784, 0.548073],
    size: 0.11,
  },
  neck: {
    bone: 'b144',
    position: [-0.031972, 0.129788, 0.0],
    quaternion: [-0.437784, -0.555288, -0.437786, 0.555287],
    size: 0.08,
  },
  chest: {
    bone: 'b81',
    position: [0.01913, 0.115226, 0.0],
    quaternion: [0.552871, 0.440833, 0.552871, -0.440833],
    size: 0.22,
  },
  back: {
    bone: 'b81',
    position: [-0.032741, -0.111885, 0.0],
    quaternion: [-0.552871, -0.440833, 0.552871, -0.440833],
    size: 0.22,
  },
  armLeft: {
    bone: 'b90',
    position: [-0.102329, -0.029578, -0.031506],
    quaternion: [-0.186066, -0.299672, 0.603769, 0.71487],
    size: 0.1,
  },
  armRight: {
    bone: 'b269',
    position: [-0.107586, -0.030349, 0.025463],
    quaternion: [-0.603771, 0.714868, 0.186069, -0.299672],
    size: 0.1,
  },
  thighLeft: {
    bone: 'b23',
    position: [-0.123422, 0.122383, 0.00167],
    quaternion: [-0.470175, 0.530546, 0.533325, 0.461542],
    size: 0.14,
  },
  thighRight: {
    bone: 'b49',
    position: [-0.123225, 0.105546, -0.00175],
    quaternion: [-0.533314, 0.461551, 0.470189, 0.530537],
    size: 0.14,
  },
};

export const DECAL_ANCHORS_3DX_FEMALE: Record<DecalChoice['slot'], DecalAnchor> = {
  face: {
    bone: 'b156',
    position: [-0.092372, 0.1621, -0.000001],
    quaternion: [-0.446782, -0.548075, -0.446784, 0.548073],
    size: 0.11,
  },
  neck: {
    bone: 'b325',
    position: [-0.028743, 0.11938, 0.0],
    quaternion: [-0.437784, -0.555288, -0.437786, 0.555287],
    size: 0.08,
  },
  chest: {
    bone: 'b421',
    position: [0.013564, 0.099865, 0.0],
    quaternion: [0.552871, 0.440833, 0.552871, -0.440833],
    size: 0.22,
  },
  back: {
    bone: 'b421',
    position: [-0.024531, -0.104118, 0.0],
    quaternion: [-0.552871, -0.440833, 0.552871, -0.440833],
    size: 0.22,
  },
  armLeft: {
    bone: 'b78',
    position: [-0.076822, -0.02844, -0.027588],
    quaternion: [-0.186066, -0.299672, 0.603769, 0.71487],
    size: 0.1,
  },
  armRight: {
    bone: 'b332',
    position: [-0.083776, -0.02884, 0.02268],
    quaternion: [-0.603771, 0.714868, 0.186069, -0.299672],
    size: 0.1,
  },
  thighLeft: {
    bone: 'b3',
    position: [-0.112523, 0.113308, 0.001669],
    quaternion: [-0.470175, 0.530546, 0.533325, 0.461542],
    size: 0.14,
  },
  thighRight: {
    bone: 'b39',
    position: [-0.112226, 0.096106, -0.00175],
    quaternion: [-0.533314, 0.461551, 0.470189, 0.530537],
    size: 0.14,
  },
};

const DECAL_SCALE_3DX: readonly [number, number, number] = [1, 1, 1];

/** Texturas de decalque compartilhadas por cena. */
const decalTextures = new WeakMap<Scene, Map<string, Texture>>();

const anchorQuaternion = (anchor: DecalAnchor): Quaternion =>
  new Quaternion(
    anchor.quaternion[0],
    anchor.quaternion[1],
    anchor.quaternion[2],
    anchor.quaternion[3],
  );

function decalTexture(scene: Scene, url: string): Texture {
  const byUrl = decalTextures.get(scene) ?? new Map<string, Texture>();
  decalTextures.set(scene, byUrl);
  let texture = byUrl.get(url);
  if (!texture) {
    texture = new Texture(url, scene);
    byUrl.set(url, texture);
  }
  return texture;
}

export interface DecalLayer {
  /** Recoloca os decalques conforme a aparência. */
  apply(decals: readonly DecalChoice[], connected: boolean): void;
  /** Opacidade global (translúcido quando o avatar está desconectado). */
  setOpacity(opacity: number): void;
  readonly meshes: readonly AbstractMesh[];
  dispose(): void;
}

/** Quanto o decalque sobe da pele, ao longo da normal (m), para não brigar por profundidade com o corpo. */
const SURFACE_LIFT = 0.0004;

/** Recalcula a matriz de mundo do nó e de todos os pais, de cima para baixo (o cache pode estar de um quadro atrás). */
function refreshWorld(node: TransformNode) {
  const chain: TransformNode[] = [];
  for (
    let at: TransformNode | null = node;
    at;
    at = at.parent instanceof TransformNode ? at.parent : null
  ) {
    chain.unshift(at);
  }
  for (const link of chain) link.computeWorldMatrix(true);
}

/**
 * Decalque que acompanha a curvatura: um pedaço da própria malha do corpo (os triângulos dentro da
 * caixa da âncora, com UV por projeção planar e os mesmos pesos de pele), levemente acima da pele.
 * Tenta cada malha candidata (corpo e cabeça) e usa a primeira em que a âncora cai.
 */
function conformingDecal(
  scene: Scene,
  name: string,
  bodies: readonly Mesh[],
  node: TransformNode,
  anchor: DecalAnchor,
): Mesh | undefined {
  for (const body of bodies) {
    const skeleton = body.skeleton;
    const positions = body.getVerticesData(VertexBuffer.PositionKind);
    const normals = body.getVerticesData(VertexBuffer.NormalKind);
    const indices = body.getIndices();
    const joints = body.getVerticesData(VertexBuffer.MatricesIndicesKind);
    const weights = body.getVerticesData(VertexBuffer.MatricesWeightsKind);
    if (!skeleton || !positions || !normals || !indices || !joints || !weights) continue;

    // A pose atual do corpo no espaço da malha, para casar com a âncora (presa ao osso).
    skeleton.prepare(true);
    const matrices = skeleton.getTransformMatrices(body);
    const posed = skinVertices(positions, joints, weights, matrices, 4);
    const posedNormals = skinVertices(normals, joints, weights, matrices, 4, true);

    refreshWorld(node);
    body.computeWorldMatrix(true);
    const plane = Matrix.Compose(
      new Vector3(...DECAL_SCALE_3DX),
      anchorQuaternion(anchor),
      new Vector3(...anchor.position),
    )
      .multiply(node.getWorldMatrix())
      .multiply(Matrix.Invert(body.getWorldMatrix()));
    const axis = (x: number, y: number, z: number): [number, number, number] => {
      const v = Vector3.TransformNormal(new Vector3(x, y, z), plane);
      return [v.x, v.y, v.z];
    };
    const origin = Vector3.TransformCoordinates(Vector3.Zero(), plane);
    const patch = selectDecalPatch(posed, posedNormals, indices, {
      origin: [origin.x, origin.y, origin.z],
      x: axis(1, 0, 0),
      y: axis(0, 1, 0),
      z: axis(0, 0, 1),
      size: anchor.size,
    });
    if (!patch) continue;

    const count = patch.vertices.length;
    const data = new VertexData();
    const outPositions = new Float32Array(count * 3);
    const outNormals = new Float32Array(count * 3);
    const outJoints = new Float32Array(count * 4);
    const outWeights = new Float32Array(count * 4);
    const extraJoints = body.getVerticesData(VertexBuffer.MatricesIndicesExtraKind);
    const extraWeights = body.getVerticesData(VertexBuffer.MatricesWeightsExtraKind);
    const outExtraJoints = extraJoints && extraWeights ? new Float32Array(count * 4) : undefined;
    const outExtraWeights = extraJoints && extraWeights ? new Float32Array(count * 4) : undefined;
    patch.vertices.forEach((source, vertex) => {
      for (let component = 0; component < 3; component++) {
        const normal = normals[source * 3 + component]!;
        outNormals[vertex * 3 + component] = normal;
        outPositions[vertex * 3 + component] =
          positions[source * 3 + component]! + normal * SURFACE_LIFT;
      }
      for (let slot = 0; slot < 4; slot++) {
        outJoints[vertex * 4 + slot] = joints[source * 4 + slot]!;
        outWeights[vertex * 4 + slot] = weights[source * 4 + slot]!;
        if (outExtraJoints && outExtraWeights && extraJoints && extraWeights) {
          outExtraJoints[vertex * 4 + slot] = extraJoints[source * 4 + slot]!;
          outExtraWeights[vertex * 4 + slot] = extraWeights[source * 4 + slot]!;
        }
      }
    });
    data.positions = outPositions;
    data.normals = outNormals;
    data.matricesIndices = outJoints;
    data.matricesWeights = outWeights;
    if (outExtraJoints && outExtraWeights) {
      data.matricesIndicesExtra = outExtraJoints;
      data.matricesWeightsExtra = outExtraWeights;
    }
    data.uvs = patch.uvs;
    data.indices = patch.triangles;

    const mesh = new Mesh(name, scene);
    data.applyToMesh(mesh);
    mesh.skeleton = skeleton;
    mesh.numBoneInfluencers = body.numBoneInfluencers;
    mesh.parent = body.parent;
    mesh.position.copyFrom(body.position);
    mesh.rotationQuaternion = body.rotationQuaternion?.clone() ?? null;
    mesh.rotation.copyFrom(body.rotation);
    mesh.scaling.copyFrom(body.scaling);
    mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  }
  return undefined;
}

/**
 * Decalques 3DX sobre o corpo: pedaços da pele com a textura projetada, presos ao esqueleto do
 * corpo. Sem a malha do corpo, ou com a âncora fora dela, cai para um plano preso ao osso.
 */
export function createDecalLayer(
  scene: Scene,
  skeleton: Skeleton | undefined,
  body?: Mesh | readonly Mesh[],
  anchors: Record<DecalChoice['slot'], DecalAnchor> = DECAL_ANCHORS_3DX_MALE,
): DecalLayer {
  const meshes: AbstractMesh[] = [];
  const bodies = body ? (Array.isArray(body) ? body : [body]) : [];

  const clear = () => {
    for (const mesh of meshes) mesh.dispose();
    meshes.length = 0;
  };

  return {
    meshes,
    apply(decals, connected) {
      clear();
      for (const choice of decals) {
        const anchor = anchors[choice.slot];
        if (!anchor) continue;
        const node = skeleton?.bones.find((bone) => bone.name === anchor.bone)?.getTransformNode();
        if (!node) continue;
        const name = `decal-${choice.slot}-${choice.image}`;
        const fitted = conformingDecal(scene, name, bodies, node, anchor);
        const plane = fitted ?? MeshBuilder.CreatePlane(name, { size: anchor.size }, scene);
        if (!fitted) {
          plane.parent = node;
          plane.position.set(...anchor.position);
          plane.rotationQuaternion = anchorQuaternion(anchor);
        }
        plane.isPickable = false;
        plane.visibility = connected ? 1 : 0.35;
        plane.receiveShadows = false;
        const material = new PBRMaterial(`decal-mat-${choice.slot}-${choice.image}`, scene);
        const texture = decalTexture(scene, decalUrl(choice));
        texture.hasAlpha = true;
        material.albedoTexture = texture;
        material.useAlphaFromAlbedoTexture = true;
        material.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
        material.backFaceCulling = false;
        material.metallic = 0;
        material.roughness = 1;
        material.zOffset = -2;
        material.zOffsetUnits = -2;
        plane.material = material;
        meshes.push(plane);
      }
    },
    setOpacity(opacity) {
      for (const mesh of meshes) mesh.visibility = opacity;
    },
    dispose() {
      clear();
    },
  };
}
