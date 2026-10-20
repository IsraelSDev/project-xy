import {
  AVATAR_PARTS,
  PALETTE,
  PART_SLOTS,
  SKIN_TONES,
  defaultAvatarFor,
  partFitsModel,
  withTopLayer,
  type AvatarConfig,
  type PartSlot,
} from '@3dx/contracts';

type Random = () => number;

const pick = <T>(list: readonly T[], random: Random): T =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;

const chance = (probability: number, random: Random) => random() < probability;

/** Peças do catálogo de um slot que servem no modelo. */
const partsFor = (slot: PartSlot, model: AvatarConfig['model']) =>
  AVATAR_PARTS.filter((part) => part.slot === slot && partFitsModel(part, model)).map(
    (part) => part.id,
  );

/**
 * Avatar novo, sorteado, no MESMO modelo (gênero) do atual: pele, cabelo e cores, roupa (camiseta ou
 * casaco, calça, cueca/calcinha, sapato) e acessórios. A altura fica como está.
 */
export function randomAvatar(current: AvatarConfig, random: Random = Math.random): AvatarConfig {
  const model = current.model;
  const palette = PALETTE.map((item) => item.id);
  let avatar: AvatarConfig = {
    ...defaultAvatarFor(model),
    skin: pick(SKIN_TONES, random).id,
    hairColor: pick<AvatarConfig['hairColor']>(palette, random),
    topColor: pick<AvatarConfig['topColor']>(palette, random),
    bottomColor: pick<AvatarConfig['bottomColor']>(palette, random),
    height: current.height,
    decals: current.decals,
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
  const underwear = partsFor('underwear', model);
  if (underwear.length > 0) avatar.underwear = pick(underwear, random);
  const shoes = partsFor('shoes', model);
  if (shoes.length > 0) avatar.shoes = pick(shoes, random);

  // Acessórios e afins: cada slot com peça no catálogo entra com 25% de chance.
  const handled: readonly PartSlot[] = ['hair', 'top', 'outerwear', 'bottom', 'underwear', 'shoes'];
  for (const slot of PART_SLOTS) {
    if (handled.includes(slot)) continue;
    const items = partsFor(slot, model);
    if (items.length > 0 && chance(0.25, random)) avatar[slot] = pick(items, random);
  }

  return avatar;
}
