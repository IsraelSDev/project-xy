import { describe, expect, it } from 'vitest';
import { resolveCollisions } from './collision.ts';
import { DEFAULT_MOVEMENT } from './movement.ts';
import { CLUB, SCENE_NAMES, obstaclesOf, pickSpawn, sceneByName } from './scenes.ts';

describe('balada como hall inicial', () => {
  it('é o primeiro cenário da lista e o padrão por nome', () => {
    expect(SCENE_NAMES[0]).toBe('club');
    expect(sceneByName('club')).toBe(CLUB);
  });

  it('tem escala de sala e os pontos de entrada livres de colisão', () => {
    expect(CLUB.halfWidth).toBeGreaterThan(10);
    expect(CLUB.halfDepth).toBeGreaterThan(20);

    const obstacles = obstaclesOf(CLUB);
    for (const point of CLUB.spawnPoints) {
      const resolved = resolveCollisions(
        point.position,
        DEFAULT_MOVEMENT.radius,
        obstacles,
      );
      expect(resolved.x).toBeCloseTo(point.position.x, 5);
      expect(resolved.z).toBeCloseTo(point.position.z, 5);
    }
  });

  it('não escolhe spawn em cima de parede mesmo com o ponto principal ocupado', () => {
    const next = pickSpawn(CLUB, [CLUB.spawn.position]);
    const resolved = resolveCollisions(
      next.position,
      DEFAULT_MOVEMENT.radius,
      obstaclesOf(CLUB),
    );
    expect(resolved.x).toBeCloseTo(next.position.x, 5);
    expect(resolved.z).toBeCloseTo(next.position.z, 5);
  });

  it('mantém os assentos dentro da sala', () => {
    expect(CLUB.seats.length).toBeGreaterThan(10);
    for (const seat of CLUB.seats) {
      expect(Math.abs(seat.position.x)).toBeLessThan(CLUB.halfWidth);
      expect(Math.abs(seat.position.z)).toBeLessThan(CLUB.halfDepth);
    }
  });
});
