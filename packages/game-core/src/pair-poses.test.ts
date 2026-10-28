import { describe, expect, it } from 'vitest';
import {
  PAIR_POSES,
  coupleComposition,
  pairAccepts,
  pairFacing,
  pairLift,
  partnerPlacement,
} from './pair-poses.ts';

describe('partnerPlacement', () => {
  const actor = { x: 3, z: -2 };

  it('offset puramente à frente fica adiante do iniciador', () => {
    const { position, heading } = partnerPlacement(actor, 0, [0, 1], 0);
    expect(position.x).toBeCloseTo(actor.x);
    expect(position.z).toBeCloseTo(actor.z + 1);
    expect(heading).toBeCloseTo(0);
  });

  it('offset puramente à direita fica à direita do iniciador', () => {
    const { position } = partnerPlacement(actor, 0, [1, 0], 0);
    expect(position.x).toBeCloseTo(actor.x + 1);
    expect(position.z).toBeCloseTo(actor.z);
  });

  it('gira o offset com o heading do iniciador', () => {
    // Olhando para +X, "à frente" vira +X no mundo.
    const { position } = partnerPlacement(actor, Math.PI / 2, [0, 1], 0);
    expect(position.x).toBeCloseTo(actor.x + 1);
    expect(position.z).toBeCloseTo(actor.z);
  });

  it('yaw 180 vira o parceiro de frente para o iniciador', () => {
    const { heading } = partnerPlacement(actor, 0, [0, 0.4], 180);
    expect(heading).toBeCloseTo(Math.PI);
  });
});

