import { z } from 'zod';
import { MORPH_IDS, type MorphId } from './morphs.ts';

/**
 * Formato canônico do avatar. Só referências a itens do catálogo abaixo: nunca URL, caminho de
 * arquivo ou cor livre. Assim o cliente não consegue fazer ninguém carregar um asset arbitrário,
 * e trocar a aparência não exige mexer no esqueleto (ver ADR 0006).
 * Mudança incompatível aqui exige subir AVATAR_FORMAT_VERSION (e migrar o que está salvo).
 */
export const AVATAR_FORMAT_VERSION = 5;

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
  { id: 'goe-male', label: 'Masculino' },
  { id: 'goe-female', label: 'Feminino' },
  // Família 3DX (assets nativos do cliente, ver ADR 0016): rig próprio, sem catálogo de peças ainda.
  { id: '3dx-male', label: 'Masculino 3DX' },
  { id: '3dx-female', label: 'Feminino 3DX' },
] as const satisfies readonly CatalogItem<string>[];

export type AvatarModelId = (typeof AVATAR_MODELS)[number]['id'];

/** Modelos da família GoE: rig, texturas e poses próprios (o resto do catálogo é só deles). */
export type GoeModelId = Extract<AvatarModelId, `goe-${string}`>;

/** O modelo é da família GoE? (as peças, poses e texturas da biblioteca só valem nele). */
export const isGoeModel = (model: AvatarModelId): model is GoeModelId => model.startsWith('goe-');

/**
 * Peças de roupa em GLB da biblioteca GoE (`id` = nome do arquivo sem extensão). Cada peça vale só
 * para os modelos listados em `models` (o esqueleto é único por gênero). A API só exige que a peça
 * exista (e sirva no modelo); sem venda de roupas por ora, tudo é equipável.
 */
export const PART_CATALOG = [
  { slot: 'top', id: 'GoE_M_Top_Fitness', label: 'Camiseta fitness', models: ['goe-male'] },
  { slot: 'bottom', id: 'GoE_M_Bottom_Fitness', label: 'Shorts fitness', models: ['goe-male'] },
  { slot: 'shoes', id: 'GoE_M_Shoes_Fitness', label: 'Tênis fitness', models: ['goe-male'] },
  {
    slot: 'outerwear',
    id: 'GoE_M_Outerwear_Street',
    label: 'Moletom street',
    models: ['goe-male'],
  },
  { slot: 'bottom', id: 'GoE_M_Bottom_Street', label: 'Calça street', models: ['goe-male'] },
  { slot: 'top', id: 'GoE_F_Top_CasualSport', label: 'Top casual sport', models: ['goe-female'] },
  {
    slot: 'bottom',
    id: 'GoE_F_Bottom_CasualSport',
    label: 'Legging casual sport',
    models: ['goe-female'],
  },
  { slot: 'shoes', id: 'GoE_F_Shoes_Casual', label: 'Bota casual', models: ['goe-female'] },
  { slot: 'top', id: 'GoE_F_Top_Sportswear', label: 'Top sportswear', models: ['goe-female'] },
  {
    slot: 'bottom',
    id: 'GoE_F_Bottom_Sportswear',
    label: 'Short sportswear',
    models: ['goe-female'],
  },
  { slot: 'hair', id: 'GoE_M_Hair01', label: 'Cabelo 1', models: ['goe-male'] },
  { slot: 'hair', id: 'GoE_M_Hair02', label: 'Cabelo 2', models: ['goe-male'] },
  { slot: 'hair', id: 'GoE_M_Hair03', label: 'Cabelo 3', models: ['goe-male'] },
  { slot: 'hair', id: 'GoE_F_Hair01', label: 'Cabelo 1', models: ['goe-female'] },
  { slot: 'hair', id: 'GoE_F_Hair02', label: 'Cabelo 2', models: ['goe-female'] },
  { slot: 'hair', id: 'GoE_F_Hair03', label: 'Cabelo 3', models: ['goe-female'] },
  // Anatomia masculina em malha própria (a feminina é parte do corpo). Opcional: nenhum avatar nasce com ela.
  { slot: 'genitals', id: 'GoE_M_Genitals', label: 'Genitais', models: ['goe-male'] },
  // Fase C/P5: coleção nativa do 3DXChat. As malhas vêm de
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
  },
  // Fase E: primeiro cabelo nativo por gênero. A textura do bundle é o atlas de fios (claro,
  // com alfa); o jogo aplica `hairColor` por cima, como nas peças GoE.
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
  },
  {
    slot: 'underwear',
    id: '3dx_f_underwear_bra_lace',
    label: 'Sutiã rendado 3DX',
    models: ['3dx-female'],
    file: '3dx/clothes/underwear/3dx_f_underwear_bra_lace.glb',
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
  'genitals',
] as const;
export type PartSlot = (typeof PART_SLOTS)[number];

