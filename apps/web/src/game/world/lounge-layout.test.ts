import { describe, expect, it } from 'vitest';
import { resolveCollisions } from '../movement/collision';
import { DEFAULT_MOVEMENT } from '../movement/movement';
import { PROPS, ROOM, SPAWN, OBSTACLES } from './lounge-layout';

describe('layout do lounge', () => {
  it('o spawn não colide com nada', () => {
    expect(resolveCollisions(SPAWN.position, DEFAULT_MOVEMENT.radius, OBSTACLES)).toEqual(
      SPAWN.position,
    );
  });

  it.each(PROPS.map((prop) => [prop.name, prop] as const))('%s fica dentro da sala', (_, prop) => {
    expect(prop.box.minX).toBeGreaterThanOrEqual(-ROOM.halfWidth);
    expect(prop.box.maxX).toBeLessThanOrEqual(ROOM.halfWidth);
    expect(prop.box.minZ).toBeGreaterThanOrEqual(-ROOM.halfDepth);
    expect(prop.box.maxZ).toBeLessThanOrEqual(ROOM.halfDepth);
    expect(prop.box.minX).toBeLessThan(prop.box.maxX);
    expect(prop.box.minZ).toBeLessThan(prop.box.maxZ);
  });
});
