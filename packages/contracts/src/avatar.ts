import { z } from 'zod';

/**
 * Formato canônico do avatar. Só referências a itens do catálogo abaixo: nunca URL, caminho de
 * arquivo ou cor livre. Assim o cliente não consegue fazer ninguém carregar um asset arbitrário,
 * e trocar a aparência não exige mexer no esqueleto (ver ADR 0006).
 * Mudança incompatível aqui exige subir AVATAR_FORMAT_VERSION (e migrar o que está salvo).
 */
export const AVATAR_FORMAT_VERSION = 1;

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
  body: z.enum(ids(BODY_TYPES)),
  skin: z.enum(ids(SKIN_TONES)),
  hair: z.enum(ids(HAIR_STYLES)),
  hairColor: Color,
  top: z.enum(ids(TOPS)),
  topColor: Color,
  bottom: z.enum(ids(BOTTOMS)),
  bottomColor: Color,
  accessory: z.enum(ids(ACCESSORIES)),
});
export type AvatarConfig = z.infer<typeof AvatarConfig>;

export const DEFAULT_AVATAR: AvatarConfig = {
  body: 'regular',
  skin: 'skin-3',
  hair: 'short',
  hairColor: 'brown',
  top: 'tshirt',
  topColor: 'blue',
  bottom: 'pants',
  bottomColor: 'gray',
  accessory: 'none',
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
