import { type Vec2 } from './geometry.ts';

/**
 * Posicionamento de uma interação a dois: o parceiro é colocado no referencial do iniciador
 * (que fica parado onde está), a partir do offset autoral e de um giro relativo.
 */
export interface PairPlacementOffset {
  /** Posição do parceiro no referencial do iniciador, em metros (`x` = direita, `z` = frente). */
  readonly offset: readonly [number, number];
  /** Giro do parceiro em graus, relativo ao iniciador (180 = de frente). */
  readonly yaw: number;
}

export interface PairPose extends PairPlacementOffset {
  /** Ação/clipe do iniciador (ver `ACTIONS`). */
  readonly actor: string;
  /** Ação/clipe do parceiro. */
  readonly partner: string;
  /**
   * Composição de corpos que o par aceita. `'mf'` (padrão) usa o mesmo clipe nas duas metades,
   * cada corpo com a sua versão; `'ff'`/`'mm'` tocam um clipe por metade (`actor` ≠ `partner`),
   * porque as duas metades foram autoradas para corpos do mesmo gênero.
   */
  readonly pairing?: 'mf' | 'ff' | 'mm';
  /** Quando definido, o iniciador precisa estar sentado neste tipo de móvel (ou numa âncora de parede). */
  readonly seat?: 'sofa' | 'chair' | 'bed' | 'wall';
  /**
   * Giro do par inteiro em graus, somado ao heading do assento. Os clipes de móvel mantêm a
   * orientação nativa do prefab, então ficam em 0; só é necessário para bundle autorado de lado.
   */
  readonly facing?: number;
  /**
   * `facing` leva o corpo para o centro do móvel a partir do lugar da esquerda; no lugar da direita
   * (`Seat.lateralOffset > 0`) o giro troca de sinal. Para clipes que se estendem ao longo do
   * móvel a partir de uma ponta (ver `pairFacing`).
   */
  readonly facingTowardCenter?: boolean;
  /**
   * Deslocamento do par em relação à âncora do assento, no referencial do assento
   * (`[direita, frente]`). Positivo em `frente` afasta do encosto; negativo encosta nele.
   */
  readonly seatOffset?: readonly [number, number];
  /**
   * Colocação quando o iniciador é de cada gênero, para pares assimétricos. Sem isso vale
   * `offset`/`yaw` do próprio par.
   */
  readonly byInitiator?: Partial<Record<'male' | 'female', PairPlacementOffset>>;
  /**
   * Deslocamento vertical do par em metros, somado ao piso: serve para encaixar o clipe na altura
   * do móvel quando a pose foi autorada para outro móvel (positivo sobe). Ajustado no editor de
   * pares (`pair-tuner`).
   */
  readonly lift?: number;
}

/**
 * Colocação de cada interação a dois no corpo 3DX. Os pares nativos (`pair01`..`pair09`) já trazem
 * os dois lados no mesmo espaço: o parceiro fica à frente e de frente para quem iniciou. Variantes
 * como "beijo" usam a âncora padrão (0,25 m / 180°), com o movimento dentro do clipe. "Por trás"
 * fica um pouco à esquerda e mais afastada (0,35 m), para os corpos não se atravessarem.
 * `dance-duo` usa o clipe `dance` nos dois lados, com uma distância maior para não haver interseção.
 */
