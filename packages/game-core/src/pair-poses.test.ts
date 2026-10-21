import { describe, expect, it } from 'vitest';
import { PAIR_POSES, partnerPlacement } from './pair-poses.ts';

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
  it('cobre as três interações e usa ações válidas', () => {
    for (const type of ['hug', 'dance-duo', 'pose-intimate']) {
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
});
