/**
 * Proje├º├úo de decalque sobre a malha do corpo. Em vez de um plano reto colado no osso, o decalque vira um peda├ºo da
 * pr├│pria pele: os tri├óngulos do corpo que caem dentro da caixa do decalque, com UV por proje├º├úo planar. Assim ele
 * acompanha a curvatura (bra├ºo, coxa, peito) e, com os mesmos pesos de pele do corpo, deforma junto com a pose.
 *
 * Tudo aqui ├⌐ matem├ítica pura sobre arrays (sem Babylon), para poder testar com malhas sint├⌐ticas.
 */

type Vec3 = readonly [number, number, number];

/** Caixa do decalque no espa├ºo das posi├º├╡es `posed`: origem na pele, eixos do plano e lado (m). */
export interface DecalFrame {
  origin: Vec3;
  /** Dire├º├úo em que a coordenada U da textura cresce. */
  x: Vec3;
  /** Dire├º├úo em que a coordenada V da textura cresce. */
  y: Vec3;
  /** Eixo da proje├º├úo (a normal do plano); o sentido "para fora" ├⌐ decidido pela malha. */
  z: Vec3;
  size: number;
}

/** Peda├ºo da malha escolhido: v├⌐rtices de origem (sem repetir), tri├óngulos j├í reindexados e UV de cada v├⌐rtice. */
export interface DecalPatch {
  /** ├ìndice, na malha de origem, de cada v├⌐rtice do peda├ºo. */
  vertices: number[];
  /** Tri├óngulos como trios de ├¡ndices dentro de `vertices`. */
  triangles: number[];
  /** U e V de cada v├⌐rtice (2 n├║meros por v├⌐rtice). */
  uvs: number[];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function normalized(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Quanto da caixa, al├⌐m do tamanho do decalque, ainda entra (a textura ├⌐ transparente nas bordas). */
const MARGIN = 1.15;
/** Profundidade aceita atr├ís e ├á frente da pele no ponto de origem, em m├║ltiplos do lado. */
const DEPTH_BEHIND = 0.6;
const DEPTH_FRONT = 0.3;
/** Tri├óngulos de lado (cosseno com o eixo) abaixo disto ficam de fora: seriam s├│ uma faixa esticada. */
const MIN_FACING = 0.15;

/** Skinning na CPU: posi├º├úo (ou normal, com `direction`) de cada v├⌐rtice com as matrizes de osso atuais. */
export function skinVertices(
  source: ArrayLike<number>,
  joints: ArrayLike<number>,
  weights: ArrayLike<number>,
  matrices: ArrayLike<number>,
  influences: number,
  direction = false,
): Float32Array {
  const out = new Float32Array(source.length);
  const count = source.length / 3;
  for (let vertex = 0; vertex < count; vertex++) {
    const x = source[vertex * 3]!;
    const y = source[vertex * 3 + 1]!;
    const z = source[vertex * 3 + 2]!;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    for (let slot = 0; slot < influences; slot++) {
      const weight = weights[vertex * influences + slot]!;
      if (weight === 0) continue;
      const m = (joints[vertex * influences + slot] ?? 0) * 16;
      const w = direction ? 0 : 1;
      rx +=
        weight *
        (x * matrices[m]! + y * matrices[m + 4]! + z * matrices[m + 8]! + w * matrices[m + 12]!);
      ry +=
        weight *
        (x * matrices[m + 1]! +
          y * matrices[m + 5]! +
          z * matrices[m + 9]! +
          w * matrices[m + 13]!);
      rz +=
        weight *
        (x * matrices[m + 2]! +
          y * matrices[m + 6]! +
          z * matrices[m + 10]! +
          w * matrices[m + 14]!);
    }
    out[vertex * 3] = rx;
    out[vertex * 3 + 1] = ry;
    out[vertex * 3 + 2] = rz;
  }
  return out;
}

/**
 * Escolhe os tri├óngulos da malha que recebem o decalque. `posed` e `normals` est├úo no mesmo espa├ºo do `frame` (a pose
 * atual); devolve `undefined` se a origem n├úo estiver sobre a malha.
 */
export function selectDecalPatch(
  posed: ArrayLike<number>,
  normals: ArrayLike<number>,
  indices: ArrayLike<number>,
  frame: DecalFrame,
): DecalPatch | undefined {
  const x = normalized(frame.x);
  const y = normalized(frame.y);
  const z = normalized(frame.z);
  const half = frame.size / 2;
  const at = (vertex: number): Vec3 => [
    posed[vertex * 3]!,
    posed[vertex * 3 + 1]!,
    posed[vertex * 3 + 2]!,
  ];
  const normalAt = (vertex: number): Vec3 => [
    normals[vertex * 3]!,
    normals[vertex * 3 + 1]!,
    normals[vertex * 3 + 2]!,
  ];

  // Sentido "para fora": a m├⌐dia das normais da pele junto da origem (o eixo do plano pode apontar para os dois lados).
  let sum: [number, number, number] = [0, 0, 0];
  let seeds = 0;
  for (let vertex = 0; vertex < posed.length / 3; vertex++) {
    const d = sub(at(vertex), frame.origin);
    if (Math.abs(dot(d, x)) > half * 0.5 || Math.abs(dot(d, y)) > half * 0.5) continue;
    if (Math.abs(dot(d, z)) > frame.size * 0.5) continue;
    const n = normalAt(vertex);
    sum = [sum[0] + n[0], sum[1] + n[1], sum[2] + n[2]];
    seeds += 1;
  }
  if (seeds === 0) return undefined;
  const outward = dot(sum, z) >= 0 ? 1 : -1;
  const axis: Vec3 = [z[0] * outward, z[1] * outward, z[2] * outward];

  const lateral = half * MARGIN;
  const used = new Map<number, number>();
  const patch: DecalPatch = { vertices: [], triangles: [], uvs: [] };
  const take = (vertex: number): number => {
    const found = used.get(vertex);
    if (found !== undefined) return found;
    const d = sub(at(vertex), frame.origin);
    const index = patch.vertices.length;
    patch.vertices.push(vertex);
    patch.uvs.push(0.5 + dot(d, x) / frame.size, 0.5 + dot(d, y) / frame.size);
    used.set(vertex, index);
    return index;
  };

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const corners = [indices[t]!, indices[t + 1]!, indices[t + 2]!] as const;
    const points = corners.map(at);
    const center: Vec3 = [
      (points[0]![0] + points[1]![0] + points[2]![0]) / 3,
      (points[0]![1] + points[1]![1] + points[2]![1]) / 3,
      (points[0]![2] + points[1]![2] + points[2]![2]) / 3,
    ];
    const d = sub(center, frame.origin);
    if (Math.abs(dot(d, x)) > lateral || Math.abs(dot(d, y)) > lateral) continue;
    // Altura em rela├º├úo ├á pele na origem, medida para fora.
    const height = dot(d, axis);
    if (height > frame.size * DEPTH_FRONT || height < -frame.size * DEPTH_BEHIND) continue;
    const facing =
      (dot(normalAt(corners[0]), axis) +
        dot(normalAt(corners[1]), axis) +
        dot(normalAt(corners[2]), axis)) /
      3;
    if (facing < MIN_FACING) continue;
    patch.triangles.push(take(corners[0]), take(corners[1]), take(corners[2]));
  }
  return patch.triangles.length > 0 ? patch : undefined;
}
