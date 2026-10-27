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
  /**
   * Deslocamento do **iniciador** em relação à âncora do par, no referencial do assento
   * (`[direita, frente]`). Os pares de móvel não precisam: os clipes já trazem o deslocamento de
   * cada corpo em relação ao pivô do móvel. Serve para ajuste fino ou móvel de layout aproximado.
   */
  readonly seatOffset?: readonly [number, number];
  /**
   * Giro do par inteiro (graus) quando este lado inicia, somado ao heading do assento. Sobrepõe o
   * `facing` do par quando os dois corpos foram autorados em direções diferentes.
   */
  readonly facing?: number;
}

export interface PairPose extends PairPlacementOffset {
  /** Ação/clipe do iniciador (ver `ACTIONS`). */
  readonly actor: string;
  /** Ação/clipe do parceiro. */
  readonly partner: string;
  /** Quando definido, o iniciador precisa estar sentado neste tipo de móvel. */
  readonly seat?: 'sofa' | 'chair' | 'bed';
  /**
   * Giro do par inteiro em graus, somado ao heading do assento: leva o referencial do bundle
   * (onde o clipe foi autorado) para o referencial do assento.
   */
  readonly facing?: number;
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

  // Pares de móvel (bundles nativos mf/sofa, mf/chair e mf/bed). Os clipes são importados no
  // espaço do bundle (pivô `* bone POSE PIVOT`), então cada corpo carrega o seu deslocamento em
  // relação à raiz do móvel: os DOIS avatares ficam no mesmo ponto — o pivô —, como no jogo
  // (`propaction`: `posepivot = posepivot do parceiro`). Só `facing` é necessário, para girar o
  // referencial do bundle para o do assento: sofá é autorado com a frente em +X, a cama com a
  // cabeça em +Z (e o assento da cama aponta para a cabeceira).
  'sofa-1': {
    actor: 'pair10',
    partner: 'pair10',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: -90,
  },
  'sofa-2': {
    actor: 'pair11',
    partner: 'pair11',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: -90,
  },
  'sofa-3': {
    actor: 'pair12',
    partner: 'pair12',
    offset: [0, 0],
    yaw: 0,
    seat: 'sofa',
    facing: -90,
  },
  'chair-1': {
    actor: 'pair13',
    partner: 'pair13',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: 180,
  },
  'chair-2': {
    actor: 'pair14',
    partner: 'pair14',
    offset: [0, 0],
    yaw: 0,
    seat: 'chair',
    facing: 180,
  },
  'bed-1': {
    actor: 'pair15',
    partner: 'pair15',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
  },
  'bed-2': {
    actor: 'pair16',
    partner: 'pair16',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
  },
  'bed-3': {
    actor: 'pair17',
    partner: 'pair17',
    offset: [0, 0],
    yaw: 0,
    seat: 'bed',
  },
};

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
