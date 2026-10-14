import { describe, expect, it } from 'vitest';
import { resolveCollisions } from './collision.ts';
import { length } from './geometry.ts';
import { OBSTACLES, PROPS, ROOM, SPAWN, SPAWN_POINTS, pickSpawn } from './lounge-layout.ts';
import { DEFAULT_MOVEMENT } from './movement.ts';

describe('layout do lounge', () => {
  it.each(SPAWN_POINTS.map((point, index) => [index, point] as const))(
    'ponto de entrada %i não colide com nada',
    (_, point) => {
      expect(resolveCollisions(point.position, DEFAULT_MOVEMENT.radius, OBSTACLES)).toEqual(
        point.position,
      );
    },
  );

  it.each(PROPS.map((prop) => [prop.name, prop] as const))('%s fica dentro da sala', (_, prop) => {
    expect(prop.box.minX).toBeGreaterThanOrEqual(-ROOM.halfWidth);
    expect(prop.box.maxX).toBeLessThanOrEqual(ROOM.halfWidth);
    expect(prop.box.minZ).toBeGreaterThanOrEqual(-ROOM.halfDepth);
    expect(prop.box.maxZ).toBeLessThanOrEqual(ROOM.halfDepth);
    expect(prop.box.minX).toBeLessThan(prop.box.maxX);
    expect(prop.box.minZ).toBeLessThan(prop.box.maxZ);
  });
});

describe('pickSpawn', () => {
  it('sala vazia: usa o spawn principal', () => {
    expect(pickSpawn([])).toBe(SPAWN);
  });

  it('não coloca dois jogadores no mesmo lugar', () => {
    const next = pickSpawn([SPAWN.position]);
    const distance = length({
      x: next.position.x - SPAWN.position.x,
      z: next.position.z - SPAWN.position.z,
    });
    expect(distance).toBeGreaterThanOrEqual(0.9);
  });

  it('com todos os pontos ocupados, ainda devolve um ponto válido', () => {
    const occupied = SPAWN_POINTS.map((point) => point.position);
    expect(SPAWN_POINTS).toContain(pickSpawn(occupied));
  });
});
