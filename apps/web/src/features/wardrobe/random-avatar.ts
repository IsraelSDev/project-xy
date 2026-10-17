import {
  AVATAR_PARTS,
  BODY_TYPES,
  EYE_COLORS,
  MORPHS,
  PALETTE,
  PART_SLOTS,
  SKIN_TONES,
  defaultAvatarFor,
  partFitsModel,
  withTopLayer,
  type AvatarConfig,
  type DecalChoice,
  type PartSlot,
} from '@3dx/contracts';
import { randomFace, withMorph, type Morphs } from './face-edit';

/** Imagens de decalque por categoria (o `manifest.json` de `goe/decals`). */
export type DecalLibrary = Readonly<Record<string, readonly string[]>>;

type Random = () => number;

const pick = <T>(list: readonly T[], random: Random): T =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;

const chance = (probability: number, random: Random) => random() < probability;

/** Sorteia um item com peso: `[valor, peso]`. */
function weighted<T>(entries: readonly (readonly [T, number])[], random: Random): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let left = random() * total;
  for (const [value, weight] of entries) {
    left -= weight;
    if (left < 0) return value;
  }
  return entries[entries.length - 1]![0];
}

/** Peles comuns pesam mais; as exóticas (alienígena, zumbi) saem de vez em quando. */
const SKIN_TEXTURE_WEIGHTS = [
  ['base', 50],
  ['black', 22],
  ['asian', 22],
  ['alien', 2],
  ['dead', 2],
  ['dead2', 2],
] as const;

/** Olhos comuns pesam mais; os demais (felino, cósmico, cartoon) saem de vez em quando. */
const NATURAL_EYES = ['brown', 'blue', 'green'];

/** Formas de corpo que um sorteio pode usar, por modelo: as moderadas, sem as extremas (grávida, boneca, anime...). */
const BODY_SHAPES: Record<AvatarConfig['model'], readonly string[]> = {
  'goe-male': ['BodyBodybuilderDetails', 'BodyBodybuilderSize', 'BodyAssLarge', 'BodyNarrowWaist'],
  'goe-female': [
    'BodyAssLarge',
    'BodyBreastsSag',
    'BodyBreastsSmall',
    'BodyPearFigure',
    'BodyBigHips',
    'BodyNarrowWaist',
    'BodyBodybuilderDetails',
  ],
};

/** Onde cada família de decalque entra: marcas do rosto no rosto, tatuagens no corpo. */
const FACE_DECALS = ['02_freckles', '03_moles', '05_under_eye_color', '08_makeup'];
const BODY_TATTOOS = ['12_tattoo_oldschool', '13_tattoo_oldschool_simple'];
const TATTOO_SLOTS: DecalChoice['slot'][] = [
  'chest',
  'armLeft',
  'armRight',
  'thighLeft',
  'thighRight',
];

const FACE_FIRST = 'face_';

/** Peças do catálogo de um slot que servem no modelo. */
const partsFor = (slot: PartSlot, model: AvatarConfig['model']) =>
  AVATAR_PARTS.filter((part) => part.slot === slot && partFitsModel(part, model)).map(
    (part) => part.id,
  );

function randomDecals(library: DecalLibrary, random: Random): DecalChoice[] {
  const decals: DecalChoice[] = [];
  const faceCategories = FACE_DECALS.filter((category) => (library[category]?.length ?? 0) > 0);
  if (faceCategories.length > 0 && chance(0.5, random)) {
    const category = pick(faceCategories, random);
    const images = library[category]!;
    // O decalque do rosto tem variante própria (`face_*`): usa essa quando existe.
    const forFace = images.filter((image) => image.startsWith(FACE_FIRST));
    decals.push({
      slot: 'face',
      category: category as DecalChoice['category'],
      image: pick(forFace.length > 0 ? forFace : images, random),
    });
  }
  const tattooCategories = BODY_TATTOOS.filter((category) => (library[category]?.length ?? 0) > 0);
  if (tattooCategories.length > 0 && chance(0.2, random)) {
    const category = pick(tattooCategories, random);
    const images = library[category]!.filter((image) => !image.startsWith(FACE_FIRST));
    if (images.length > 0) {
      decals.push({
        slot: pick(TATTOO_SLOTS, random),
        category: category as DecalChoice['category'],
        image: pick(images, random),
      });
    }
  }
  return decals;
}

