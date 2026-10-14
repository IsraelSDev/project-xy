import { describe, expect, it } from 'vitest';
import { resolveCollisions } from './collision.ts';
import { length } from './geometry.ts';
import {
  OBSTACLES,
  PROPS,
  ROOM,
  SEATS,
  SPAWN,
  SPAWN_POINTS,
  nearestFreeSeat,
  pickSpawn,
} from './lounge-layout.ts';
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

describe('assentos', () => {
  it('6 assentos (3 por sofá), cada um dentro do seu sofá e virado para fora do encosto', () => {
    expect(SEATS).toHaveLength(6);
    const sofas = PROPS.filter((prop) => prop.kind === 'sofa');
    for (const seat of SEATS) {
      const sofa = sofas.find(
        ({ box }) =>
          seat.position.x > box.minX &&
          seat.position.x < box.maxX &&
          seat.position.z > box.minZ &&
          seat.position.z < box.maxZ,
      );
      expect(sofa).toBeDefined();
      expect([0, Math.PI]).toContain(seat.heading);
    }
  });

  it('acha o assento livre mais próximo ao alcance', () => {
    const seat = SEATS[0];
    if (!seat) throw new Error('sem assentos');
    const near = { x: seat.position.x, z: seat.position.z + 0.8 };

    expect(nearestFreeSeat(near, new Set())).toBe(0);
    expect(nearestFreeSeat(near, new Set([0]))).not.toBe(0);
    expect(nearestFreeSeat({ x: -8, z: 6 }, new Set())).toBeUndefined();
  });
});
