import { z } from 'zod';

/**
 * Formato canônico do avatar. Só referências a itens do catálogo abaixo: nunca URL, caminho de
 * arquivo ou cor livre. Assim o cliente não consegue fazer ninguém carregar um asset arbitrário,
 * e trocar a aparência não exige mexer no esqueleto (ver ADR 0006).
 * Mudança incompatível aqui exige subir AVATAR_FORMAT_VERSION (e migrar o que está salvo).
 */
export const AVATAR_FORMAT_VERSION = 6;

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

/** Modelo base do avatar: cada um tem o próprio rig, roupa e conjunto de peças. */
export const AVATAR_MODELS = [
  { id: '3dx-male', label: 'Masculino' },
  { id: '3dx-female', label: 'Feminino' },
] as const satisfies readonly CatalogItem<string>[];

export type AvatarModelId = (typeof AVATAR_MODELS)[number]['id'];

/**
 * Peças de roupa em GLB do catálogo 3DX (`id` = identificador estável; `file` = caminho em
 * `/assets/`). Cada peça vale só para os modelos listados em `models` (o esqueleto é único por
 * gênero). A API só exige que a peça exista e sirva no modelo; sem venda de roupas por ora, tudo é
 * equipável.
 */
export const PART_CATALOG = [
  // `Resources/{man,woman}/cloth/*.prefab` do projeto exportado e os GLBs vivem em
  // `assets/3dx/clothes/<slot>/<id>.glb`. O contrato de rest pose/esqueleto do corpo está em
  // `tools/3dx/rigs/3dx_{male,female}.json` (nada de asset bundles).
  {
    slot: 'top',
    id: '3dx_m_top_shirt',
    label: 'Camisa 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/top/3dx_m_top_shirt.glb',
  },
  {
    slot: 'bottom',
    id: '3dx_m_bottom_pants',
    label: 'Calça 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/bottom/3dx_m_bottom_pants.glb',
  },
  {
    slot: 'underwear',
    id: '3dx_m_underwear_briefs',
    label: 'Cueca 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/underwear/3dx_m_underwear_briefs.glb',
    covers: 'bottom',
  },
  {
    slot: 'top',
    id: '3dx_f_top_shirt',
    label: 'Camiseta 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/top/3dx_f_top_shirt.glb',
  },
  {
    slot: 'bottom',
    id: '3dx_f_bottom_pants',
    label: 'Calça jeans 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/bottom/3dx_f_bottom_pants.glb',
  },
  {
    slot: 'underwear',
    id: '3dx_f_underwear_panties',
    label: 'Calcinha 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/underwear/3dx_f_underwear_panties.glb',
    covers: 'bottom',
  },
  // Fase E: primeiro cabelo nativo por gênero. A textura do bundle é o atlas de fios (claro,
  // com alfa); o jogo aplica `hairColor` por cima.
  {
    slot: 'hair',
    id: '3dx_m_hair_15',
    label: 'Cabelo curto 3DX',
    models: ['3dx-male'],
    file: '3dx/hair/3dx_m_hair_15.glb',
  },
  {
    slot: 'hair',
    id: '3dx_f_hair_30',
    label: 'Cabelo longo 3DX',
    models: ['3dx-female'],
    file: '3dx/hair/3dx_f_hair_30.glb',
  },
  // P6 (2026-10-21): mais cinco estilos nativos por gênero, exportados dos
  // prefabs do projeto (`Resources/{man,woman}/hair`), com atlas na resolução
  // original e alfa de recorte.
  {
    slot: 'hair',
    id: '3dx_m_hair_1',
    label: 'Cabelo curto 3DX 1',
    models: ['3dx-male'],
    file: '3dx/hair/3dx_m_hair_1.glb',
  },
  {
    slot: 'hair',
    id: '3dx_m_hair_2',
    label: 'Cabelo curto 3DX 2',
    models: ['3dx-male'],
    file: '3dx/hair/3dx_m_hair_2.glb',
  },
  {
    slot: 'hair',
    id: '3dx_m_hair_3',
    label: 'Cabelo curto 3DX 3',
    models: ['3dx-male'],
    file: '3dx/hair/3dx_m_hair_3.glb',
  },
  {
    slot: 'hair',
    id: '3dx_m_hair_6',
    label: 'Cabelo 3DX 6',
    models: ['3dx-male'],
    file: '3dx/hair/3dx_m_hair_6.glb',
  },
  {
    slot: 'hair',
    id: '3dx_m_hair_7',
    label: 'Cabelo 3DX 7',
    models: ['3dx-male'],
    file: '3dx/hair/3dx_m_hair_7.glb',
  },
  {
    slot: 'hair',
    id: '3dx_f_hair_1',
    label: 'Cabelo 3DX 1',
    models: ['3dx-female'],
    file: '3dx/hair/3dx_f_hair_1.glb',
  },
  {
    slot: 'hair',
    id: '3dx_f_hair_2',
    label: 'Cabelo 3DX 2',
    models: ['3dx-female'],
    file: '3dx/hair/3dx_f_hair_2.glb',
  },
  {
    slot: 'hair',
    id: '3dx_f_hair_3',
    label: 'Cabelo 3DX 3',
    models: ['3dx-female'],
    file: '3dx/hair/3dx_f_hair_3.glb',
  },
  {
    slot: 'hair',
    id: '3dx_f_hair_6',
    label: 'Cabelo 3DX 6',
    models: ['3dx-female'],
    file: '3dx/hair/3dx_f_hair_6.glb',
  },
  {
    slot: 'hair',
    id: '3dx_f_hair_8',
    label: 'Cabelo 3DX 8',
    models: ['3dx-female'],
    file: '3dx/hair/3dx_f_hair_8.glb',
  },
  // P5 (2026-10-20): coleção ampliada — 10 peças masculinas e 12 femininas novas.
  {
    slot: 'top',
    id: '3dx_m_top_tshirt_basic',
    label: 'Camiseta básica 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/top/3dx_m_top_tshirt_basic.glb',
  },
  {
    slot: 'top',
    id: '3dx_m_top_tshirt_print',
    label: 'Camiseta estampada 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/top/3dx_m_top_tshirt_print.glb',
  },
  {
    slot: 'top',
    id: '3dx_m_top_tshirt_long',
    label: 'Camiseta manga longa 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/top/3dx_m_top_tshirt_long.glb',
  },
  {
    slot: 'top',
    id: '3dx_m_top_harness',
    label: 'Arnês 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/top/3dx_m_top_harness.glb',
  },
  {
    slot: 'outerwear',
    id: '3dx_m_outerwear_cardigan',
    label: 'Cardigã 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/outerwear/3dx_m_outerwear_cardigan.glb',
  },
  {
    slot: 'outerwear',
    id: '3dx_m_outerwear_jacket',
    label: 'Jaqueta 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/outerwear/3dx_m_outerwear_jacket.glb',
  },
  {
    slot: 'outerwear',
    id: '3dx_m_outerwear_bomber',
    label: 'Jaqueta bomber 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/outerwear/3dx_m_outerwear_bomber.glb',
  },
  {
    slot: 'bottom',
    id: '3dx_m_bottom_jeans',
    label: 'Calça jeans 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/bottom/3dx_m_bottom_jeans.glb',
  },
  {
    slot: 'bottom',
    id: '3dx_m_bottom_shorts',
    label: 'Bermuda 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/bottom/3dx_m_bottom_shorts.glb',
  },
  {
    slot: 'underwear',
    id: '3dx_m_underwear_boxer',
    label: 'Cueca boxer 3DX',
    models: ['3dx-male'],
    file: '3dx/clothes/underwear/3dx_m_underwear_boxer.glb',
    covers: 'bottom',
  },
  {
    slot: 'top',
    id: '3dx_f_top_blouse',
    label: 'Blusa 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/top/3dx_f_top_blouse.glb',
  },
  {
    slot: 'top',
    id: '3dx_f_top_tube',
    label: 'Top tomara que caia 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/top/3dx_f_top_tube.glb',
  },
  {
    slot: 'top',
    id: '3dx_f_top_offshoulder',
    label: 'Camiseta ombro a ombro 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/top/3dx_f_top_offshoulder.glb',
  },
  {
    slot: 'top',
    id: '3dx_f_top_tank',
    label: 'Camiseta regata 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/top/3dx_f_top_tank.glb',
  },
  {
    slot: 'outerwear',
    id: '3dx_f_outerwear_coat',
    label: 'Casaco 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/outerwear/3dx_f_outerwear_coat.glb',
    // Vai até a metade da coxa: cobre a parte de cima e a de baixo.
    covers: 'all',
  },
  {
    slot: 'bottom',
    id: '3dx_f_bottom_leggings',
    label: 'Legging 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/bottom/3dx_f_bottom_leggings.glb',
  },
  {
    slot: 'bottom',
    id: '3dx_f_bottom_shorts',
    label: 'Short 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/bottom/3dx_f_bottom_shorts.glb',
  },
  {
    slot: 'bottom',
    id: '3dx_f_bottom_skirt',
    label: 'Saia 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/bottom/3dx_f_bottom_skirt.glb',
  },
  {
    slot: 'bottom',
    id: '3dx_f_bottom_skirt_pleated',
    label: 'Saia plissada 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/bottom/3dx_f_bottom_skirt_pleated.glb',
  },
  {
    slot: 'bottom',
    id: '3dx_f_bottom_skirt_short',
    label: 'Minissaia 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/bottom/3dx_f_bottom_skirt_short.glb',
  },
  {
    slot: 'underwear',
    id: '3dx_f_underwear_bra',
    label: 'Sutiã 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/underwear/3dx_f_underwear_bra.glb',
    covers: 'top',
  },
  {
    slot: 'underwear',
    id: '3dx_f_underwear_bra_lace',
    label: 'Sutiã rendado 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/underwear/3dx_f_underwear_bra_lace.glb',
    covers: 'top',
  },
  // P6 (2026-10-20): acessórios nativos — 5 chapéus, 5 óculos e 5 máscaras por gênero.
  {
    slot: 'hat',
    id: '3dx_m_hat_flat',
    label: 'Boné 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/hat/3dx_m_hat_flat.glb',
  },
  {
    slot: 'hat',
    id: '3dx_m_hat_bunny',
    label: 'Orelhas de coelho 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/hat/3dx_m_hat_bunny.glb',
  },
  {
    slot: 'hat',
    id: '3dx_m_hat_horns',
    label: 'Chifres 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/hat/3dx_m_hat_horns.glb',
  },
  {
    slot: 'hat',
    id: '3dx_m_hat_witch',
    label: 'Chapéu de bruxa 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/hat/3dx_m_hat_witch.glb',
  },
  {
    slot: 'hat',
    id: '3dx_m_hat_wool',
    label: 'Gorro de lã 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/hat/3dx_m_hat_wool.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_m_glasses_1',
    label: 'Óculos escuros 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/glasses/3dx_m_glasses_1.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_m_glasses_2',
    label: 'Óculos dourados 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/glasses/3dx_m_glasses_2.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_m_glasses_3',
    label: 'Óculos prateados 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/glasses/3dx_m_glasses_3.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_m_glasses_4',
    label: 'Óculos vermelhos 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/glasses/3dx_m_glasses_4.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_m_glasses_5',
    label: 'Óculos azuis 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/glasses/3dx_m_glasses_5.glb',
  },
  {
    slot: 'mask',
    id: '3dx_m_mask_1',
    label: 'Máscara de baile 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/mask/3dx_m_mask_1.glb',
  },
  {
    slot: 'mask',
    id: '3dx_m_mask_2',
    label: 'Máscara branca 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/mask/3dx_m_mask_2.glb',
  },
  {
    slot: 'mask',
    id: '3dx_m_mask_3',
    label: 'Máscara vermelha 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/mask/3dx_m_mask_3.glb',
  },
  {
    slot: 'mask',
    id: '3dx_m_mask_4',
    label: 'Máscara dourada 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/mask/3dx_m_mask_4.glb',
  },
  {
    slot: 'mask',
    id: '3dx_m_mask_5',
    label: 'Máscara prateada 3DX',
    models: ['3dx-male'],
    file: '3dx/accessories/mask/3dx_m_mask_5.glb',
  },
  {
    slot: 'hat',
    id: '3dx_f_hat_flat',
    label: 'Boné 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/hat/3dx_f_hat_flat.glb',
  },
  {
    slot: 'hat',
    id: '3dx_f_hat_bunny',
    label: 'Orelhas de coelho 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/hat/3dx_f_hat_bunny.glb',
  },
  {
    slot: 'hat',
    id: '3dx_f_hat_horns',
    label: 'Chifres 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/hat/3dx_f_hat_horns.glb',
  },
  {
    slot: 'hat',
    id: '3dx_f_hat_witch',
    label: 'Chapéu de bruxa 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/hat/3dx_f_hat_witch.glb',
  },
  {
    slot: 'hat',
    id: '3dx_f_hat_wool',
    label: 'Gorro de lã 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/hat/3dx_f_hat_wool.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_f_glasses_1',
    label: 'Óculos escuros 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/glasses/3dx_f_glasses_1.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_f_glasses_2',
    label: 'Óculos dourados 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/glasses/3dx_f_glasses_2.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_f_glasses_3',
    label: 'Óculos prateados 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/glasses/3dx_f_glasses_3.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_f_glasses_4',
    label: 'Óculos vermelhos 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/glasses/3dx_f_glasses_4.glb',
  },
  {
    slot: 'glasses',
    id: '3dx_f_glasses_5',
    label: 'Óculos azuis 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/glasses/3dx_f_glasses_5.glb',
  },
  {
    slot: 'mask',
    id: '3dx_f_mask_1',
    label: 'Máscara de baile 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/mask/3dx_f_mask_1.glb',
  },
  {
    slot: 'mask',
    id: '3dx_f_mask_2',
    label: 'Máscara branca 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/mask/3dx_f_mask_2.glb',
  },
  {
    slot: 'mask',
    id: '3dx_f_mask_3',
    label: 'Máscara vermelha 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/mask/3dx_f_mask_3.glb',
  },
  {
    slot: 'mask',
    id: '3dx_f_mask_4',
    label: 'Máscara dourada 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/mask/3dx_f_mask_4.glb',
  },
  {
    slot: 'mask',
    id: '3dx_f_mask_5',
    label: 'Máscara prateada 3DX',
    models: ['3dx-female'],
    file: '3dx/accessories/mask/3dx_f_mask_5.glb',
  },
] as const satisfies readonly {
  slot: string;
  id: string;
  label: string;
  models: readonly AvatarModelId[];
  file?: string;
  covers?: 'top' | 'bottom' | 'all';
}[];

