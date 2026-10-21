import '../characters/gltf-loaders';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { Constants } from '@babylonjs/core/Engines/constants';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { maximizeTextureQuality } from '../characters/avatar-model';

/**
 * Balada (level 7 do 3DXChat), exportada de `scenes/club.unity` com texturas em
 * resolução nativa, normal maps e mapas de emissão.
 */
export const CLUB_URL = '/assets/3dx/rooms/club7/club7.glb';

/**
 * O GLB foi assado com o piso em y=0, mas o centro da sala não está na origem.
 * O `__root__` do loader glTF espelha a cena em X; com o deslocamento abaixo a
 * sala fica centrada em X/Z, no mesmo espaço do layout `CLUB`.
 */
export const CLUB_OFFSET_X = 3.5;
export const CLUB_OFFSET_Z = 16.88;

/** Teto do salão principal (o mezanino do fundo é mais baixo). */
export const CLUB_CEILING_HEIGHT = 4.5;

export interface ClubRoom {
  root: TransformNode;
  meshes: AbstractMesh[];
  dispose(): void;
}

/**
 * Carrega a balada como geometria estática. As texturas vêm do GLB em PNG
 * (resolução nativa) e os materiais PBR recebem espaço para todas as luzes da
 * casa, não só as quatro padrão.
 */
export async function loadClub(scene: Scene): Promise<ClubRoom> {
  const container: AssetContainer = await LoadAssetContainerAsync(CLUB_URL, scene, {
    pluginExtension: '.glb',
  });
  maximizeTextureQuality(container);
  for (const material of container.materials) {
    // 8 luzes da casa + hemisférica/chave do mundo; sem isso o PBR corta em 4.
    if (material instanceof PBRMaterial) material.maxSimultaneousLights = 12;
  }
  const entries: InstantiatedEntries = container.instantiateModelsToScene(undefined, false);
  const root = new TransformNode('club-room', scene);
  root.position.set(CLUB_OFFSET_X, 0, CLUB_OFFSET_Z);
  for (const node of entries.rootNodes) node.parent = root;
  const meshes = root.getChildMeshes(false).filter((mesh) => mesh.getTotalVertices() > 0);
  for (const mesh of meshes) {
    mesh.receiveShadows = true;
    mesh.isPickable = false;
  }
  return {
    root,
    meshes,
    dispose() {
      entries.dispose();
      root.dispose();
    },
  };
}

export interface ClubLighting {
  /** Liga/desliga a iluminação da balada sem recriar luzes. */
  setEnabled(enabled: boolean): void;
  /** Pulso lento das luzes coloridas da pista. */
  update(now: number): void;
  dispose(): void;
}

const DANCE_COLORS = [
  new Color3(0.1, 0.85, 1),
  new Color3(1, 0.15, 0.48),
  new Color3(0.78, 0.35, 1),
];

/**
 * Iluminação da balada: spots coloridos da pista (os mesmos três tons dos
 * soffits do cenário), ponto magenta no bar, spot branco na entrada e luz quente
 * no lounge do fundo. O glow usa os materiais emissivos do GLB (neon, bar,
 * letreiros e cortinas de luz).
 */