export const PAIR_POSES: Readonly<Record<string, PairPose>> = {
  hug: { actor: 'pair01', partner: 'pair01', offset: [0, 0.25], yaw: 180 },
  'dance-duo': { actor: 'dance', partner: 'dance', offset: [0, 0.9], yaw: 180 },
  'pose-intimate': { actor: 'pair01', partner: 'pair01', offset: [0, 0.25], yaw: 180 },
  'slow-dance-2': { actor: 'pair04', partner: 'pair04', offset: [0, 0.25], yaw: 180 },
  'slow-dance-behind': { actor: 'pair06', partner: 'pair06', offset: [-0.15, 0.35], yaw: 180 },
  kiss: { actor: 'pair07', partner: 'pair07', offset: [0, 0.25], yaw: 180 },
  'kiss-neck': { actor: 'pair08', partner: 'pair08', offset: [0, 0.25], yaw: 180 },
  'slow-dance-invert': { actor: 'pair09', partner: 'pair09', offset: [0, 0.25], yaw: 180 },

  // Pares de móvel: clipes de inserção das bundles `ai_*`/`midnight_*` (ver `seated-pairs.json`).
  // Como no jogo base, o clipe toca no prefab do personagem, na orientação nativa, e os DOIS
  // avatares ficam no pivô do móvel (`coupleDance`/`propaction`: `posepivot = posepivot do parceiro`).
  // A relação entre os corpos (haste x orifício) está no próprio clipe, por isso não há `offset`
  // nem `facing` por corpo. `facing`/`seatOffset`/`lift` abaixo saíram do editor de pares
  // (`pair-tuner`, exportado contra o móvel de verdade): `facing` 180 vira o casal para o encosto,
  // `seatOffset` é o ajuste no referencial do assento e `lift` levanta o par até a altura do móvel.
  'sofa-1': {
    actor: 'pair10',
    partner: 'pair10',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: 180,
    seatOffset: [-0.025, -0.03],
  },
  'sofa-2': {
    actor: 'pair11',
    partner: 'pair11',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: 180,
    seatOffset: [0.043, -0.032],
  },
  'sofa-3': {
    actor: 'pair12',
    partner: 'pair12',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: 180,
    seatOffset: [-0.02, 0.032],
  },
  // Os clipes de cadeira (`mf/chair`) vieram com o referencial girado 90° em relação à âncora do
  // assento (a bacia fica a ±90° da frente do assento, enquanto sofá/cama ficam a 0°). O giro
  // alinha o par com o eixo da cadeira; o sinal e o deslocamento saem do editor de pares.
  'chair-1': {
    actor: 'pair13',
    partner: 'pair13',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: -90,
    seatOffset: [0.079, 0.236],
  },
  'chair-2': {
    actor: 'pair14',
    partner: 'pair14',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: -90,
    seatOffset: [0.101, -0.053],
  },
  'bed-1': {
    actor: 'pair15',
    partner: 'pair15',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
    facing: 0,
    seatOffset: [-0.104, -0.384],
    lift: 0.2,
  },
  'bed-2': {
    actor: 'pair16',
    partner: 'pair16',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
    facing: 0,
    seatOffset: [-0.025, -0.518],
    lift: 0.16,
  },
  'bed-3': {
    actor: 'pair17',
    partner: 'pair17',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
    facing: 0,
    seatOffset: [-0.63, -0.305],
    lift: 0.17,
  },

  // Segundo pacote (5 por móvel). Mesmo esquema: os dois corpos ficam no pivô do móvel e o
  // clipe carrega o encaixe. Os de parede usam âncoras nas paredes do estúdio; o clipe foi
  // autorado com os dois de costas para o +Z local, então `facing: 180` vira o par para a
  // parede (a mulher apoia as mãos nela e o homem fica atrás, do lado da sala).
  'sofa-4': {
    actor: 'pair18',
    partner: 'pair18',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: 180,
    seatOffset: [0, 0],
  },
  'sofa-5': {
    actor: 'pair19',
    partner: 'pair19',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: 180,
    seatOffset: [0.13, -0.024],
  },
  'sofa-6': {
    actor: 'pair20',
    partner: 'pair20',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: 180,
    seatOffset: [0.181, -0.037],
  },
  'sofa-7': {
    actor: 'pair21',
    partner: 'pair21',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: 180,
    seatOffset: [0, 0],
  },
  'sofa-8': {
    actor: 'pair22',
    partner: 'pair22',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: 180,
    seatOffset: [0.097, 0.038],
  },
  'chair-3': {
    actor: 'pair23',
    partner: 'pair23',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: -90,
    seatOffset: [0.074, 0.133],
  },
  'chair-4': {
    actor: 'pair24',
    partner: 'pair24',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: -90,
    seatOffset: [0.004, 0.062],
  },
  'chair-5': {
    actor: 'pair25',
    partner: 'pair25',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: -90,
    seatOffset: [0.034, 0.194],
  },
  'chair-6': {
    actor: 'pair26',
    partner: 'pair26',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: -90,
    seatOffset: [0.054, 0.052],
  },
  'chair-7': {
    actor: 'pair27',
    partner: 'pair27',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: -90,
    seatOffset: [-0.002, 0.023],
  },
  'bed-4': {
    actor: 'pair28',
    partner: 'pair28',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
    facing: 0,
    seatOffset: [-0.307, -0.24],
    lift: 0.15,
  },
  'bed-5': {
    actor: 'pair29',
    partner: 'pair29',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
    facing: 0,
    seatOffset: [-0.496, -0.575],
    lift: 0.15,
    // O clipe `pair29` (cama 5) só fica correto com o homem 1 cm à direita da âncora.
    byInitiator: { male: { offset: [0.01, 0], yaw: 0 } },
  },
  'bed-6': {
    actor: 'pair30',
    partner: 'pair30',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
    facing: 0,
    seatOffset: [-0.503, -0.525],
    lift: 0.15,
  },
  'bed-7': {
    actor: 'pair31',
    partner: 'pair31',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
    facing: 0,
    seatOffset: [-0.201, -0.663],
    lift: 0.15,
  },
  'bed-8': {
    actor: 'pair32',
    partner: 'pair32',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
    facing: 0,
    seatOffset: [-0.103, -0.361],
    lift: 0.15,
  },
  'wall-1': {
    actor: 'pair33',
    partner: 'pair33',
    offset: [0, 0],
    yaw: 0,
    facing: 180,
    seat: 'wall',
  },
  'wall-2': {
    actor: 'pair34',
    partner: 'pair34',
    offset: [0, 0],
    yaw: 0,
    facing: 180,
    seat: 'wall',
  },
  'wall-3': {
    actor: 'pair35',
    partner: 'pair35',
    offset: [0, 0],
    yaw: 0,
    facing: 180,
    seat: 'wall',
  },
  'wall-4': {
    actor: 'pair36',
    partner: 'pair36',
    offset: [0, 0],
    yaw: 0,
    facing: 180,
    seat: 'wall',
  },
  'wall-5': {
    actor: 'pair37',
    partner: 'pair37',
    offset: [0, 0],
    yaw: 0,
    facing: 180,
    seat: 'wall',
  },

  // Pares do mesmo gênero. Medido nos JSONs importados (bacia dos dois lados no espaço do
  // bundle): as duas metades já vêm separadas dentro do clipe, como nos pares M/F de móvel,
  // então os dois avatares ficam no mesmo ponto (`offset` 0 / `yaw` 0) e cada um toca a sua
  // metade. `ff_hug`/`mm_hug` ficam ~0,65–0,88 m à frente; o beijo, ~0,16–0,21 m.
  'ff-hug': {
    actor: 'ff_hug_a',
    partner: 'ff_hug_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'ff',
  },
  'ff-kiss': {
    actor: 'ff_kiss_a',
    partner: 'ff_kiss_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'ff',
  },
  'ff-sofa-1': {
    actor: 'ff_sofa_1_a',
    partner: 'ff_sofa_1_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'ff',
    seat: 'sofa',
    facing: 180,
  },
  'ff-bed-1': {
    actor: 'ff_bed_1_a',
    partner: 'ff_bed_1_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'ff',
    seat: 'bed',
  },
  'mm-hug': {
    actor: 'mm_hug_a',
    partner: 'mm_hug_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'mm',
  },
  'mm-kiss': {
    actor: 'mm_kiss_a',
    partner: 'mm_kiss_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'mm',
  },
  'mm-sofa-1': {
    actor: 'mm_sofa_1_a',
    partner: 'mm_sofa_1_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'mm',
    seat: 'sofa',
    facing: 180,
  },
  'mm-bed-1': {
    actor: 'mm_bed_1_a',
    partner: 'mm_bed_1_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'mm',
    seat: 'bed',
  },

  // Paridade social e de móvel: danças (mesmo espaço autoral dos abraços/beijos) e cadeira/
  // parede, seguindo o referencial dos pares M/F equivalentes (cadeira `-90`, parede `180`).
  'ff-slow-dance': {
    actor: 'ff_slow_dance_a',
    partner: 'ff_slow_dance_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'ff',
  },
  'ff-slow-dance-invert': {
    actor: 'ff_slow_dance_invert_a',
    partner: 'ff_slow_dance_invert_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'ff',
  },
  'ff-chair-1': {
    actor: 'ff_chair_1_a',
    partner: 'ff_chair_1_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'ff',
    seat: 'chair',
    facing: -90,
  },
  'mm-slow-dance': {
    actor: 'mm_slow_dance_a',
    partner: 'mm_slow_dance_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'mm',
  },
  'mm-slow-dance-invert': {
    actor: 'mm_slow_dance_invert_a',
    partner: 'mm_slow_dance_invert_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'mm',
  },
  'mm-chair-1': {
    actor: 'mm_chair_1_a',
    partner: 'mm_chair_1_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'mm',
    seat: 'chair',
    facing: -90,
  },
  'mm-wall-1': {
    actor: 'mm_wall_1_a',
    partner: 'mm_wall_1_b',
    offset: [0, 0],
    yaw: 0,
    pairing: 'mm',
    seat: 'wall',
    facing: 180,
  },
};