/** Peças do conjunto padrão de cada gênero (usado na montagem do avatar inicial, não como trava). */
export const FREE_PART_IDS = [
  'GoE_M_Top_Fitness',
  'GoE_M_Bottom_Fitness',
  'GoE_M_Shoes_Fitness',
  'GoE_M_Hair03',
  'GoE_F_Top_CasualSport',
  'GoE_F_Bottom_CasualSport',
  'GoE_F_Shoes_Casual',
  'GoE_F_Hair01',
  'GoE_M_Genitals',
  // Fase C: o conjunto 3DX nasce vestido (e fica liberado para todo mundo).
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
 * `models` como tuplas literais, e `readonly ['goe-male'] | readonly ['goe-female']` não aceita
 * `.includes(model)`. Use esta visão para filtrar peças por modelo.
 */
export interface AvatarPart {
  slot: PartSlot;
  id: string;
  label: string;
  models: readonly AvatarModelId[];
  /** Caminho relativo a `/assets/` quando a peça não é da biblioteca GoE (`goe/<id>.glb`). */
  file?: string;
}

export const AVATAR_PARTS: readonly AvatarPart[] = PART_CATALOG;

/** A peça serve no modelo? (cada gênero tem o próprio esqueleto). */
export const partFitsModel = (part: AvatarPart, model: AvatarModelId): boolean =>
  part.models.includes(model);

/** Variantes de textura de pele do corpo (assets em `goe/skins/{gender}/{id}.webp`). */
export const SKIN_TEXTURES = [
  { id: 'base', label: 'Natural' },
  { id: 'black', label: 'Negra' },
  { id: 'asian', label: 'Asiática' },
  { id: 'alien', label: 'Alienígena' },
  { id: 'dead', label: 'Zumbi' },
  { id: 'dead2', label: 'Ressuscitada' },
] as const satisfies readonly CatalogItem<string>[];

/** Cor de íris (assets em `goe/eyes/{id}.webp`). Normal/rough/metal são fixos. */
export const EYE_COLORS = [
  { id: 'brown', label: 'Castanho' },
  { id: 'blue', label: 'Azul' },
  { id: 'green', label: 'Verde' },
  { id: 'cat', label: 'Felino' },
  { id: 'cosmic', label: 'Cósmico' },
  { id: 'cosmic_2', label: 'Cósmico 2' },
  { id: 'cartoon_blue', label: 'Cartoon azul' },
  { id: 'cartoon_blue_2', label: 'Cartoon azul 2' },
  { id: 'cartoon_cat', label: 'Cartoon felino' },
  { id: 'cartoon_gray', label: 'Cartoon cinza' },
] as const satisfies readonly CatalogItem<string>[];

/**
 * Decalques (tatuagens, cicatrizes, maquiagem…). O valor guardado é `categoria` + nome do arquivo
 * (sem extensão), nunca caminho/URL livre: o renderizador monta `goe/decals/{categoria}/{imagem}.webp`.
 */
export const DECAL_CATEGORIES = [
  { id: '01_under_eye_bw', label: 'Olheiras P&B' },
  { id: '02_freckles', label: 'Sardas' },
  { id: '03_moles', label: 'Pintas' },
  { id: '04_blood', label: 'Sangue' },
  { id: '05_under_eye_color', label: 'Olheiras coloridas' },
  { id: '06_bruises', label: 'Hematomas' },
  { id: '07_dirt_dust_ash', label: 'Sujeira' },
  { id: '08_makeup', label: 'Maquiagem' },
  { id: '09_scratches_cuts_claws', label: 'Cicatrizes' },
  { id: '10_cute', label: 'Fofo' },
  { id: '11_magic', label: 'Mágico' },
  { id: '12_tattoo_oldschool', label: 'Tatuagem old school' },
  { id: '13_tattoo_oldschool_simple', label: 'Tatuagem old school simples' },
  { id: '14_tattoo_autoral', label: 'Tatuagem autoral' },
] as const satisfies readonly CatalogItem<string>[];

/** Onde o decalque é projetado sobre o corpo. */
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
  /** Nome do arquivo sem extensão (ex.: `d_freckles_01`). */
  image: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/),
});
export type DecalChoice = z.infer<typeof DecalChoice>;

export const BODY_TYPES = [
  { id: 'slim', label: 'Esguio' },
  { id: 'regular', label: 'Médio' },
  { id: 'broad', label: 'Largo' },
] as const satisfies readonly CatalogItem<string>[];

/**
 * Altura do avatar como multiplicador da base do modelo (1,7 m): 1 = padrão, 0,85 = ~1,45 m,
 * 1,2 = ~2,04 m. Vale para os modelos GoE (escala a raiz inteira: corpo e peças). Valor fora da
 * faixa é limitado na leitura (nunca derruba o avatar).
 */
export const HEIGHT_MIN = 0.85;
export const HEIGHT_MAX = 1.2;

/**
 * Formas do GoE que o físico escolhido (aba **Corpo**) aplica por baixo, somadas ao `morphs` do avatar
 * (o que o usuário mexer na aba Formas tem prioridade). O JSON do avatar guarda só as chaves explícitas:
 * este preset é derivado de `body` no cliente, na hora de montar o modelo. "Médio" não mexe em nada.
 */