/**
 * Avatar novo, sorteado, no MESMO modelo (gênero) do atual: corpo, pele, olhos, cabelo e cores, roupa (camiseta ou casaco,
 * calça, sapato), formas do corpo e do rosto e decalques. A anatomia fica como está (a peça `genitals` e as formas do grupo
 * Anatomia), porque ela não entra em sorteio. `decals` é a biblioteca de imagens; sem ela não sai decalque.
 */
export function randomAvatar(
  current: AvatarConfig,
  decals: DecalLibrary = {},
  random: Random = Math.random,
): AvatarConfig {
  const model = current.model;
  const palette = PALETTE.map((item) => item.id);
  let avatar: AvatarConfig = {
    ...defaultAvatarFor(model),
    body: pick(BODY_TYPES, random).id,
    skin: pick(SKIN_TONES, random).id,
    skinTexture: weighted(SKIN_TEXTURE_WEIGHTS, random),
    eyes: chance(0.85, random)
      ? (pick(NATURAL_EYES, random) as AvatarConfig['eyes'])
      : pick(EYE_COLORS, random).id,
    hairColor: pick<AvatarConfig['hairColor']>(palette, random),
    topColor: pick<AvatarConfig['topColor']>(palette, random),
    bottomColor: pick<AvatarConfig['bottomColor']>(palette, random),
    genitals: current.genitals,
  };

  const hairs = partsFor('hair', model);
  avatar.hair = hairs.length > 0 && !chance(0.1, random) ? pick(hairs, random) : 'none';

  const tops = partsFor('top', model);
  const jackets = partsFor('outerwear', model);
  if (jackets.length > 0 && chance(0.3, random))
    avatar = withTopLayer(avatar, pick(jackets, random));
  else if (tops.length > 0) avatar = withTopLayer(avatar, pick(tops, random));

  const bottoms = partsFor('bottom', model);
  if (bottoms.length > 0) avatar.bottom = pick(bottoms, random);
  const shoes = partsFor('shoes', model);
  if (shoes.length > 0) avatar.shoes = pick(shoes, random);

  // Acessórios e afins: cada slot com peça no catálogo entra com 25% de chance.
  const handled: readonly PartSlot[] = ['hair', 'top', 'outerwear', 'bottom', 'shoes', 'genitals'];
  for (const slot of PART_SLOTS) {
    if (handled.includes(slot)) continue;
    const items = partsFor(slot, model);
    if (items.length > 0 && chance(0.25, random)) avatar[slot] = pick(items, random);
  }

  // Formas: a anatomia vem do avatar atual; o rosto e o corpo são sorteados do zero.
  const anatomy = new Set<string>(
    MORPHS.filter((morph) => morph.group === 'anatomy').map((morph) => morph.id),
  );
  let morphs = Object.fromEntries(
    Object.entries(current.morphs).filter(([id]) => anatomy.has(id)),
  ) as Morphs;
  morphs = randomFace(morphs, model, random, 5 + Math.floor(random() * 5));
  const shapes = [...BODY_SHAPES[model]];
  for (let count = Math.floor(random() * 4); count > 0 && shapes.length > 0; count--) {
    const [id] = shapes.splice(Math.floor(random() * shapes.length), 1);
    if (id) morphs = withMorph(morphs, id, 0.1 + random() * 0.4);
  }
  avatar.morphs = morphs;

  avatar.decals = randomDecals(decals, random);
  return avatar;
}
