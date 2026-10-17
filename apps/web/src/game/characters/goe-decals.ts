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

/** Caminho da textura de um decalque na biblioteca (`public/assets/goe/decals`). */
const decalUrl = (choice: DecalChoice) =>
  `/assets/goe/decals/${choice.category}/${choice.image}.webp`;

/**
 * Onde cada slot de decalque é colado: osso do esqueleto + posição/rotação/escala no espaço local
 * do osso. Calculados por raycast na superfície do corpo em repouso (T-pose): o ponto e a normal
 * de cada região foram convertidos para o espaço do osso, então o plano assenta na pele com a
 * frente para fora e o topo para cima. Em pé os valores podem ser ajustados ao vivo por
 * `?testDecalAnchor` (ver "Diagnóstico" no guia de assets).
 */
export interface DecalAnchor {
  bone: string;
  position: [number, number, number];
  rotation: [number, number, number];
  size: number;
}

export const DECAL_ANCHORS: Record<DecalChoice['slot'], DecalAnchor> = {
  face: {
    bone: 'head.x',
    position: [0, 0.0721, 0.1189],
    rotation: [0.4866, 3.1416, 3.1416],
    size: 0.11,
  },
  neck: {
    bone: 'neck.x',
    position: [0, 0.0023, 0.0577],
    rotation: [0.1828, 3.1416, 3.1416],
    size: 0.08,
  },
  chest: {
    bone: 'spine_03.x',
    position: [0, -0.0545, 0.1271],
    rotation: [-0.0606, 3.1332, -3.1411],
    size: 0.22,
  },
  back: {
    bone: 'spine_03.x',
    position: [0, -0.0427, -0.0743],
    rotation: [-0.1179, -0.0001, 3.1416],
    size: 0.22,
  },
  armLeft: {
    bone: 'arm_stretch.l',
    position: [0.0508, 0.0021, 0.0012],
    rotation: [-0.036, -1.9892, 1.5696],
    size: 0.1,
  },
  armRight: {
    bone: 'arm_stretch.r',
    position: [-0.0508, 0.0021, 0.0012],
    rotation: [-0.036, 1.9892, -1.5696],
    size: 0.1,
  },
  thighLeft: {
    bone: 'thigh_stretch.l',
    position: [0.0559, 0.1217, -0.0148],
    rotation: [0.2136, -1.4095, 0.0404],
    size: 0.14,
  },
  thighRight: {
    bone: 'thigh_stretch.r',
    position: [-0.0559, 0.1217, -0.0148],
    rotation: [0.2135, 1.4095, -0.0404],
    size: 0.14,
  },
};

/**
 * O esqueleto GoE chega com espelhamento (a conversão glTF -> Babylon deixa um determinante
 * negativo nos ossos). Um plano filho de um osso espelhado fica com a textura invertida e virado
 * para dentro; inverter o Y local cancela isso, mantendo a frente para fora e o topo para cima.
 */
const DECAL_SCALE: readonly [number, number, number] = [1, -1, 1];

/** Texturas de decalque compartilhadas por cena. */
const decalTextures = new WeakMap<Scene, Map<string, Texture>>();

/**
 * Diagnóstico de calibração: `?testDecalAnchor=slot,px,py,pz,rx,ry,rz,size` sobrepõe a âncora de
 * um slot (pode repetir, uma por slot). Permite ajustar a posição ao vivo, sem rebuild.
 */
function parseAnchorOverrides(): Map<string, DecalAnchor> {
  const overrides = new Map<string, DecalAnchor>();
  if (typeof window === 'undefined') return overrides;
  for (const value of new URLSearchParams(window.location.search).getAll('testDecalAnchor')) {
    const parts = value.split(',');
    if (parts.length !== 8) continue;
    const [slot = '', ...rest] = parts;
    const [px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, size = 0] = rest.map((part) =>
      Number(part),
    );
    const numbers = [px, py, pz, rx, ry, rz, size];
    if (
      !DECAL_ANCHORS[slot as DecalChoice['slot']] ||
      numbers.some((number) => Number.isNaN(number))
    ) {
      continue;
    }
    overrides.set(slot, {
      bone: DECAL_ANCHORS[slot as DecalChoice['slot']].bone,
      position: [px, py, pz],
      rotation: [rx, ry, rz],
      size,
    });
  }
  return overrides;
}