export function createClubLighting(scene: Scene): ClubLighting {
  const lights: Array<PointLight | SpotLight> = [];
  const dance: SpotLight[] = [];

  const spot = (
    name: string,
    position: Vector3,
    direction: Vector3,
    color: Color3,
    intensity: number,
    range: number,
    angle: number,
  ) => {
    const light = new SpotLight(name, position, direction, angle, 2, scene);
    light.diffuse = color;
    light.intensity = intensity;
    light.range = range;
    light.shadowEnabled = false;
    lights.push(light);
    return light;
  };

  const point = (
    name: string,
    position: Vector3,
    color: Color3,
    intensity: number,
    range: number,
  ) => {
    const light = new PointLight(name, position, scene);
    light.diffuse = color;
    light.intensity = intensity;
    light.range = range;
    light.shadowEnabled = false;
    lights.push(light);
    return light;
  };

  // Três colunas de luz sobre a pista (posições dos soffits do cenário, já
  // espelhadas junto com o GLB).
  const danceSpots: Array<[number, number]> = [
    [5.5, 1.7],
    [5.5, -2.1],
    [5.5, -5.9],
  ];
  danceSpots.forEach(([x, z], index) => {
    const light = spot(
      `club-dance-${index}`,
      // Abaixo do teto do salão (4,5 m): acima dele a luz não alcança o piso.
      new Vector3(x, 4.2, z),
      new Vector3(0, -1, 0.08),
      DANCE_COLORS[index]!,
      8,
      12,
      0.72,
    );
    dance.push(light);
  });

  // Bar principal (magenta), preenchimento quente do salão e luz fria da entrada.
  point('club-bar', new Vector3(-1.2, 2.6, -2.6), new Color3(1, 0.42, 0.82), 1.8, 8);
  point('club-hall', new Vector3(3.5, 3.4, 1.5), new Color3(1, 0.82, 0.68), 1.6, 14);
  spot(
    'club-entry',
    new Vector3(-0.8, 3.4, 12.5),
    new Vector3(0, -1, -0.45),
    new Color3(0.72, 0.9, 1),
    4,
    14,
    0.8,
  );

  // Lounge do fundo: luz quente sobre os sofás.
  spot(
    'club-lounge',
    new Vector3(3.2, 3.9, -15.6),
    new Vector3(0, -1, 0.2),
    new Color3(1, 0.78, 0.62),
    4,
    10,
    0.95,
  );

  // DJ: branco frontal, baixo, para destacar a cabine.
  spot(
    'club-dj',
    new Vector3(7.8, 2.2, -1.4),
    new Vector3(0.6, -0.2, 0),
    new Color3(1, 1, 1),
    3,
    7,
    0.7,
  );

  const glow = new GlowLayer('club-glow', scene, { blurKernelSize: 32 });
  glow.intensity = 0.45;
  glow.isEnabled = false;

  const environment = createEnvironment(scene);
  const previousEnvironment = scene.environmentTexture;
  let enabled = false;

  for (const light of lights) light.setEnabled(false);

  return {
    setEnabled(value) {
      if (enabled === value) return;
      enabled = value;
      for (const light of lights) light.setEnabled(value);
      glow.isEnabled = value;
      scene.environmentTexture = value && environment ? environment : previousEnvironment;
      scene.environmentIntensity = value ? 0.6 : 1;
    },
    update(now) {
      if (!enabled) return;
      dance.forEach((light, index) => {
        const phase = now * 0.0011 + index * 2.1;
        light.intensity = 8 + Math.sin(phase) * 1.8;
      });
    },
    dispose() {
      for (const light of lights) light.dispose();
      glow.dispose();
      environment?.dispose();
      scene.environmentTexture = previousEnvironment;
    },
  };
}

/**
 * Ambiente mínimo para os materiais metálicos (chrome, espelhos): um cubo com
 * teto quente e piso escuro, em vez de reflexos pretos sem HDR.
 */
function createEnvironment(scene: Scene): RawCubeTexture | undefined {
  const size = 16;
  const faces: Uint8Array[] = [];
  const sides = 6;
  for (let face = 0; face < sides; face++) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const t = y / (size - 1); // 0 = topo da face, 1 = base
      let r: number;
      let g: number;
      let b: number;
      if (face === 2) {
        r = 80;
        g = 58;
        b = 40; // teto quente
      } else if (face === 3) {
        r = 12;
        g = 9;
        b = 16; // piso escuro
      } else {
        const warm = 1 - Math.min(1, t * 1.4);
        r = 10 + 34 * warm;
        g = 8 + 26 * warm;
        b = 18 + 44 * warm;
      }
      for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }
    faces.push(data);
  }
  try {
    const texture = new RawCubeTexture(
      scene,
      faces,
      size,
      Constants.TEXTUREFORMAT_RGBA,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      true,
      false,
    );
    texture.gammaSpace = true;
    return texture;
  } catch {
    // NullEngine (testes) não tem contexto WebGL para texturas cruas.
    return undefined;
  }
}