/** Slots que recebem peças da biblioteca (além dos campos antigos, com catálogo próprio). */
export const PART_SLOTS = [
  'hair',
  'hat',
  'glasses',
  'mask',
  'headphones',
  'moustache',
  'pacifier',
  'clownNose',
  'emotion',
  'top',
  'outerwear',
  'bottom',
  'underwear',
  'costume',
  'socks',
  'shoes',
  'gloves',
] as const;
export type PartSlot = (typeof PART_SLOTS)[number];

/** Peças do conjunto padrão de cada gênero (usado na montagem do avatar inicial, não como trava). */
export const FREE_PART_IDS = [
  '3dx_m_top_shirt',
  '3dx_m_bottom_pants',
  '3dx_m_underwear_briefs',
  '3dx_f_top_shirt',
  '3dx_f_bottom_pants',
  '3dx_f_underwear_panties',
  '3dx_m_hair_15',
  '3dx_f_hair_30',
] as const;

/**
 * Peças do catálogo com `models` tipado como lista simples: o `as const` de `PART_CATALOG` deixa
 * `models` como tuplas literais, e uma tupla literal não aceita `.includes(model)`. Use esta visão
 * para filtrar peças por modelo.
 */
export interface AvatarPart {
  slot: PartSlot;
  id: string;
  label: string;
  models: readonly AvatarModelId[];
  /** Caminho relativo a `/assets/`. */
  file?: string;
  /**
   * Região do corpo que a peça cobre: `top`, `bottom` ou `all` (peça longa, como o sobretudo).
   * Na roupa íntima diz onde ela fica (sutiã = `top`, calcinha/cueca = `bottom`). Ela não é
   * desenhada quando aquela região já está coberta — senão atravessa o tecido de cima e aparece
   * como mancha.
   */
  covers?: 'top' | 'bottom' | 'all';
}

