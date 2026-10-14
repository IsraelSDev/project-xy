/** Vetor no plano do chão (XZ). Y fica de fora: o avatar anda sobre um piso plano. */
export interface Vec2 {
  x: number;
  z: number;
}

/** Retângulo alinhado aos eixos no plano do chão, usado como obstáculo de colisão. */
export interface Box2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.z);
}

/** Normaliza `v`; vetores nulos (ou quase) viram (0, 0). */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  return len < 1e-9 ? { x: 0, z: 0 } : { x: v.x / len, z: v.z / len };
}