describe('PAIR_POSES', () => {
  const interactionTypes = [
    'hug',
    'dance-duo',
    'pose-intimate',
    'slow-dance-2',
    'slow-dance-behind',
    'kiss',
    'kiss-neck',
    'slow-dance-invert',
    'sofa-1',
    'sofa-2',
    'sofa-3',
    'chair-1',
    'chair-2',
  ];

  it('cobre todas as interações e usa ações válidas', () => {
    for (const type of interactionTypes) {
      const pair = PAIR_POSES[type];
      expect(pair).toBeDefined();
      expect(pair?.offset).toHaveLength(2);
      expect(pair?.actor).toBeTruthy();
      expect(pair?.partner).toBeTruthy();
    }
  });

  it('o par nativo coloca a parceira à frente e de frente para o iniciador', () => {
    const pair = PAIR_POSES['pose-intimate'];
    expect(pair).toBeDefined();
    expect(pair!.offset[1]).toBeGreaterThan(0);
    expect(pair!.yaw).toBe(180);
  });

  it('abraço usa o par nativo 3DX', () => {
    const pair = PAIR_POSES.hug;
    expect(pair).toBeDefined();
    expect(pair!.actor).toBe('pair01');
    expect(pair!.partner).toBe('pair01');
    expect(pair!.yaw).toBe(180);
  });

  it('as novas interações usam um clipe de par próprio em cada lado', () => {
    const newTypes = [
      'slow-dance-2',
      'slow-dance-behind',
      'kiss',
      'kiss-neck',
      'slow-dance-invert',
    ];
    const pairs = newTypes.map((type) => PAIR_POSES[type]!);
    expect(new Set(pairs.map((pair) => pair.actor))).toEqual(
      new Set(['pair04', 'pair06', 'pair07', 'pair08', 'pair09']),
    );
    for (const pair of pairs) {
      expect(pair.actor).toBe(pair.partner);
      expect(pair.yaw).toBe(180);
    }
  });

  it('a dança por trás fica um pouco à esquerda e mais afastada', () => {
    const pair = PAIR_POSES['slow-dance-behind'];
    expect(pair).toBeDefined();
    expect(pair!.offset).toEqual([-0.15, 0.35]);
    expect(pair!.yaw).toBe(180);
  });

  it('os pares de móvel usam o pivô do móvel e exigem o assento certo', () => {
    interface Expected {
      seat: 'sofa' | 'chair' | 'bed' | 'wall';
      facing: number;
      seatOffset?: readonly [number, number];
      lift?: number;
      byInitiator?: boolean;
    }
    // `facing`/`seatOffset`/`lift` exportados do editor de pares (`pair-tuner`) contra o móvel.
    const expected: Record<string, Expected> = {
      'sofa-1': { seat: 'sofa', facing: 180, seatOffset: [-0.025, -0.03] },
      'sofa-2': { seat: 'sofa', facing: 180, seatOffset: [0.043, -0.032] },
      'sofa-3': { seat: 'sofa', facing: 180, seatOffset: [-0.02, 0.032] },
      'chair-1': { seat: 'chair', facing: -90, seatOffset: [0.079, 0.236] },
      'chair-2': { seat: 'chair', facing: -90, seatOffset: [0.101, -0.053] },
      'bed-1': { seat: 'bed', facing: 0, seatOffset: [-0.104, -0.384], lift: 0.2 },
      'bed-2': { seat: 'bed', facing: 0, seatOffset: [-0.025, -0.518], lift: 0.16 },
      'bed-3': { seat: 'bed', facing: 0, seatOffset: [-0.63, -0.305], lift: 0.17 },
      'sofa-4': { seat: 'sofa', facing: 180, seatOffset: [0, 0] },
      'sofa-5': { seat: 'sofa', facing: 180, seatOffset: [0.13, -0.024] },
      'sofa-6': { seat: 'sofa', facing: 180, seatOffset: [0.181, -0.037] },
      'sofa-7': { seat: 'sofa', facing: 180, seatOffset: [0, 0] },
      'sofa-8': { seat: 'sofa', facing: 180, seatOffset: [0.097, 0.038] },
      'chair-3': { seat: 'chair', facing: -90, seatOffset: [0.074, 0.133] },
      'chair-4': { seat: 'chair', facing: -90, seatOffset: [0.004, 0.062] },
      'chair-5': { seat: 'chair', facing: -90, seatOffset: [0.034, 0.194] },
      'chair-6': { seat: 'chair', facing: -90, seatOffset: [0.054, 0.052] },
      'chair-7': { seat: 'chair', facing: -90, seatOffset: [-0.002, 0.023] },
      'bed-4': { seat: 'bed', facing: 0, seatOffset: [-0.307, -0.24], lift: 0.15 },
      'bed-5': {
        seat: 'bed',
        facing: 0,
        seatOffset: [-0.496, -0.575],
        lift: 0.15,
        byInitiator: true,
      },
      'bed-6': { seat: 'bed', facing: 0, seatOffset: [-0.503, -0.525], lift: 0.15 },
      'bed-7': { seat: 'bed', facing: 0, seatOffset: [-0.201, -0.663], lift: 0.15 },
      'bed-8': { seat: 'bed', facing: 0, seatOffset: [-0.103, -0.361], lift: 0.15 },
      // Os clipes de cadeira vieram com o referencial girado 90° (medido na bacia): giram para
      // alinhar o par com o eixo da cadeira.
      // Os clipes de parede foram autorados de costas para o +Z local: giram 180° para
      // encarar a parede (heading da âncora), com o homem atrás.
      'wall-1': { seat: 'wall', facing: 180 },
      'wall-2': { seat: 'wall', facing: 180 },
      'wall-3': { seat: 'wall', facing: 180 },
      'wall-4': { seat: 'wall', facing: 180 },
      'wall-5': { seat: 'wall', facing: 180 },
    };
    for (const [type, want] of Object.entries(expected)) {
      const pair = PAIR_POSES[type]!;
      expect(pair.seat, type).toBe(want.seat);
      expect(pair.actor, type).toBe(pair.partner);
      // Os clipes carregam o deslocamento de cada corpo em relação ao pivô do móvel: os dois
      // avatares ficam no mesmo ponto, sem offset nem yaw no servidor.
      expect(pair.offset, type).toEqual([0, 0]);
      expect(pair.yaw, type).toBe(0);
      expect(pair.facing, type).toBe(want.facing);
      expect(pair.seatOffset, type).toEqual(want.seatOffset);
      expect(pair.lift, type).toBe(want.lift);
      if (want.byInitiator) {
        // `bed-5` foi ajustado com o homem 1 cm à direita da âncora.
        expect(pair.byInitiator, type).toEqual({ male: { offset: [0.01, 0], yaw: 0 } });
      } else {
        expect(pair.byInitiator, type).toBeUndefined();
      }
    }
  });
});