export const AVATAR_PARTS: readonly AvatarPart[] = PART_CATALOG;

/** A peça serve no modelo? (cada gênero tem o próprio esqueleto). */
export const partFitsModel = (part: AvatarPart, model: AvatarModelId): boolean =>
  part.models.includes(model);

/**
 * Altura do avatar como multiplicador da base do modelo (1,7 m): 1 = padrão, 0,85 = ~1,45 m,
 * 1,2 = ~2,04 m. Escala a raiz inteira do modelo (corpo e peças). Valor fora da faixa é limitado
 * na leitura (nunca derruba o avatar).
 */
export const HEIGHT_MIN = 0.85;
export const HEIGHT_MAX = 1.2;

export const SKIN_TONES = [
  { id: 'skin-1', label: 'Tom 1', hex: '#f3d7c4' },
  { id: 'skin-2', label: 'Tom 2', hex: '#e0b294' },
  { id: 'skin-3', label: 'Tom 3', hex: '#c68e68' },
  { id: 'skin-4', label: 'Tom 4', hex: '#9c6a48' },
  { id: 'skin-5', label: 'Tom 5', hex: '#6e4630' },
  { id: 'skin-6', label: 'Tom 6', hex: '#4a2f22' },
] as const satisfies readonly ColorItem<string>[];

