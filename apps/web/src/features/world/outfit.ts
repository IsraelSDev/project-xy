import { AVATAR_PARTS, topLayerChoice, withTopLayer, type AvatarConfig } from '@3dx/contracts';

/**
 * Peças que o painel de roupa do mundo mostra. A camada de cima junta camiseta e casaco (o avatar
 * veste uma por vez); a roupa íntima tem lugar próprio e só aparece se estiver vestida.
 */
export const OUTFIT_SLOTS = [
  'topLayer',
  'costume',
  'bottom',
  'underwear',
  'socks',
  'shoes',
  'gloves',
  'hat',
  'glasses',
  'mask',
] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

export interface OutfitPiece {
  slot: OutfitSlot;
  id: string;
  /** Nome da peça no catálogo (ex.: "Camiseta básica 3DX"). */
  label: string;
}

/** Slots cobertos pelo atalho "Tirar a roupa" (acessórios e roupa íntima ficam). */
const CLOTHING_SLOTS = ['topLayer', 'costume', 'bottom', 'socks', 'shoes', 'gloves'] as const;

const labelOf = (id: string): string =>
  AVATAR_PARTS.find((part) => part.id === id)?.label ?? 'Peça';

/** Nome da peça pelo id (as peças tiradas continuam com nome no "vestir de novo"). */
export const pieceLabel = labelOf;

/** Id da peça no slot; `'none'` quando o slot está vazio (camiseta e casaco contam como um só). */
export function pieceId(avatar: AvatarConfig, slot: OutfitSlot): string {
  if (slot === 'topLayer') return topLayerChoice(avatar) || 'none';
  const value = avatar[slot];
  return typeof value === 'string' && value.length > 0 ? value : 'none';
}

/** Só as peças realmente vestidas, na ordem do painel. */
export function wornPieces(avatar: AvatarConfig): OutfitPiece[] {
  return OUTFIT_SLOTS.flatMap((slot) => {
    const id = pieceId(avatar, slot);
    return id === 'none' ? [] : [{ slot, id, label: labelOf(id) }];
  });
}

/** Tira a peça do slot; na camada de cima, esvazia camiseta e casaco juntos. */
export function removePiece(avatar: AvatarConfig, slot: OutfitSlot): AvatarConfig {
  if (slot === 'topLayer') return withTopLayer(avatar, 'none');
  return { ...avatar, [slot]: 'none' };
}

/**
 * Veste de novo `id` no slot. Só aceita peça do catálogo que pertence ao slot (a camada de cima
 * valida camiseta/casaco em `withTopLayer`); id desconhecido devolve o avatar como está.
 */
export function wearPiece(avatar: AvatarConfig, slot: OutfitSlot, id: string): AvatarConfig {
  if (slot === 'topLayer') return withTopLayer(avatar, id);
  const part = AVATAR_PARTS.find((item) => item.id === id && item.slot === slot);
  return part ? { ...avatar, [slot]: id } : avatar;
}

/** "Tirar a roupa": camada de cima, fantasia, parte de baixo, meias, sapatos e luvas. */
export function undress(avatar: AvatarConfig): AvatarConfig {
  return CLOTHING_SLOTS.reduce((current, slot) => removePiece(current, slot), avatar);
}

/** Ainda veste alguma peça de roupa? (habilita o "Tirar a roupa"). */
export const wearingClothes = (avatar: AvatarConfig): boolean =>
  CLOTHING_SLOTS.some((slot) => pieceId(avatar, slot) !== 'none');
