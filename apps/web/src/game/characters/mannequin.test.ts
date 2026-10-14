import {
  ACCESSORIES,
  BODY_TYPES,
  BOTTOMS,
  DEFAULT_AVATAR,
  HAIR_STYLES,
  PALETTE,
  SKIN_TONES,
  TOPS,
  type AvatarConfig,
} from '@3dx/contracts';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, describe, expect, it } from 'vitest';
import { createMannequin, MANNEQUIN_JOINTS } from './mannequin';

/** Todas as combinações de um campo por vez, a partir do padrão. */
const variations = (): AvatarConfig[] => [
  ...BODY_TYPES.map(({ id }) => ({ ...DEFAULT_AVATAR, body: id })),
  ...SKIN_TONES.map(({ id }) => ({ ...DEFAULT_AVATAR, skin: id })),
  ...HAIR_STYLES.map(({ id }) => ({ ...DEFAULT_AVATAR, hair: id })),
  ...TOPS.map(({ id }) => ({ ...DEFAULT_AVATAR, top: id })),
  ...BOTTOMS.map(({ id }) => ({ ...DEFAULT_AVATAR, bottom: id })),
  ...ACCESSORIES.map(({ id }) => ({ ...DEFAULT_AVATAR, accessory: id })),
  ...PALETTE.map(({ id }) => ({ ...DEFAULT_AVATAR, topColor: id, hairColor: id })),
];

describe('manequim', () => {
  let engine: NullEngine;

  afterEach(() => {
    engine.dispose();
  });

  const setup = () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    return { scene, mannequin: createMannequin(scene, 'a', DEFAULT_AVATAR) };
  };

  it('expõe todas as articulações da convenção de esqueleto', () => {
    const { mannequin } = setup();
    for (const joint of MANNEQUIN_JOINTS) {
      expect(mannequin.joints[joint].name).toBe(`placeholder-mannequin-a-${joint}`);
    }
  });

  it('trocar equipamento não recria nem desloca o esqueleto', () => {
    const { scene, mannequin } = setup();
    const before = MANNEQUIN_JOINTS.map((joint) => ({
      node: mannequin.joints[joint],
      position: mannequin.joints[joint].position.clone(),
      parent: mannequin.joints[joint].parent,
    }));
    const nodeCount = scene.transformNodes.length;

    for (const avatar of variations()) mannequin.applyAvatar(avatar);

    MANNEQUIN_JOINTS.forEach((joint, index) => {
      const original = before[index];
      expect(mannequin.joints[joint]).toBe(original?.node);
      expect(mannequin.joints[joint].position.equals(original?.position ?? undefined!)).toBe(true);
      expect(mannequin.joints[joint].parent).toBe(original?.parent);
    });
    expect(scene.transformNodes).toHaveLength(nodeCount);
  });

  it('não vaza malhas: voltar ao avatar inicial volta à mesma contagem', () => {
    const { scene, mannequin } = setup();
    const initial = scene.meshes.length;

    for (const avatar of variations()) mannequin.applyAvatar(avatar);
    mannequin.applyAvatar(DEFAULT_AVATAR);

    expect(scene.meshes).toHaveLength(initial);
    expect(mannequin.meshes).toHaveLength(initial);
  });

  it('materiais são compartilhados por cor: muitos avatares não multiplicam materiais', () => {
    const { scene } = setup();
    for (let index = 0; index < 16; index++) createMannequin(scene, `p${index}`, DEFAULT_AVATAR);
    const afterSixteen = scene.materials.length;

    for (const avatar of variations()) createMannequin(scene, crypto.randomUUID(), avatar);

    // Limite: pele + paleta + sapatos/óculos/ouro, não importa quantos avatares existam.
    expect(afterSixteen).toBeLessThanOrEqual(6);
    expect(scene.materials.length).toBeLessThanOrEqual(SKIN_TONES.length + PALETTE.length + 3);
  });

  it('dispose remove todas as malhas do avatar e mantém os materiais da cena', () => {
    const { scene, mannequin } = setup();
    mannequin.applyAvatar({ ...DEFAULT_AVATAR, hair: 'long', accessory: 'glasses' });
    const materials = scene.materials.length;

    mannequin.dispose();

    expect(scene.meshes).toHaveLength(0);
    expect(scene.transformNodes).toHaveLength(0);
    expect(scene.materials).toHaveLength(materials);
  });
});