describe('pares do mesmo gênero', () => {
  const expected: Record<
    string,
    { pairing: 'ff' | 'mm'; prefix: string; seat?: 'sofa' | 'bed'; facing?: number }
  > = {
    'ff-hug': { pairing: 'ff', prefix: 'ff_hug' },
    'ff-kiss': { pairing: 'ff', prefix: 'ff_kiss' },
    'ff-sofa-1': { pairing: 'ff', prefix: 'ff_sofa_1', seat: 'sofa', facing: 180 },
    'ff-bed-1': { pairing: 'ff', prefix: 'ff_bed_1', seat: 'bed' },
    'mm-hug': { pairing: 'mm', prefix: 'mm_hug' },
    'mm-kiss': { pairing: 'mm', prefix: 'mm_kiss' },
    'mm-sofa-1': { pairing: 'mm', prefix: 'mm_sofa_1', seat: 'sofa', facing: 180 },
    'mm-bed-1': { pairing: 'mm', prefix: 'mm_bed_1', seat: 'bed' },
  };

  it('usa um clipe por metade, autorado para o corpo do par', () => {
    for (const [type, want] of Object.entries(expected)) {
      const pair = PAIR_POSES[type]!;
      expect(pair.pairing, type).toBe(want.pairing);
      expect(pair.actor, type).toBe(`${want.prefix}_a`);
      expect(pair.partner, type).toBe(`${want.prefix}_b`);
      expect(pair.seat, type).toBe(want.seat);
      expect(pair.facing, type).toBe(want.facing);
    }
  });

  it('fica no mesmo ponto do iniciador: o clipe carrega a separação dos dois corpos', () => {
    for (const type of Object.keys(expected)) {
      const pair = PAIR_POSES[type]!;
      expect(pair.offset, type).toEqual([0, 0]);
      expect(pair.yaw, type).toBe(0);
    }
  });

  it('os pares M/F continuam valendo só para casais mistos', () => {
    expect(PAIR_POSES.hug!.pairing).toBeUndefined();
    expect(PAIR_POSES['sofa-1']!.pairing).toBeUndefined();
  });
});

describe('composição do casal', () => {
  it('classifica os corpos dos dois lados', () => {
    expect(coupleComposition('male', 'female')).toBe('mf');
    expect(coupleComposition('female', 'male')).toBe('mf');
    expect(coupleComposition('female', 'female')).toBe('ff');
    expect(coupleComposition('male', 'male')).toBe('mm');
  });

  it('só aceita o par da composição (sem pairing vale M/F)', () => {
    expect(pairAccepts(PAIR_POSES.hug, 'mf')).toBe(true);
    expect(pairAccepts(PAIR_POSES.hug, 'ff')).toBe(false);
    expect(pairAccepts(PAIR_POSES['ff-hug'], 'ff')).toBe(true);
    expect(pairAccepts(PAIR_POSES['ff-hug'], 'mm')).toBe(false);
    expect(pairAccepts(PAIR_POSES['mm-bed-1'], 'mm')).toBe(true);
    expect(pairAccepts(PAIR_POSES['mm-bed-1'], 'mf')).toBe(false);
    expect(pairAccepts(undefined, 'mf')).toBe(false);
  });
});

describe('pairFacing', () => {
  it('sem facingTowardCenter vale o facing do par, em qualquer lugar', () => {
    expect(pairFacing({ ...PAIR_POSES['sofa-1']!, facing: 0 }, { lateralOffset: 0.76 })).toBe(0);
    expect(pairFacing({ ...PAIR_POSES['sofa-1']!, facing: 90 }, { lateralOffset: 0.76 })).toBe(90);
  });

  it('com facingTowardCenter o lado direito do móvel espelha o giro', () => {
    const pair = { ...PAIR_POSES['sofa-1']!, facing: -90, facingTowardCenter: true };
    expect(pairFacing(pair, { lateralOffset: -0.76 })).toBe(-90);
    expect(pairFacing(pair, { lateralOffset: 0.76 })).toBe(90);
  });

  it('o lugar do meio e o assento sem módulo usam o facing do par', () => {
    const pair = { ...PAIR_POSES['sofa-1']!, facing: -90, facingTowardCenter: true };
    expect(pairFacing(pair, { lateralOffset: 0 })).toBe(-90);
    expect(pairFacing(pair, {})).toBe(-90);
    expect(pairFacing(pair)).toBe(-90);
  });
});

describe('pairLift', () => {
  it('devolve o ajuste vertical do clipe do par', () => {
    for (const pair of Object.values(PAIR_POSES)) {
      expect(pairLift(pair.actor), pair.actor).toBe(pair.lift ?? 0);
    }
  });

  it('clipe que não é de par não levanta o corpo', () => {
    expect(pairLift('walk')).toBe(0);
    expect(pairLift('')).toBe(0);
  });
});