/**
 * Cores de olho. A íris é um mapa em tons de cinza no atlas (`paint_iris`) e o jogo multiplica pela
 * cor escolhida (`EyeTintPlugin`), então qualquer hex do color picker funciona igual.
 */
export const EYE_COLORS = [
  { id: 'eye-brown', label: 'Castanho', hex: '#4a2f1e' },
  { id: 'eye-honey', label: 'Mel', hex: '#8a5a2b' },
  { id: 'eye-green', label: 'Verde', hex: '#3f6b3a' },
  { id: 'eye-blue', label: 'Azul', hex: '#3f6f9e' },
  { id: 'eye-gray', label: 'Cinza', hex: '#6d7378' },
  { id: 'eye-black', label: 'Preto', hex: '#1a1a1c' },
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

/**
 * Decalques 3DX (tatuagens). O valor guardado é `categoria` + nome do arquivo (sem extensão),
 * nunca caminho/URL livre: o renderizador monta `3dx/decals/{categoria}/{imagem}.webp`.
 */
export const DECAL_CATEGORIES = [
  { id: '14_tattoo_autoral', label: 'Tatuagem autoral' },
] as const satisfies readonly CatalogItem<string>[];

/** Onde o decalque é projetado sobre o corpo 3DX. */
export const DECAL_SLOTS = [
  { id: 'face', label: 'Rosto' },
  { id: 'neck', label: 'Pescoço' },
  { id: 'chest', label: 'Peito' },
  { id: 'back', label: 'Costas' },
  { id: 'armLeft', label: 'Braço esquerdo' },
  { id: 'armRight', label: 'Braço direito' },
  { id: 'thighLeft', label: 'Coxa esquerda' },
  { id: 'thighRight', label: 'Coxa direita' },
] as const satisfies readonly CatalogItem<string>[];

export const DecalChoice = z.strictObject({
  slot: z.enum(ids(DECAL_SLOTS)),
  category: z.enum(ids(DECAL_CATEGORIES)),
  /** Nome do arquivo sem extensão (ex.: `d_tattoo_snake`). */
  image: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/),
});
export type DecalChoice = z.infer<typeof DecalChoice>;

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

