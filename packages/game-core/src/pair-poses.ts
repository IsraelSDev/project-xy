import { type Vec2 } from './geometry.ts';

/**
 * Posicionamento de uma interação a dois: o parceiro é colocado no referencial do iniciador
 * (que fica parado onde está), a partir do offset autoral e de um giro relativo.
 */
export interface PairPose {
  /** Ação/clipe do iniciador (ver `ACTIONS`). */
  readonly actor: string;
  /** Ação/clipe do parceiro. */
  readonly partner: string;
  /** Posição do parceiro no referencial do iniciador, em metros (`x` = direita, `z` = frente). */
  readonly offset: readonly [number, number];
  /** Giro do parceiro em graus, relativo ao iniciador (180 = de frente). */
  readonly yaw: number;
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
