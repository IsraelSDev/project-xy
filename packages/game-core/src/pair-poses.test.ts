import { describe, expect, it } from 'vitest';
import { PAIR_POSES, pairFacing, partnerPlacement } from './pair-poses.ts';

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
    const expected = {
      'sofa-1': { seat: 'sofa', facing: undefined },
      'sofa-2': { seat: 'sofa', facing: -90 },
      'sofa-3': { seat: 'sofa', facing: undefined },
      'chair-1': { seat: 'chair', facing: undefined },
      'chair-2': { seat: 'chair', facing: undefined },
      'bed-1': { seat: 'bed', facing: undefined },
      'bed-2': { seat: 'bed', facing: undefined },
      'bed-3': { seat: 'bed', facing: undefined },
    } as const;
    for (const [type, want] of Object.entries(expected)) {
      const pair = PAIR_POSES[type]!;
      expect(pair.seat, type).toBe(want.seat);
      expect(pair.actor, type).toBe(pair.partner);
      // Os clipes carregam o deslocamento de cada corpo em relação ao pivô do móvel: os dois
      // avatares ficam no mesmo ponto, sem offset nem yaw no servidor.
      expect(pair.offset, type).toEqual([0, 0]);
      expect(pair.yaw, type).toBe(0);
      expect(pair.facing, type).toBe(want.facing);
      expect(pair.byInitiator, type).toBeUndefined();
      expect(pair.seatOffset, type).toBeUndefined();
    }
  });
});

describe('pairFacing', () => {
  it('sem facingTowardCenter vale o facing do par, em qualquer lugar', () => {
    expect(pairFacing(PAIR_POSES['sofa-1']!, { lateralOffset: 0.76 })).toBe(0);
    expect(pairFacing({ ...PAIR_POSES['sofa-1']!, facing: 90 }, { lateralOffset: 0.76 })).toBe(90);
  });

  it('o sofá 2 aponta o corpo para o centro a partir de cada ponta', () => {
    const pair = PAIR_POSES['sofa-2']!;
    expect(pairFacing(pair, { lateralOffset: -0.76 })).toBe(-90);
    expect(pairFacing(pair, { lateralOffset: 0.76 })).toBe(90);
  });

  it('o lugar do meio e o assento sem módulo usam o facing do par', () => {
    const pair = PAIR_POSES['sofa-2']!;
    expect(pairFacing(pair, { lateralOffset: 0 })).toBe(-90);
    expect(pairFacing(pair, {})).toBe(-90);
    expect(pairFacing(pair)).toBe(-90);
  });
});
