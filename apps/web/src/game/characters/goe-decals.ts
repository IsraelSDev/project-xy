import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { DecalChoice } from '@3dx/contracts';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Scene } from '@babylonjs/core/scene';

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

/**
 * Decalques por cima do corpo: um plano translúcido preso ao osso da região (segue a pose, embora
 * não se deforme com a pele). Ver `DECAL_SLOTS`/`DECAL_CATEGORIES`.
 */
export function createDecalLayer(scene: Scene, skeleton: Skeleton | undefined): DecalLayer {
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
        const plane = MeshBuilder.CreatePlane(
          `decal-${choice.slot}-${choice.image}`,
          { size: anchor.size },
          scene,
        );
        plane.parent = node;
        plane.position.set(...anchor.position);
        plane.rotationQuaternion = Quaternion.FromEulerAngles(...anchor.rotation);
        plane.scaling.set(...DECAL_SCALE);
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
