import { describe, expect, it } from 'vitest';
import { selectDecalPatch, skinVertices, type DecalFrame } from './decal-projection';

/** Cilindro em pé (eixo Y) de raio `radius`: o "braço" onde o decalque tem que dar a volta. */
function cylinder(radius: number, height: number, segments: number, rings: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const y = (ring / rings - 0.5) * height;
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * 2 * Math.PI;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      normals.push(Math.cos(angle), 0, Math.sin(angle));
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = ring * segments + segment;
      const b = ring * segments + ((segment + 1) % segments);
      indices.push(a, b, a + segments, b, b + segments, a + segments);
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices,
  };
}

/** Decalque na face +X do cilindro: U cresce para +Z, V para cima, eixo da projeção para fora (+X). */
const frame = (overrides: Partial<DecalFrame> = {}): DecalFrame => ({
  origin: [0.05, 0, 0],
  x: [0, 0, 1],
  y: [0, 1, 0],
  z: [1, 0, 0],
  size: 0.06,
  ...overrides,
});

describe('selectDecalPatch', () => {
  const mesh = cylinder(0.05, 0.3, 48, 12);

  it('pega só a pele da frente e dá a volta na curva, em vez de uma placa reta', () => {
    const patch = selectDecalPatch(mesh.positions, mesh.normals, mesh.indices, frame());
    expect(patch).toBeDefined();
    const xs = patch!.vertices.map((vertex) => mesh.positions[vertex * 3]!);
    // Só o lado de +X: nenhum vértice das costas do cilindro.
    expect(Math.min(...xs)).toBeGreaterThan(0.01);
    // E o pedaço acompanha a curvatura: a profundidade varia (uma placa reta teria X constante).
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.006);
    // Fica perto do centro em altura: o decalque tem ~6 cm.
    const ys = patch!.vertices.map((vertex) => mesh.positions[vertex * 3 + 1]!);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThan(0.06);
  });

  it('UV por projeção planar: o centro cai em 0,5 e a textura não espelha', () => {
    const patch = selectDecalPatch(mesh.positions, mesh.normals, mesh.indices, frame())!;
    // Vértice na origem (ângulo 0, altura 0) -> UV (0.5, 0.5).
    const centerIndex = patch.vertices.findIndex(
      (vertex) =>
        Math.abs(mesh.positions[vertex * 3 + 1]!) < 1e-6 &&
        Math.abs(mesh.positions[vertex * 3 + 2]!) < 1e-6,
    );
    expect(centerIndex).toBeGreaterThanOrEqual(0);
    expect(patch.uvs[centerIndex * 2]).toBeCloseTo(0.5);
    expect(patch.uvs[centerIndex * 2 + 1]).toBeCloseTo(0.5);
    // U cresce para +Z e V para cima.
    for (let i = 0; i < patch.vertices.length; i++) {
      const vertex = patch.vertices[i]!;
      const z = mesh.positions[vertex * 3 + 2]!;
      const y = mesh.positions[vertex * 3 + 1]!;
      expect(patch.uvs[i * 2]).toBeCloseTo(0.5 + z / 0.06, 5);
      expect(patch.uvs[i * 2 + 1]).toBeCloseTo(0.5 + y / 0.06, 5);
    }
  });

  it('o eixo do plano pode apontar para dentro: o lado de fora é decidido pela malha', () => {
    const outward = selectDecalPatch(mesh.positions, mesh.normals, mesh.indices, frame())!;
    const flipped = selectDecalPatch(
      mesh.positions,
      mesh.normals,
      mesh.indices,
      frame({ z: [-1, 0, 0] }),
    )!;
    expect(flipped.vertices.sort()).toEqual(outward.vertices.sort());
  });

  it('triângulos reindexados apontam só para vértices do pedaço', () => {
    const patch = selectDecalPatch(mesh.positions, mesh.normals, mesh.indices, frame())!;
    expect(patch.triangles.length % 3).toBe(0);
    for (const index of patch.triangles) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(patch.vertices.length);
    }
    expect(new Set(patch.vertices).size).toBe(patch.vertices.length);
  });

  it('sem pele perto da origem não há pedaço (quem chama usa o plano reto)', () => {
    expect(
      selectDecalPatch(mesh.positions, mesh.normals, mesh.indices, frame({ origin: [1, 0, 0] })),
    ).toBeUndefined();
  });

  it('não pega a pele de outra parte que passa atrás (ex.: o tronco atrás do braço)', () => {
    // Um segundo cilindro 8 cm atrás da face do decalque, com a normal também para +X: fica fora da profundidade aceita.
    const behind = cylinder(0.05, 0.3, 48, 12);
    for (let i = 0; i < behind.positions.length; i += 3)
      behind.positions[i] = behind.positions[i]! - 0.14;
    const positions = Float32Array.from([...mesh.positions, ...behind.positions]);
    const normals = Float32Array.from([...mesh.normals, ...behind.normals]);
    const offset = mesh.positions.length / 3;
    const indices = [...mesh.indices, ...behind.indices.map((index) => index + offset)];
    const patch = selectDecalPatch(positions, normals, indices, frame())!;
    expect(Math.max(...patch.vertices)).toBeLessThan(offset);
  });
});

describe('skinVertices', () => {
  // Duas matrizes de osso (row-major do Babylon): identidade e translação de +1 em X.
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const shifted = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1];
  const matrices = [...identity, ...shifted];

  it('mistura as matrizes pelos pesos', () => {
    const out = skinVertices(
      Float32Array.from([0, 0, 0, 0, 0, 0]),
      [0, 1, 0, 1],
      [1, 0, 0.25, 0.75],
      matrices,
      2,
    );
    expect([...out]).toEqual([0, 0, 0, 0.75, 0, 0]);
  });

  it('normais (direção) ignoram a translação', () => {
    const out = skinVertices(Float32Array.from([0, 1, 0]), [1], [1], matrices, 1, true);
    expect([...out]).toEqual([0, 1, 0]);
  });
});
