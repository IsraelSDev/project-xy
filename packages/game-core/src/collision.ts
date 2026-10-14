import type { Box2, Vec2 } from './geometry.ts';

/**
 * Empurra um círculo (corpo do avatar) para fora de todos os obstáculos que ele invade.
 * Resolve um obstáculo por vez pela menor penetração, o que faz o avatar deslizar
 * rente às paredes em vez de travar. Algumas iterações cobrem cantos entre dois obstáculos.
 */
export function resolveCollisions(
  position: Vec2,
  radius: number,
  obstacles: readonly Box2[],
): Vec2 {
  let { x, z } = position;

  for (let iteration = 0; iteration < 4; iteration++) {
    let moved = false;

    for (const box of obstacles) {
      const closestX = clamp(x, box.minX, box.maxX);
      const closestZ = clamp(z, box.minZ, box.maxZ);
      const dx = x - closestX;
      const dz = z - closestZ;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq >= radius * radius) continue;

      if (distanceSq > 1e-12) {
        // Centro fora da caixa: afasta na direção do ponto mais próximo.
        const distance = Math.sqrt(distanceSq);
        const push = radius - distance;
        x += (dx / distance) * push;
        z += (dz / distance) * push;
      } else {
        // Centro dentro da caixa: sai pela face mais próxima.
        const exits = [
          { axis: 'x', value: box.minX - radius, cost: x - box.minX },
          { axis: 'x', value: box.maxX + radius, cost: box.maxX - x },
          { axis: 'z', value: box.minZ - radius, cost: z - box.minZ },
          { axis: 'z', value: box.maxZ + radius, cost: box.maxZ - z },
        ] as const;
        const exit = exits.reduce((best, candidate) =>
          candidate.cost < best.cost ? candidate : best,
        );
        if (exit.axis === 'x') x = exit.value;
        else z = exit.value;
      }
      moved = true;
    }

    if (!moved) break;
  }

  return { x, z };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
