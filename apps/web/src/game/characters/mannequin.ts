import { colorHex, type AvatarConfig } from '@3dx/contracts';
import type { Vec2 } from '@3dx/game-core';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { Pose } from '../animation/walk-cycle';

/** Altura do quadril em relação ao piso (m). */
const HIP_HEIGHT = 0.95;
/** Altura do ponto que a câmera acompanha (m). */
export const MANNEQUIN_FOCUS_HEIGHT = 1.45;

/**
 * Convenção de esqueleto (ADR 0006). Um modelo licenciado com rig precisa expor articulações com
 * estes nomes (ou um mapeamento para eles) para reaproveitar poses, animações e encaixes.
 * Frente do corpo = +Z local; Y para cima; metros.
 */
export const MANNEQUIN_JOINTS = [
  'pelvis',
  'head',
  'left-hip',
  'left-knee',
  'right-hip',
  'right-knee',
  'left-shoulder',
  'left-elbow',
  'right-shoulder',
  'right-elbow',
] as const;
export type Joint = (typeof MANNEQUIN_JOINTS)[number];

/** Escala fixa do corpo do placeholder (o 3DX não tem tipos de corpo morfológicos). */
const BODY_SCALE = { torso: 1, limbs: 1 };

/**
 * Só as partes grandes projetam sombra: mãos, pescoço, pés e acessórios quase não aparecem na
 * sombra e cada caster é mais uma chamada de desenho na passada do mapa de sombras.
 */
const SHADOW_PARTS = new Set([
  'torso',
  'skull',
  'left-thigh',
  'right-thigh',
  'left-shin',
  'right-shin',
  'left-upper-arm',
  'right-upper-arm',
  'hair',
  'skirt',
]);

const SHOES_HEX = '#26262b';
const GLASSES_HEX = '#15151a';
const GOLD_HEX = '#d4af37';

/**
 * Materiais compartilhados por cor na cena: o total fica limitado ao catálogo (pele + paleta),
 * não cresce com o número de avatares. Pertencem à cena e são liberados com ela.
 */
const materialCache = new WeakMap<Scene, Map<string, StandardMaterial>>();