/**
 * Hex livre opcional (color picker). Ganha da paleta quando presente; a paleta continua sendo o
 * caminho padrão e o picker só existe porque o usuário pediu para escolher qualquer cor.
 */
const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .optional();

/**
 * Altura do avatar (multiplicador da base, ver HEIGHT_MIN/HEIGHT_MAX). Leitura tolerante: número fora
 * da faixa é limitado, valor não numérico vira o padrão 1 — nunca derruba o avatar inteiro.
 */
const HeightValue = z.preprocess((value) => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 1;
  return Math.round(Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, number)) * 1000) / 1000;
}, z.number().min(HEIGHT_MIN).max(HEIGHT_MAX));

export const AvatarConfig = z.strictObject({
  /** Modelo base (rig, roupa e peças). Avatares salvos antes desta versão caem no avatar padrão. */
  model: z.enum(ids(AVATAR_MODELS)).default('3dx-male'),
  /**
   * Valores de peça: id do catálogo grátis ou item premium comprado. São texto (não enum) porque os
   * itens premium são definidos na loja (banco) e mudam sem nova versão do contrato. O catálogo é
   * fechado no servidor: `AvatarsService.save` recusa valor não grátis e não comprado (403), então
   * nunca se carrega asset arbitrário.
   */
  skin: z.enum(ids(SKIN_TONES)),
  hair: z.string().min(1).max(32),
  hairColor: Color,
  top: z.string().min(1).max(32),
  topColor: Color,
  bottom: z.string().min(1).max(32),
  bottomColor: Color,
  // Cor de olho (paleta) e o hex livre do color picker, que ganha da paleta quando presente.
  eyeColor: z.enum(ids(EYE_COLORS)).default('eye-brown'),
  eyeColorHex: HexColor,
  hairColorHex: HexColor,
  topColorHex: HexColor,
  bottomColorHex: HexColor,
  // Roupa íntima (calcinha/cueca/sutiã). Slot independente: combina com calça/saia e top/blusa,
  // e também pode ser usada sozinha.
  underwear: z.string().min(1).max(32).default('none'),
  accessory: z.string().min(1).max(32),
  // Peças da biblioteca (ver PART_CATALOG). Avatares antigos ganham 'none'.
  hat: z.string().min(1).max(32).default('none'),
  glasses: z.string().min(1).max(32).default('none'),
  mask: z.string().min(1).max(32).default('none'),
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
  // Altura do avatar (multiplicador da base de 1,7 m; ver HEIGHT_MIN/HEIGHT_MAX).
  height: HeightValue.default(1),
  // Decalques projetados no corpo (ver DECAL_SLOTS/DECAL_CATEGORIES).
  decals: z.array(DecalChoice).max(8).default([]),
});
export type AvatarConfig = z.infer<typeof AvatarConfig>;