/** Composição de um casal a partir do corpo de cada lado. */
export function coupleComposition(
  first: 'male' | 'female',
  second: 'male' | 'female',
): 'mf' | 'ff' | 'mm' {
  if (first !== second) return 'mf';
  return first === 'female' ? 'ff' : 'mm';
}

/** O par aceita este casal? Sem `pairing`, vale `'mf'` (um clipe por corpo, metades M/F). */
export function pairAccepts(pair: PairPose | undefined, composition: 'mf' | 'ff' | 'mm'): boolean {
  return pair !== undefined && (pair.pairing ?? 'mf') === composition;
}

/**
 * Giro do par em graus a somar ao heading do assento. Sem `facingTowardCenter` é o `facing` do
 * par; com ele, o lugar à direita do centro do móvel gira para o lado oposto.
 */
export function pairFacing(pair: PairPose, seat?: { readonly lateralOffset?: number }): number {
  const facing = pair.facing ?? 0;
  return pair.facingTowardCenter && (seat?.lateralOffset ?? 0) > 0 ? -facing : facing;
}

/** Altura extra (m) de cada clipe de par, para o cliente levantar/abaixar o corpo no móvel. */
const LIFT_BY_CLIP: ReadonlyMap<string, number> = (() => {
  const lifts = new Map<string, number>();
  for (const pose of Object.values(PAIR_POSES)) {
    if (pose.lift) lifts.set(pose.actor, pose.lift);
  }
  return lifts;
})();

/** Deslocamento vertical (m) do clipe de par; 0 para clipes que não são de móvel. */
export function pairLift(clip: string): number {
  return LIFT_BY_CLIP.get(clip) ?? 0;
}

export interface PairPlacement {
  position: Vec2;
  heading: number;
}

/**
 * Posição e frente do parceiro no mundo, a partir do iniciador parado em `actor` olhando para `heading`.
 * `offset` é `[direita, frente]` e `yaw` é em graus (positivo = anti-horário, como `heading`).
 */
export function partnerPlacement(
  actor: Vec2,
  heading: number,
  offset: readonly [number, number],
  yaw: number,
): PairPlacement {
  const [right, forward] = offset;
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  return {
    position: {
      x: actor.x + right * cos + forward * sin,
      z: actor.z - right * sin + forward * cos,
    },
    heading: heading + (yaw * Math.PI) / 180,
  };
}