function sharedMaterial(scene: Scene, hex: string): StandardMaterial {
  let byHex = materialCache.get(scene);
  if (!byHex) {
    byHex = new Map();
    materialCache.set(scene, byHex);
  }
  let material = byHex.get(hex);
  if (!material) {
    material = new StandardMaterial(`placeholder-avatar-material-${hex}`, scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.specularColor = new Color3(0.12, 0.12, 0.12);
    byHex.set(hex, material);
  }
  return material;
}

export interface Mannequin {
  root: TransformNode;
  /** Articulações, pela convenção de nomes. Trocar o avatar nunca recria nenhuma delas. */
  joints: Readonly<Record<Joint, TransformNode>>;
  /** Malhas atuais (corpo + equipamentos). */
  readonly meshes: readonly Mesh[];
  place(position: Vec2, heading: number): void;
  applyPose(pose: Pose): void;
  /** Troca aparência: recolore o corpo e refaz só os equipamentos (cabelo, saia, acessório). */
  applyAvatar(avatar: AvatarConfig): void;
  /**
   * Esconde o placeholder para dar lugar a um modelo real (mesma raiz e articulações). `false`
   * volta a mostrar o corpo e refaz os equipamentos do último avatar. Trocar de avatar enquanto
   * escondido não cria malhas.
   */
  setPlaceholderHidden(hidden: boolean): void;
  /** Desconectado (aguardando reconexão) fica translúcido. */
  setConnected(connected: boolean): void;
  /** Libera as malhas (os materiais compartilhados ficam com a cena). */
  dispose(): void;
}

/**
 * Manequim humanoide montado com primitivas (PLACEHOLDER, sem asset licenciado), com pivôs nas
 * articulações para a pose procedural girar membros inteiros. `id` diferencia os nomes na cena.
 */
export function createMannequin(
  scene: Scene,
  id: string,
  avatar: AvatarConfig,
  shadows?: ShadowGenerator,
): Mannequin {
  const name = (part: string) => `placeholder-mannequin-${id}-${part}`;
  const root = new TransformNode(`placeholder-mannequin-${id}`, scene);
  const body: Mesh[] = [];
  let equipment: Mesh[] = [];
  let connected = true;
  let placeholderHidden = false;
  let lastAvatar = avatar;

  const joint = (part: Joint, parent: TransformNode, position: Vector3) => {
    const node = new TransformNode(name(part), scene);
    node.parent = parent;
    node.position = position;
    return node;
  };
  const attach = (mesh: Mesh, parent: TransformNode, position: Vector3, list: Mesh[]) => {
    mesh.parent = parent;
    mesh.position = position;
    mesh.receiveShadows = true;
    mesh.visibility = connected ? 1 : 0.35;
    mesh.setEnabled(!placeholderHidden);
    if (SHADOW_PARTS.has(mesh.name.slice(name('').length))) shadows?.addShadowCaster(mesh);
    list.push(mesh);
    return mesh;
  };
  const capsule = (part: string, height: number, radius: number) =>
    CreateCapsule(name(part), { height, radius, tessellation: 12 }, scene);
  const sphere = (part: string, diameter: number, segments = 12) =>
    CreateSphere(name(part), { diameter, segments }, scene);

  const pelvis = joint('pelvis', root, new Vector3(0, HIP_HEIGHT, 0));
  const head = joint('head', pelvis, new Vector3(0, 0.75, 0));

  const torso = attach(capsule('torso', 0.62, 0.17), pelvis, new Vector3(0, 0.27, 0), body);
  const neck = attach(capsule('neck', 0.14, 0.05), pelvis, new Vector3(0, 0.6, 0), body);
  const skull = attach(sphere('skull', 0.24, 16), head, Vector3.Zero(), body);
  skull.scaling = new Vector3(0.9, 1.1, 1);

  const leg = (side: 1 | -1, prefix: 'left' | 'right') => {
    const hip = joint(`${prefix}-hip`, pelvis, new Vector3(0.1 * side, 0, 0));
    const thigh = attach(
      capsule(`${prefix}-thigh`, 0.47, 0.075),
      hip,
      new Vector3(0, -0.225, 0),
      body,
    );
    const knee = joint(`${prefix}-knee`, hip, new Vector3(0, -0.45, 0));
    const shin = attach(
      capsule(`${prefix}-shin`, 0.47, 0.06),
      knee,
      new Vector3(0, -0.225, 0),
      body,
    );
    const foot = attach(
      CreateBox(name(`${prefix}-foot`), { width: 0.1, height: 0.06, depth: 0.24 }, scene),
      knee,
      new Vector3(0, -0.47, 0.05),
      body,
    );
    return { hip, knee, thigh, shin, foot };
  };
  const arm = (side: 1 | -1, prefix: 'left' | 'right') => {
    const shoulder = joint(`${prefix}-shoulder`, pelvis, new Vector3(0.22 * side, 0.49, 0));
    const upper = attach(
      capsule(`${prefix}-upper-arm`, 0.3, 0.05),
      shoulder,
      new Vector3(0, -0.14, 0),
      body,
    );
    const elbow = joint(`${prefix}-elbow`, shoulder, new Vector3(0, -0.28, 0));
    const fore = attach(
      capsule(`${prefix}-forearm`, 0.28, 0.045),
      elbow,
      new Vector3(0, -0.13, 0),
      body,
    );
    const hand = attach(sphere(`${prefix}-hand`, 0.09, 8), elbow, new Vector3(0, -0.29, 0), body);
    return { shoulder, elbow, upper, fore, hand };
  };
  const legs = [leg(-1, 'left'), leg(1, 'right')];
  const arms = [arm(-1, 'left'), arm(1, 'right')];
  const [leftLeg, rightLeg] = legs as [(typeof legs)[0], (typeof legs)[0]];
  const [leftArm, rightArm] = arms as [(typeof arms)[0], (typeof arms)[0]];

  const joints: Record<Joint, TransformNode> = {
    pelvis,
    head,
    'left-hip': leftLeg.hip,
    'left-knee': leftLeg.knee,
    'right-hip': rightLeg.hip,
    'right-knee': rightLeg.knee,
    'left-shoulder': leftArm.shoulder,
    'left-elbow': leftArm.elbow,
    'right-shoulder': rightArm.shoulder,
    'right-elbow': rightArm.elbow,
  };

  const removeEquipment = () => {
    for (const mesh of equipment) {
      shadows?.removeShadowCaster(mesh);
      mesh.dispose();
    }
    equipment = [];
  };

  const applyAvatar = (config: AvatarConfig) => {
    lastAvatar = config;
    const skin = sharedMaterial(scene, colorHex(config.skin));
    const top = sharedMaterial(scene, colorHex(config.topColor));
    const bottom = sharedMaterial(scene, colorHex(config.bottomColor));
    const hair = sharedMaterial(scene, colorHex(config.hairColor));
    const shoes = sharedMaterial(scene, SHOES_HEX);
    const scale = BODY_SCALE;

    // Corpo: só materiais e escala das malhas; pivôs (esqueleto) intocados.
    torso.material = top;
    torso.scaling.set(scale.torso, 1, scale.torso);
    neck.material = skin;
    skull.material = skin;
    for (const { thigh, shin, foot } of legs) {
      thigh.material = config.bottom === 'skirt' ? skin : bottom;
      shin.material = config.bottom === 'pants' ? bottom : skin;
      foot.material = shoes;
      thigh.scaling.set(scale.limbs, 1, scale.limbs);
      shin.scaling.set(scale.limbs, 1, scale.limbs);
    }
    for (const { upper, fore, hand } of arms) {
      upper.material = config.top === 'tank' ? skin : top;
      fore.material = config.top === 'jacket' ? top : skin;
      hand.material = skin;
      upper.scaling.set(scale.limbs, 1, scale.limbs);
      fore.scaling.set(scale.limbs, 1, scale.limbs);
    }

    // Equipamentos: refeitos do zero a cada troca, sempre presos a uma articulação.
    removeEquipment();
    // Placeholder escondido (modelo real no lugar): nada é criado.
    if (placeholderHidden) return;
    const equip = (
      mesh: Mesh,
      parent: TransformNode,
      position: Vector3,
      material: StandardMaterial,
    ) => {
      mesh.material = material;
      return attach(mesh, parent, position, equipment);
    };

    if (config.hair !== 'none') {
      const cover = equip(sphere('hair', 0.26), head, new Vector3(0, 0.035, -0.008), hair);
      cover.scaling = new Vector3(0.92, 0.85, 1);
    }
    if (config.hair === 'long') {
      equip(capsule('hair-long', 0.36, 0.1), head, new Vector3(0, -0.1, -0.07), hair);
    }
    if (config.hair === 'bun') {
      equip(sphere('hair-bun', 0.11), head, new Vector3(0, 0.12, -0.1), hair);
    }
    if (config.bottom === 'skirt') {
      const skirt = CreateCylinder(
        name('skirt'),
        { diameterTop: 0.34 * scale.torso, diameterBottom: 0.52, height: 0.38, tessellation: 16 },
        scene,
      );
      equip(skirt, pelvis, new Vector3(0, -0.12, 0), bottom);
    }
    if (config.accessory === 'glasses') {
      const frame = sharedMaterial(scene, GLASSES_HEX);
      for (const side of [-1, 1]) {
        const lens = CreateCylinder(name(`lens-${side}`), { diameter: 0.06, height: 0.01 }, scene);
        lens.rotation.x = Math.PI / 2;
        equip(lens, head, new Vector3(0.045 * side, 0.02, 0.125), frame);
      }
      equip(
        CreateBox(name('glasses-bridge'), { width: 0.16, height: 0.008, depth: 0.008 }, scene),
        head,
        new Vector3(0, 0.03, 0.125),
        frame,
      );
    }
    if (config.accessory === 'cap') {
      equip(
        CreateCylinder(name('cap'), { diameter: 0.25, height: 0.07, tessellation: 20 }, scene),
        head,
        new Vector3(0, 0.1, 0),
        top,
      );
      equip(
        CreateBox(name('cap-visor'), { width: 0.18, height: 0.012, depth: 0.12 }, scene),
        head,
        new Vector3(0, 0.07, 0.15),
        top,
      );
    }
    if (config.accessory === 'necklace') {
      equip(
        CreateTorus(
          name('necklace'),
          { diameter: 0.16, thickness: 0.012, tessellation: 20 },
          scene,
        ),
        pelvis,
        new Vector3(0, 0.56, 0.01),
        sharedMaterial(scene, GOLD_HEX),
      );
    }
  };

  applyAvatar(avatar);

  return {
    root,
    joints,
    get meshes() {
      return [...body, ...equipment];
    },
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
      leftArm.elbow.rotation.x = -pose.leftElbow;
      rightArm.elbow.rotation.x = -pose.rightElbow;
    },
    applyAvatar,
    setPlaceholderHidden(value) {
      if (value === placeholderHidden) return;
      placeholderHidden = value;
      for (const mesh of body) mesh.setEnabled(!value);
      if (value) removeEquipment();
      else applyAvatar(lastAvatar);
    },
    setConnected(value) {
      connected = value;
      for (const mesh of [...body, ...equipment]) mesh.visibility = value ? 1 : 0.35;
    },
    dispose() {
      removeEquipment();
      for (const mesh of body) shadows?.removeShadowCaster(mesh);
      root.dispose();
    },
  };
}