export const BODY_BUILD_MORPHS: Record<string, Partial<Record<MorphId, number>>> = {
  slim: { BodyEmaciated: 0.6 },
  regular: {},
  broad: { BodyBodybuilderSize: 0.85, BodyBodybuilderDetails: 0.5 },
};

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

/**
 * Influência de cada shape key do GoE (0..1), só as diferentes de zero. Leitura tolerante: chave desconhecida
 * (catálogo que mudou) ou valor fora da faixa não derruba o avatar inteiro, é descartada/limitada.
 */
const MorphValues = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const known = new Set<string>(MORPH_IDS);
    const cleaned: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (!known.has(key) || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const influence = Math.min(1, Math.max(0, raw));
      if (influence > 0.001) cleaned[key] = Math.round(influence * 1000) / 1000;
    }
    return cleaned;
  },
  z.partialRecord(z.enum(MORPH_IDS), z.number().min(0).max(1)),
);

/**
 * Altura do avatar (multiplicador da base, ver HEIGHT_MIN/HEIGHT_MAX). Leitura tolerante: número fora
 * da faixa é limitado, valor não numérico vira o padrão 1 — nunca derruba o avatar inteiro.
 */
const HeightValue = z.preprocess((value) => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 1;
  return Math.round(Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, number)) * 1000) / 1000;
}, z.number().min(HEIGHT_MIN).max(HEIGHT_MAX));

export const AvatarConfig = z.strictObject({
  /**
   * Modelo base (rig, roupa e peças). Avatares salvos antes da versão 4 (modelos antigos, fora do
   * catálogo) caem no avatar padrão ao serem lidos.
   */
  model: z.enum(ids(AVATAR_MODELS)).default('goe-male'),
  /**
   * Valores de peça: id do catálogo grátis ou item premium comprado. São texto (não enum) porque os
   * itens premium são definidos na loja (banco) e mudam sem nova versão do contrato. O catálogo é
   * fechado no servidor: `AvatarsService.save` recusa valor não grátis e não comprado (403), então
   * nunca se carrega asset arbitrário.
   */
  body: z.string().min(1).max(32),
  skin: z.enum(ids(SKIN_TONES)),
  skinTexture: z.enum(ids(SKIN_TEXTURES)).default('base'),
  eyes: z.enum(ids(EYE_COLORS)).default('brown'),
  hair: z.string().min(1).max(32),
  hairColor: Color,
  top: z.string().min(1).max(32),
  topColor: Color,
  bottom: z.string().min(1).max(32),
  bottomColor: Color,
  // Roupa íntima (calcinha/cueca). Separada da calça para poder ser usada sozinha.
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
  genitals: z.string().min(1).max(32).default('none'),
  // Formas do corpo e do rosto, expressões e anatomia (ver MORPHS): `{ nomeDaChave: 0..1 }`.
  morphs: MorphValues.default({}),
  // Altura do avatar (multiplicador da base de 1,7 m; ver HEIGHT_MIN/HEIGHT_MAX).
  height: HeightValue.default(1),
  // Decalques projetados no corpo (ver DECAL_SLOTS/DECAL_CATEGORIES).
  decals: z.array(DecalChoice).max(8).default([]),
});
export type AvatarConfig = z.infer<typeof AvatarConfig>;

export const DEFAULT_AVATAR: AvatarConfig = {
  model: 'goe-male',
  body: 'regular',
  skin: 'skin-3',
  skinTexture: 'base',
  eyes: 'brown',
  hair: 'none',
  hairColor: 'brown',
  top: 'GoE_M_Top_Fitness',
  topColor: 'blue',
  bottom: 'GoE_M_Bottom_Fitness',
  bottomColor: 'gray',
  underwear: 'none',
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
  shoes: 'GoE_M_Shoes_Fitness',
  gloves: 'none',
  genitals: 'none',
  morphs: {},
  height: 1,
  decals: [],
};

/**
 * Aparência padrão de um modelo: o avatar padrão com as peças grátis que servem nele. Usado ao
 * trocar de modelo no editor (as peças do gênero anterior não servem no novo). Slot sem peça grátis
 * compatível fica vazio. A família 3DX (ver ADR 0016) já tem o primeiro conjunto nativo da Fase C.
 */
export function defaultAvatarFor(model: AvatarModelId): AvatarConfig {
  const free = new Set<string>(FREE_PART_IDS);
  const avatar: Record<string, unknown> = { ...DEFAULT_AVATAR, model };
  // As roupas 3DX mantêm as cores da origem: camisa escura e calça azul (feminina) ou verde (masculina).
  if (!isGoeModel(model)) {
    avatar.topColor = 'black';
    avatar.bottomColor = model === '3dx-female' ? 'blue' : 'green';
    // O cabelo nativo também mantém o tom do ícone de origem (masculino curto marrom; feminino longo loiro).
    avatar.hairColor = model === '3dx-female' ? 'blonde' : 'brown';
  }
  for (const slot of PART_SLOTS) {
    // `genitals` é opcional: nunca vem no avatar padrão.
    if (slot === 'genitals') continue;
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
