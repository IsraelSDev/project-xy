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

  it('deixa o caminho dos degraus do bar livre (sem parede invisível)', () => {
    const obstacles = obstaclesOf(CLUB);
    for (const point of [
      { x: 0.5, z: -0.8 },
      { x: 1.5, z: -5 },
      { x: 2.4, z: -5 },
      { x: -0.5, z: -1 },
    ]) {
      const resolved = resolveCollisions(point, DEFAULT_MOVEMENT.radius, obstacles);
      expect(resolved.x, `x de ${point.x},${point.z}`).toBeCloseTo(point.x, 5);
      expect(resolved.z, `z de ${point.x},${point.z}`).toBeCloseTo(point.z, 5);
    }
  });

  it('colide com sofás, luminárias de chão e alto-falante', () => {
    const obstacles = obstaclesOf(CLUB);
    const radius = DEFAULT_MOVEMENT.radius;
    for (const point of [
      { x: 7.5, z: -19.3 },
      { x: -2, z: -17.5 },
      { x: 6.5, z: 6.2 },
      { x: 9.8, z: 6.2 },
      { x: -1.6, z: -7.4 },
      { x: -5, z: 8.2 },
      { x: -9, z: 13.5 },
      { x: -6.5, z: 13.5 },
    ]) {
      const resolved = resolveCollisions(point, radius, obstacles);
      const moved = Math.hypot(resolved.x - point.x, resolved.z - point.z);
      expect(moved, `objeto em ${point.x},${point.z}`).toBeGreaterThan(0);
    }

    // O corredor entre os sofás continua livre.
    const aisle = { x: 4, z: -17 };
    expect(resolveCollisions(aisle, radius, obstacles)).toEqual(aisle);
  });

  it('mantém os assentos dentro da sala', () => {
    expect(CLUB.seats.length).toBeGreaterThan(10);
    for (const seat of CLUB.seats) {
      expect(Math.abs(seat.position.x)).toBeLessThan(CLUB.halfWidth);
      expect(Math.abs(seat.position.z)).toBeLessThan(CLUB.halfDepth);
    }
  });
});
