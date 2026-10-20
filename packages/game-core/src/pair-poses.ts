import { type Vec2 } from './geometry.ts';

/**
 * Posicionamento de uma interação a dois: o parceiro é colocado no referencial do iniciador
 * (que fica parado onde está), a partir do offset autoral e de um giro relativo.
 */
export interface PairPose {
  /** Ação/pose do iniciador (ver `POSE_ACTIONS`/`ACTIONS`). */
  readonly actor: string;
  /** Ação/pose do parceiro. */
  readonly partner: string;
  /** Posição do parceiro no referencial do iniciador, em metros (`x` = direita, `z` = frente). */
  readonly offset: readonly [number, number];
  /** Giro do parceiro em graus, relativo ao iniciador (180 = de frente). */
  readonly yaw: number;
}

/**
 * Colocação de cada interação a dois. O pacote GoE não traz poses de dois atores: cada lado usa uma pose
 * solo (ou o clipe `dance`) e a colocação é composta à mão (ver `tools/goe/pair_poses_goe.py`, que calibra
 * o offset/giro por render). Chave = `InteractionType`.
 */
export const PAIR_POSES: Readonly<Record<string, PairPose>> = {
  hug: { actor: 'pose04', partner: 'pose04', offset: [0, 0.4], yaw: 180 },
  'dance-duo': { actor: 'dance', partner: 'dance', offset: [0, 0.9], yaw: 180 },
  'pose-intimate': { actor: 'sex01', partner: 'pose08', offset: [0, 0.1], yaw: 0 },
};

/**
 * Colocação do par quando os dois avatares são 3DX. Os clipes nativos `cuddle` já trazem os dois
 * lados no mesmo espaço: a parceira fica à frente e de frente para quem iniciou. Os tipos sem
 * entrada aqui caem no `PAIR_POSES` normal.
 *
 * O `hug` reusa o mesmo par nativo: o pacote 3DX não tem um clipe de abraço em pé (só `cuddle`,
 * `kisscheek` e `slowdance`), e as poses do GoE (`pose04`) não existem no corpo 3DX — sem esta
 * entrada o par ficava no `idle`, parado. `sex01`/`pose08` são mapeados para `pair01` em
 * `motionClip` (ver `avatar-model.ts`).
 */
export const PAIR_POSES_3DX: Readonly<Record<string, PairPose>> = {
  hug: { actor: 'sex01', partner: 'pose08', offset: [0, 0.25], yaw: 180 },
  'pose-intimate': { actor: 'sex01', partner: 'pose08', offset: [0, 0.25], yaw: 180 },
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
