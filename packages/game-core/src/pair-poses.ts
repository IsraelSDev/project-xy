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
 * Colocação de cada interação a dois no corpo 3DX. O par nativo (`pair01`) já traz os dois lados no
 * mesmo espaço: a parceira fica à frente e de frente para quem iniciou. `dance-duo` usa o clipe
 * `dance` nos dois lados, com uma distância maior para não haver interseção.
 */
export const PAIR_POSES: Readonly<Record<string, PairPose>> = {
  hug: { actor: 'pair01', partner: 'pair01', offset: [0, 0.25], yaw: 180 },
  'dance-duo': { actor: 'dance', partner: 'dance', offset: [0, 0.9], yaw: 180 },
  'pose-intimate': { actor: 'pair01', partner: 'pair01', offset: [0, 0.25], yaw: 180 },
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
