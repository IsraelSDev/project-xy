import { z } from 'zod';

/**
 * Formato canônico do avatar. Só referências a itens do catálogo abaixo: nunca URL, caminho de
 * arquivo ou cor livre. Assim o cliente não consegue fazer ninguém carregar um asset arbitrário,
 * e trocar a aparência não exige mexer no esqueleto (ver ADR 0006).
 * Mudança incompatível aqui exige subir AVATAR_FORMAT_VERSION (e migrar o que está salvo).
 */
export const AVATAR_FORMAT_VERSION = 3;

interface CatalogItem<Id extends string> {
  id: Id;
  label: string;
}

interface ColorItem<Id extends string> extends CatalogItem<Id> {
  /** Cor sRGB em hexadecimal (#rrggbb). */
  hex: string;
}

const ids = <Id extends string>(items: readonly CatalogItem<Id>[]) =>
  items.map((item) => item.id) as [Id, ...Id[]];

/** Modelo base do avatar: cada um tem o próprio rig e conjunto de animações. */
export const AVATAR_MODELS = [
  { id: 'creative', label: 'Creative' },
  { id: 'feminine', label: 'Feminino' },
  { id: 'masculine', label: 'Masculino' },
  { id: 'superhero-female', label: 'Super-heroína' },
  { id: 'superhero-male', label: 'Super-herói' },
] as const satisfies readonly CatalogItem<string>[];

/**
 * Peças em GLB da biblioteca (mesmo esqueleto do corpo 'creative'). `id` é o nome do arquivo
 * sem extensão. Cada peça vai no slot `slot` do AvatarConfig. Peça sem linha na loja = grátis só
 * se estiver em FREE_PART_IDS; qualquer outra precisa de compra (validado na API).
 */
export const PART_CATALOG = [
  { slot: 'hair', id: 'Hairstyle_male_010', label: 'Cabelo 010' },
  { slot: 'hair', id: 'Hairstyle_male_012', label: 'Cabelo 012' },
  { slot: 'hat', id: 'Hat_010', label: 'Chapéu 010' },
  { slot: 'hat', id: 'Hat_049', label: 'Chapéu 049' },
  { slot: 'hat', id: 'Hat_057', label: 'Chapéu 057' },
  { slot: 'glasses', id: 'Glasses_004', label: 'Óculos 004' },
  { slot: 'glasses', id: 'Glasses_006', label: 'Óculos 006' },
  { slot: 'headphones', id: 'Headphones_002', label: 'Fone 002' },
  { slot: 'moustache', id: 'Moustache_001', label: 'Bigode 001' },
  { slot: 'moustache', id: 'Moustache_002', label: 'Bigode 002' },
  { slot: 'pacifier', id: 'Pacifier_001', label: 'Chupeta 001' },
  { slot: 'clownNose', id: 'Clown_nose_001', label: 'Nariz de palhaço' },
  { slot: 'emotion', id: 'Male_emotion_usual_001', label: 'Expressão neutra' },
  { slot: 'emotion', id: 'Male_emotion_happy_002', label: 'Expressão feliz' },
  { slot: 'emotion', id: 'Male_emotion_angry_003', label: 'Expressão brava' },
  { slot: 'top', id: 'T-Shirt_009', label: 'Camiseta 009' },
  { slot: 'outerwear', id: 'Outwear_029', label: 'Casaco 029' },
  { slot: 'outerwear', id: 'Outwear_036', label: 'Casaco 036' },
  { slot: 'bottom', id: 'Pants_010', label: 'Calça 010' },
  { slot: 'bottom', id: 'Pants_014', label: 'Calça 014' },
  { slot: 'bottom', id: 'Shorts_003', label: 'Shorts 003' },
  { slot: 'costume', id: 'Costume_6_001', label: 'Fantasia 006' },
  { slot: 'costume', id: 'Costume_10_001', label: 'Fantasia 010' },
  { slot: 'socks', id: 'Socks_008', label: 'Meias 008' },
  { slot: 'shoes', id: 'Shoe_Slippers_002', label: 'Chinelo 002' },
  { slot: 'shoes', id: 'Shoe_Slippers_005', label: 'Chinelo 005' },
  { slot: 'shoes', id: 'Shoe_Sneakers_009', label: 'Tênis 009' },
  { slot: 'gloves', id: 'Gloves_006', label: 'Luvas 006' },
  { slot: 'gloves', id: 'Gloves_014', label: 'Luvas 014' },
] as const;

/** Slots que recebem peças da biblioteca (além dos campos antigos, com catálogo próprio). */
export const PART_SLOTS = [
  'hair',
  'hat',
  'glasses',
  'headphones',
  'moustache',
  'pacifier',
  'clownNose',
  'emotion',
  'top',
  'outerwear',
  'bottom',
  'costume',
  'socks',
  'shoes',
  'gloves',
] as const;
export type PartSlot = (typeof PART_SLOTS)[number];

/** Peças grátis (padrão de novo avatar). As demais são vendidas na loja. */
export const FREE_PART_IDS = ['Hairstyle_male_010', 'T-Shirt_009', 'Pants_010'] as const;

export const BODY_TYPES = [
  { id: 'slim', label: 'Esguio' },
  { id: 'regular', label: 'Médio' },
  { id: 'broad', label: 'Largo' },
] as const satisfies readonly CatalogItem<string>[];

