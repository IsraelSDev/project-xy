import { describe, expect, it } from 'vitest';
import { resolveCollisions } from './collision.ts';
import { DEFAULT_MOVEMENT } from './movement.ts';
import {
  CLUB,
  HOME,
  SCENE_NAMES,
  nearestSeatKind,
  obstaclesOf,
  pickSpawn,
  sceneByName,
} from './scenes.ts';

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
      const resolved = resolveCollisions(point.position, DEFAULT_MOVEMENT.radius, obstacles);
      expect(resolved.x).toBeCloseTo(point.position.x, 5);
      expect(resolved.z).toBeCloseTo(point.position.z, 5);
    }
  });

  it('não escolhe spawn em cima de parede mesmo com o ponto principal ocupado', () => {
    const next = pickSpawn(CLUB, [CLUB.spawn.position]);
    const resolved = resolveCollisions(next.position, DEFAULT_MOVEMENT.radius, obstaclesOf(CLUB));
    expect(resolved.x).toBeCloseTo(next.position.x, 5);
    expect(resolved.z).toBeCloseTo(next.position.z, 5);
  });

  it('deixa o caminho dos degraus do bar livre (sem parede invisível)', () => {
    const obstacles = obstaclesOf(CLUB);
    for (const point of [
      { x: 0.5, z: -0.8 },
      { x: 1.5, z: -5 },
      { x: 2.4, z: -5 },
      { x: 0, z: -1 },
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
      // Os três coolers de cerveja do bar.
      { x: -3.09, z: 3.55 },
      { x: 5.44, z: 8.45 },
      { x: 1.42, z: -9.15 },
    ]) {
      const resolved = resolveCollisions(point, radius, obstacles);
      const moved = Math.hypot(resolved.x - point.x, resolved.z - point.z);
      expect(moved, `objeto em ${point.x},${point.z}`).toBeGreaterThan(0);
    }

    // O corredor entre os sofás continua livre.
    const aisle = { x: 4, z: -17 };
    expect(resolveCollisions(aisle, radius, obstacles)).toEqual(aisle);

    // As grades da plataforma do bar bloqueiam os dois trechos, mas a
    // abertura do canto nordeste continua livre (é a entrada pela escada).
    for (const point of [
      { x: 0.43, z: -8.5 },
      { x: -2, z: -1.14 },
    ]) {
      const resolved = resolveCollisions(point, radius, obstacles);
      const moved = Math.hypot(resolved.x - point.x, resolved.z - point.z);
      expect(moved, `grade em ${point.x},${point.z}`).toBeGreaterThan(0);
    }
    // O vão largo da grade (z -7,18..-4,98) é passagem livre.
    for (const point of [
      { x: 0.43, z: -5.92 },
      { x: 0.87, z: -5.92 },
    ]) {
      expect(resolveCollisions(point, radius, obstacles)).toEqual(point);
    }
    // A parede invisível que cruzava a escada norte foi recortada.
    const stair = { x: -3.4, z: -0.6 };
    expect(resolveCollisions(stair, radius, obstacles)).toEqual(stair);
    // O vão largo da grade comporta o corpo inteiro (é a passagem do bar).
    for (const point of [
      { x: 0.2, z: -5.9 },
      { x: 0.87, z: -5.92 },
    ]) {
      expect(resolveCollisions(point, radius, obstacles)).toEqual(point);
    }

    for (const opening of [
      { x: 0, z: -1.7 },
      { x: -0.4, z: -1.8 },
    ]) {
      expect(resolveCollisions(opening, radius, obstacles)).toEqual(opening);
    }
  });

  it('mantém os assentos dentro da sala', () => {
    expect(CLUB.seats.length).toBeGreaterThan(10);
    for (const seat of CLUB.seats) {
      expect(Math.abs(seat.position.x)).toBeLessThan(CLUB.halfWidth);
      expect(Math.abs(seat.position.z)).toBeLessThan(CLUB.halfDepth);
    }
  });

  it('assenta os 12 módulos de sofá e as 6 banquetas dentro dos móveis', () => {
    const inside = (
      box: { minX: number; maxX: number; minZ: number; maxZ: number },
      point: { x: number; z: number },
    ) => point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ;

    const sofas = CLUB.seats.filter((seat) => seat.kind !== 'stool');
    const stools = CLUB.seats.filter((seat) => seat.kind === 'stool');
    expect(sofas).toHaveLength(36); // 12 módulos × 3 lugares
    expect(stools).toHaveLength(6);
    for (const seat of sofas) {
      const onSofa = CLUB.props.some(
        (prop) => prop.kind === 'sofa' && inside(prop.box, seat.position),
      );
      expect(onSofa, `${seat.position.x},${seat.position.z}`).toBe(true);
    }
    for (const stool of stools) {
      const onStool = CLUB.props.some(
        (prop) => prop.kind === 'pillar' && inside(prop.box, stool.position),
      );
      expect(onStool, `${stool.position.x},${stool.position.z}`).toBe(true);
    }
    // As duas banquetas laterais (sul do balcão) olham para o balcão; as quatro da mesa
    // comprida continuam viradas para oeste.
    const sideStools = stools.filter((seat) => seat.position.z > -3);
    expect(sideStools).toHaveLength(2);
    for (const stool of sideStools) expect(stool.heading).toBeCloseTo(Math.PI);
    expect(nearestSeatKind(CLUB, sofas[0]!.position)).toBe('sofa');
    expect(nearestSeatKind(CLUB, stools[0]!.position)).toBe('stool');
    expect(nearestSeatKind(CLUB, CLUB.spawn.position)).toBeUndefined();
  });

  it('assenta cada módulo na raiz do móvel no jogo, não no centro da caixa', () => {
    const [first, middle, last] = CLUB.seats;
    // Módulo 1: raiz do `sofa_3` no jogo em (-2.085, -17.813); encosto em minX, então o quadril
    // fica 0,175 m à frente (+X) e os três lugares correm simétricos em Z.
    expect(middle!.position.x).toBeCloseTo(-2.085 + 0.175, 3);
    expect(middle!.position.z).toBeCloseTo(-17.813, 3);
    const step = (18.99 - 16.64) / 3;
    expect(first!.position.z).toBeCloseTo(-17.813 - step, 3);
    expect(last!.position.z).toBeCloseTo(-17.813 + step, 3);
    // Encosto em minX: a direita do assento é -Z, então o lugar de menor Z é a ponta direita.
    expect(first!.lateralOffset).toBeCloseTo(step, 3);
    expect(middle!.lateralOffset).toBe(0);
    expect(last!.lateralOffset).toBeCloseTo(-step, 3);
    // A caixa medida avança 4,5 cm para a frente: o assento não usa o centro dela.
    const boxCenterX = (-2.48 - 1.6) / 2;
    expect(middle!.position.x - (boxCenterX + 0.175)).toBeCloseTo(-0.045, 3);
  });

  it('assenta no sofá e na cadeira do quarto, de frente para fora do encosto', () => {
    const sofas = HOME.seats.filter((seat) => seat.kind === 'sofa');
    const chair = HOME.seats.find((seat) => seat.kind === 'chair');
    expect(sofas.length).toBeGreaterThanOrEqual(2);
    expect(chair).toBeDefined();
    for (const seat of sofas) {
      expect(seat.heading).toBeCloseTo(-Math.PI / 2);
      // Encosto na parede leste (x=2,72): o quadril fica no colchão, nunca dentro dele.
      expect(seat.position.x).toBeLessThan(2.72 - 0.4);
      expect(seat.position.z).toBeGreaterThanOrEqual(-0.48);
      expect(seat.position.z).toBeLessThanOrEqual(1.8);
    }
    expect(chair!.heading).toBeCloseTo(-Math.PI / 2);
    // Direita do assento = +Z (heading -90°): o primeiro lugar é a ponta esquerda.
    [-0.76, 0, 0.76].forEach((offset, index) =>
      expect(sofas[index]!.lateralOffset).toBeCloseTo(offset, 3),
    );
    expect(nearestSeatKind(HOME, sofas[0]!.position)).toBe('sofa');
    expect(nearestSeatKind(HOME, chair!.position)).toBe('chair');
  });

  it('a cama do quarto é um assento ancorado na raiz do móvel', () => {
    const bed = HOME.seats.find((seat) => seat.kind === 'bed');
    expect(bed).toBeDefined();
    // `Bed` no `char_editor_decor.unity` em (-0,371, -4,282) + HOME_OFFSET (0,401, 0,52);
    // cabeceira no -Z, então o heading do assento aponta para ela.
    expect(bed!.position.x).toBeCloseTo(0.03, 3);
    expect(bed!.position.z).toBeCloseTo(-3.762, 3);
    expect(bed!.heading).toBe(Math.PI);
    expect(bed!.reach).toBe(1.9);
    // A âncora dos pares é a própria raiz do móvel (aqui coincide com o ponto do quadril).
    expect(bed!.pivot ?? bed!.position).toEqual({ x: 0.03, z: -3.762 });
    expect(nearestSeatKind(HOME, bed!.position)).toBe('bed');
  });

  it('os módulos da balada guardam a raiz do móvel como pivô dos pares', () => {
    const sofas = CLUB.seats.filter((seat) => seat.kind === 'sofa');
    expect(sofas).toHaveLength(36);
    for (const seat of sofas) {
      expect(seat.pivot, `${seat.position.x},${seat.position.z}`).toBeDefined();
    }
    // O lugar do meio de cada módulo fica exatamente SOFA_HIP_FORWARD à frente da raiz; os
    // laterais ficam deslocados ao longo do comprimento, por isso a distância é maior.
    for (let module = 0; module < 12; module++) {
      const middle = sofas[module * 3 + 1]!;
      const dx = middle.position.x - middle.pivot!.x;
      const dz = middle.position.z - middle.pivot!.z;
      expect(Math.hypot(dx, dz)).toBeCloseTo(0.175, 3);
    }
  });
});