let anchorOverrides: Map<string, DecalAnchor> | undefined;

const anchorFor = (slot: DecalChoice['slot']): DecalAnchor => {
  anchorOverrides ??= parseAnchorOverrides();
  return anchorOverrides.get(slot) ?? DECAL_ANCHORS[slot];
};

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
 * Decalque que acompanha a curvatura: um pedaço da própria malha do corpo (os triângulos dentro da caixa da âncora, com
 * UV por projeção planar e os mesmos pesos de pele), levemente acima da pele. Deforma com a pose como o corpo. Devolve
 * `undefined` se a âncora não cair sobre o corpo (aí quem chama usa o plano reto).
 */
function conformingDecal(
  scene: Scene,
  name: string,
  body: Mesh,
  node: TransformNode,
  anchor: DecalAnchor,
): Mesh | undefined {
  const skeleton = body.skeleton;
  const positions = body.getVerticesData(VertexBuffer.PositionKind);
  const normals = body.getVerticesData(VertexBuffer.NormalKind);
  const indices = body.getIndices();
  const joints = body.getVerticesData(VertexBuffer.MatricesIndicesKind);
  const weights = body.getVerticesData(VertexBuffer.MatricesWeightsKind);
  if (!skeleton || !positions || !normals || !indices || !joints || !weights) return undefined;

  // A pose atual do corpo no espaço da malha, para casar com a âncora (presa ao osso) sem depender de onde o avatar está.
  skeleton.prepare(true);
  const matrices = skeleton.getTransformMatrices(body);
  const posed = skinVertices(positions, joints, weights, matrices, 4);
  const posedNormals = skinVertices(normals, joints, weights, matrices, 4, true);

  refreshWorld(node);
  body.computeWorldMatrix(true);
  const plane = Matrix.Compose(
    new Vector3(...DECAL_SCALE),
    Quaternion.FromEulerAngles(...anchor.rotation),
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
  if (!patch) return undefined;

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
  // Mesma transformação do corpo: a malha com pele é desenhada pelos ossos, mas a matriz do próprio nó conta.
  mesh.parent = body.parent;
  mesh.position.copyFrom(body.position);
  mesh.rotationQuaternion = body.rotationQuaternion?.clone() ?? null;
  mesh.rotation.copyFrom(body.rotation);
  mesh.scaling.copyFrom(body.scaling);
  // O volume da malha com pele muda com a pose: não deixa o decalque sumir quando a caixa original sai da tela.
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

/**
 * Decalques sobre o corpo, no formato da pele (ver `conformingDecal`). Sem a malha do corpo, ou com a âncora fora dela,
 * cai para um plano translúcido preso ao osso (segue a pose, mas é reto). Ver `DECAL_SLOTS`/`DECAL_CATEGORIES`.
 */
export function createDecalLayer(
  scene: Scene,
  skeleton: Skeleton | undefined,
  body?: Mesh,
): DecalLayer {
  const meshes: AbstractMesh[] = [];

  const clear = () => {
    for (const mesh of meshes) mesh.dispose();
    meshes.length = 0;
  };

  return {
    meshes,
    apply(decals, connected) {
      clear();
      for (const choice of decals) {
        const anchor = anchorFor(choice.slot);
        const node: TransformNode | undefined =
          skeleton?.bones.find((bone) => bone.name === anchor.bone)?.getTransformNode() ??
          undefined;
        if (!node) continue;
        const name = `decal-${choice.slot}-${choice.image}`;
        const fitted = body ? conformingDecal(scene, name, body, node, anchor) : undefined;
        const plane = fitted ?? MeshBuilder.CreatePlane(name, { size: anchor.size }, scene);
        if (!fitted) {
          plane.parent = node;
          plane.position.set(...anchor.position);
          plane.rotationQuaternion = Quaternion.FromEulerAngles(...anchor.rotation);
          plane.scaling.set(...DECAL_SCALE);
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
        // O recorte da pele fica colado no corpo: um empurrão na profundidade evita o chuvisco de pele e tinta.
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