export const DEFAULT_AVATAR: AvatarConfig = {
  model: '3dx-male',
  skin: 'skin-3',
  hair: '3dx_m_hair_15',
  hairColor: 'brown',
  eyeColor: 'eye-brown',
  top: '3dx_m_top_shirt',
  topColor: 'black',
  bottom: '3dx_m_bottom_pants',
  bottomColor: 'green',
  underwear: '3dx_m_underwear_briefs',
  accessory: 'none',
  hat: 'none',
  glasses: 'none',
  mask: 'none',
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
  height: 1,
  decals: [],
};

/**
 * Aparência padrão de um modelo: o avatar padrão com as peças grátis que servem nele. Usado ao
 * trocar de modelo no editor (as peças do gênero anterior não servem no novo). Slot sem peça grátis
 * compatível fica vazio.
 */
export function defaultAvatarFor(model: AvatarModelId): AvatarConfig {
  const free = new Set<string>(FREE_PART_IDS);
  const avatar: Record<string, unknown> = { ...DEFAULT_AVATAR, model };
  // As roupas 3DX mantêm as cores da origem: camisa escura e calça azul (feminina) ou verde (masculina).
  avatar.topColor = 'black';
  avatar.bottomColor = model === '3dx-female' ? 'blue' : 'green';
  // O cabelo nativo também mantém o tom do ícone de origem (masculino curto marrom; feminino longo loiro).
  avatar.hairColor = model === '3dx-female' ? 'blonde' : 'brown';
  for (const slot of PART_SLOTS) {
    const part = AVATAR_PARTS.find(
      (item) => item.slot === slot && partFitsModel(item, model) && free.has(item.id),
    );
    avatar[slot] = part?.id ?? 'none';
  }
  return avatar as unknown as AvatarConfig;
}

/** Camiseta e casaco ocupam a mesma camada do corpo: só um é vestido por vez. */
export const TOP_LAYER_SLOTS = ['top', 'outerwear'] as const;

/**
 * Peça da camada de cima: o casaco, se houver, senão a camiseta ('none' = camada vazia). Aparência salva
 * antes de existir o slot do casaco vem sem o campo: ausente conta como vazio.
 */
export function topLayerChoice(config: Pick<AvatarConfig, 'top' | 'outerwear'>): string {
  return config.outerwear && config.outerwear !== 'none' ? config.outerwear : config.top;
}

/**
 * Coloca `id` na camada de cima e esvazia o outro slot, para camiseta e casaco nunca ficarem os dois
 * vestidos. `'none'` esvazia os dois. Id fora das duas categorias não muda nada.
 */
export function withTopLayer(config: AvatarConfig, id: string): AvatarConfig {
  if (id === 'none') return { ...config, top: 'none', outerwear: 'none' };
  const part = AVATAR_PARTS.find(
    (item) => item.id === id && (TOP_LAYER_SLOTS as readonly string[]).includes(item.slot),
  );
  if (!part) return config;
  return part.slot === 'outerwear'
    ? { ...config, top: 'none', outerwear: id }
    : { ...config, top: id, outerwear: 'none' };
}

/** Hex da cor de pele ou da paleta. */
export const colorHex = (id: AvatarConfig['skin'] | AvatarConfig['hairColor']): string =>
  [...SKIN_TONES, ...PALETTE].find((item) => item.id === id)?.hex ?? '#808080';

/**
 * Hex final de uma cor: o color picker (quando válido) ganha da paleta. Use sempre que a cor for
 * aplicada no material para que a prévia e o jogo mostrem a mesma coisa.
 */
export function resolveColorHex(id: string, customHex?: string): string {
  if (customHex && /^#[0-9a-fA-F]{6}$/.test(customHex)) return customHex.toLowerCase();
  return (
    [...SKIN_TONES, ...PALETTE, ...EYE_COLORS].find((item) => item.id === id)?.hex ?? '#808080'
  );
}

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