export const SKIN_TONES = [
  { id: 'skin-1', label: 'Tom 1', hex: '#f3d7c4' },
  { id: 'skin-2', label: 'Tom 2', hex: '#e0b294' },
  { id: 'skin-3', label: 'Tom 3', hex: '#c68e68' },
  { id: 'skin-4', label: 'Tom 4', hex: '#9c6a48' },
  { id: 'skin-5', label: 'Tom 5', hex: '#6e4630' },
  { id: 'skin-6', label: 'Tom 6', hex: '#4a2f22' },
] as const satisfies readonly ColorItem<string>[];

export const HAIR_STYLES = [
  { id: 'none', label: 'Sem cabelo' },
  { id: 'short', label: 'Curto' },
  { id: 'long', label: 'Longo' },
  { id: 'bun', label: 'Coque' },
] as const satisfies readonly CatalogItem<string>[];

export const TOPS = [
  { id: 'tshirt', label: 'Camiseta' },
  { id: 'tank', label: 'Regata' },
  { id: 'jacket', label: 'Jaqueta' },
] as const satisfies readonly CatalogItem<string>[];

export const BOTTOMS = [
  { id: 'pants', label: 'Calça' },
  { id: 'shorts', label: 'Bermuda' },
  { id: 'skirt', label: 'Saia' },
] as const satisfies readonly CatalogItem<string>[];

export const ACCESSORIES = [
  { id: 'none', label: 'Nenhum' },
  { id: 'glasses', label: 'Óculos' },
  { id: 'cap', label: 'Boné' },
  { id: 'necklace', label: 'Colar' },
] as const satisfies readonly CatalogItem<string>[];

/** Paleta única para cabelo e roupas. */
export const PALETTE = [
  { id: 'black', label: 'Preto', hex: '#1d1d22' },
  { id: 'white', label: 'Branco', hex: '#e8e6e1' },
  { id: 'gray', label: 'Cinza', hex: '#7b7d84' },
  { id: 'brown', label: 'Marrom', hex: '#6b4a32' },
  { id: 'blonde', label: 'Loiro', hex: '#d8b46a' },
  { id: 'red', label: 'Vermelho', hex: '#a8323a' },
  { id: 'blue', label: 'Azul', hex: '#2f5a9e' },
  { id: 'green', label: 'Verde', hex: '#2f7a52' },
  { id: 'purple', label: 'Roxo', hex: '#6a3f9e' },
  { id: 'pink', label: 'Rosa', hex: '#d97aa6' },
] as const satisfies readonly ColorItem<string>[];

const Color = z.enum(ids(PALETTE));

export const AvatarConfig = z.strictObject({
  /** Modelo base (rig e animações). Avatares salvos antes da versão 2 caem em 'masculine'. */
  model: z.enum(ids(AVATAR_MODELS)).default('creative'),
  /**
   * Valores de peça: id do catálogo grátis ou item premium comprado. São texto (não enum) porque os
   * itens premium são definidos na loja (banco) e mudam sem nova versão do contrato. O catálogo é
   * fechado no servidor: `AvatarsService.save` recusa valor não grátis e não comprado (403), então
   * nunca se carrega asset arbitrário.
   */
  body: z.string().min(1).max(32),
  skin: z.enum(ids(SKIN_TONES)),
  hair: z.string().min(1).max(32),
  hairColor: Color,
  top: z.string().min(1).max(32),
  topColor: Color,
  bottom: z.string().min(1).max(32),
  bottomColor: Color,
  accessory: z.string().min(1).max(32),
  // Peças da biblioteca (ver PART_CATALOG). Avatares antigos ganham 'none'.
  hat: z.string().min(1).max(32).default('none'),
  glasses: z.string().min(1).max(32).default('none'),
  headphones: z.string().min(1).max(32).default('none'),
  moustache: z.string().min(1).max(32).default('none'),
  pacifier: z.string().min(1).max(32).default('none'),
  clownNose: z.string().min(1).max(32).default('none'),
  emotion: z.string().min(1).max(32).default('none'),
  outerwear: z.string().min(1).max(32).default('none'),
  costume: z.string().min(1).max(32).default('none'),
  socks: z.string().min(1).max(32).default('none'),
  shoes: z.string().min(1).max(32).default('none'),
  gloves: z.string().min(1).max(32).default('none'),
});
export type AvatarConfig = z.infer<typeof AvatarConfig>;

export const DEFAULT_AVATAR: AvatarConfig = {
  model: 'creative',
  body: 'regular',
  skin: 'skin-3',
  hair: 'Hairstyle_male_010',
  hairColor: 'brown',
  top: 'T-Shirt_009',
  topColor: 'blue',
  bottom: 'Pants_010',
  bottomColor: 'gray',
  accessory: 'none',
  hat: 'none',
  glasses: 'none',
  headphones: 'none',
  moustache: 'none',
  pacifier: 'none',
  clownNose: 'none',
  emotion: 'none',
  outerwear: 'none',
  costume: 'none',
  socks: 'none',
  shoes: 'none',
  gloves: 'none',
};

/** Hex da cor de pele ou da paleta. */
export const colorHex = (id: AvatarConfig['skin'] | AvatarConfig['hairColor']): string =>
  [...SKIN_TONES, ...PALETTE].find((item) => item.id === id)?.hex ?? '#808080';

/**
 * Lê um avatar vindo de fora (estado da sala, banco). Qualquer coisa fora do catálogo vira o
 * avatar padrão: nunca falha, nunca carrega algo desconhecido.
 */
export function parseAvatar(value: unknown): AvatarConfig {
  const raw = typeof value === 'string' ? safeJson(value) : value;
  const parsed = AvatarConfig.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_AVATAR;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
