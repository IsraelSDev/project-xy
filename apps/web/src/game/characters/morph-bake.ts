import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

/**
 * Shape keys (morph targets) do GoE aplicadas na CPU. O gerenciador de morph do Babylon guarda todas as chaves de
 * uma malha numa textura float (o corpo masculino sozinho passa de 100 MB por avatar, GPU e memória), o que não cabe
 * numa sala cheia. Aqui o container perde os gerenciadores ao carregar e guarda só os dados das chaves; cada avatar
 * recalcula as posições e normais das suas malhas a partir da base, e só das chaves em uso. Avatar sem forma
 * continua compartilhando a geometria do container, sem custo.
 */

interface MorphTarget {
  name: string;
  /** Posições absolutas da chave (o formato do Babylon), uma por vértice. */
  positions: Float32Array;
  normals: Float32Array | undefined;
}

interface MeshMorphs {
  basePositions: Float32Array;
  baseNormals: Float32Array | undefined;
  targets: MorphTarget[];
}

/** Dados das chaves por nome de malha do container. */
export type MorphLibrary = ReadonlyMap<string, MeshMorphs>;

const libraries = new WeakMap<AssetContainer, MorphLibrary>();

/** Nome que `instantiateModelsToScene` dá à cópia de uma malha do container. */
const CLONE_PREFIX = 'Clone of ';
const sourceName = (name: string) =>
  name.startsWith(CLONE_PREFIX) ? name.slice(CLONE_PREFIX.length) : name;

/**
 * Tira os morph targets das malhas do container e os guarda como biblioteca (ver `morphLibraryOf`). Chamar uma vez
 * logo depois de carregar, antes de instanciar: as cópias já nascem sem gerenciador.
 */
export function extractMorphs(container: AssetContainer): MorphLibrary {
  const found = libraries.get(container);
  if (found) return found;
  const library = new Map<string, MeshMorphs>();
  for (const mesh of container.meshes) {
    const manager = mesh.morphTargetManager;
    if (!manager || !(mesh instanceof Mesh)) continue;
    const basePositions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!basePositions) continue;
    const targets: MorphTarget[] = [];
    for (let index = 0; index < manager.numTargets; index++) {
      const target = manager.getTarget(index);
      const positions = target.getPositions();
      if (!positions) continue;
      targets.push({
        name: target.name,
        positions: Float32Array.from(positions),
        normals: target.getNormals() ? Float32Array.from(target.getNormals()!) : undefined,
      });
    }
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    library.set(mesh.name, {
      basePositions: Float32Array.from(basePositions),
      baseNormals: normals ? Float32Array.from(normals) : undefined,
      targets,
    });
    mesh.morphTargetManager = null;
    manager.dispose();
  }
  libraries.set(container, library);
  return library;
}

/** Biblioteca de chaves de um container já passado por `extractMorphs` (vazia se não houver). */
export const morphLibraryOf = (container: AssetContainer): MorphLibrary =>
  libraries.get(container) ?? new Map();

interface MeshState {
  /**
   * A malha já tem geometria própria e buffers atualizáveis (a do container é compartilhada entre os avatares e
   * o glTF a carrega em buffers estáticos, que o Babylon não deixa regravar).
   */
  dynamic: boolean;
  /** Chaves e pesos aplicados por último, para não recalcular à toa. */
  signature: string;
}

const states = new WeakMap<AbstractMesh, MeshState>();

/**
 * Deformação extra, por posição, ligada à influência de uma chave (`key`): vale em toda malha que o avatar usa,
 * tenha ela a chave ou não (a roupa precisa acompanhar o corpo). `apply` altera `positions` no lugar.
 */
export interface MorphBoost {
  key: string;
  /**
   * `normals` são as normais de repouso da malha (ou `undefined`); `clothing` é verdadeiro nas peças que vestem o
   * corpo (a pele não é roupa): elas precisam manter a folga que têm sobre o corpo; `name` é o nome da malha.
   */
  apply(
    positions: Float32Array,
    weight: number,
    context: { normals: Float32Array | undefined; clothing: boolean; name: string },
  ): void;
}

/**
 * Ajuste só do corpo nu por baixo da roupa (`key` identifica o conjunto, para a assinatura): `apply` altera
 * `positions` no lugar, com as normais de repouso da malha.
 */
export interface UnderClothes {
  key: string;
  apply(positions: Float32Array, normals: Float32Array): void;
}

/** Soma `weight * (alvo - base)` em `out` (posições ou normais, o mesmo tamanho nos três arrays). */
function accumulate(out: Float32Array, target: Float32Array, base: Float32Array, weight: number) {
  for (let i = 0; i < out.length; i++) out[i]! += weight * (target[i]! - base[i]!);
}

function normalize(normals: Float32Array) {
  for (let i = 0; i + 2 < normals.length; i += 3) {
    const x = normals[i]!;
    const y = normals[i + 1]!;
    const z = normals[i + 2]!;
    const length = Math.hypot(x, y, z) || 1;
    normals[i] = x / length;
    normals[i + 1] = y / length;
    normals[i + 2] = z / length;
  }
}

/** Vértices na mesma posição (as bordas de UV duplicam vértices) viram um grupo, para a normal não abrir costura. */
interface Welds {
  group: Uint32Array;
  count: number;
}

const weldCache = new WeakMap<MeshMorphs, Welds>();

function weldsOf(data: MeshMorphs): Welds {
  let welds = weldCache.get(data);
  if (!welds) {
    const ids = new Map<string, number>();
    const total = data.basePositions.length / 3;
    const group = new Uint32Array(total);
    for (let i = 0; i < total; i++) {
      const key = `${Math.round(data.basePositions[i * 3]! * 1e4)},${Math.round(data.basePositions[i * 3 + 1]! * 1e4)},${Math.round(data.basePositions[i * 3 + 2]! * 1e4)}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
      }
      group[i] = id;
    }
    welds = { group, count: ids.size };
    weldCache.set(data, welds);
  }
  return welds;
}

/** Normais suaves de `positions` (média das faces por posição, ponderada pela área), uma por vértice. */
function smoothNormals(
  positions: Float32Array,
  indices: ArrayLike<number>,
  welds: Welds,
): Float32Array {
  const sums = new Float32Array(welds.count * 3);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t]! * 3;
    const b = indices[t + 1]! * 3;
    const c = indices[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const vertex of [indices[t]!, indices[t + 1]!, indices[t + 2]!]) {
      const g = welds.group[vertex]! * 3;
      sums[g] = sums[g]! + nx;
      sums[g + 1] = sums[g + 1]! + ny;
      sums[g + 2] = sums[g + 2]! + nz;
    }
  }
  const out = new Float32Array(positions.length);
  for (let i = 0; i < welds.group.length; i++) {
    const g = welds.group[i]! * 3;
    const length = Math.hypot(sums[g]!, sums[g + 1]!, sums[g + 2]!) || 1;
    out[i * 3] = sums[g]! / length;
    out[i * 3 + 1] = sums[g + 1]! / length;
    out[i * 3 + 2] = sums[g + 2]! / length;
  }
  return out;
}

/** Grava o buffer: o primeiro `apply` troca o estático por um atualizável, os seguintes só regravam. */
function write(mesh: Mesh, state: MeshState, kind: string, data: Float32Array) {
  if (state.dynamic) mesh.updateVerticesData(kind, data, kind === VertexBuffer.PositionKind);
  else mesh.setVerticesData(kind, data, true);
}

/**
 * Aplica a influência (0..1) das shape keys, por nome, nas cópias de malha de `library`. A mesma chave existe no
 * corpo, nas roupas, no cabelo, nos olhos...: no .blend elas seguem o corpo por driver, e aqui por esta função.
 * Chave ausente em `morphs` conta 0; malha sem chave em uso volta à forma original.
 */
export function applyMorphs(
  meshes: readonly AbstractMesh[],
  library: MorphLibrary,
  morphs: Readonly<Partial<Record<string, number>>>,
  boosts: readonly MorphBoost[] = [],
  underClothes?: UnderClothes,
): void {
  const boosted = boosts.filter((boost) => (morphs[boost.key] ?? 0) > 0);
  for (const mesh of meshes) {
    const data = library.get(sourceName(mesh.name));
    if (!data || !(mesh instanceof Mesh)) continue;
    const active = data.targets.filter((target) => (morphs[target.name] ?? 0) > 0);
    const under = underClothes && /body/i.test(mesh.name) ? underClothes : undefined;
    const signature = [
      ...active.map((target) => `${target.name}:${morphs[target.name]}`),
      ...boosted.map((boost) => `+${boost.key}:${morphs[boost.key]}`),
      ...(under ? [`~${under.key}`] : []),
    ].join('|');
    const state = states.get(mesh) ?? { dynamic: false, signature: '' };
    states.set(mesh, state);
    if (state.signature === signature) continue;
    state.signature = signature;
    if (!state.dynamic) mesh.makeGeometryUnique();
    const positions = Float32Array.from(data.basePositions);
    for (const target of active) {
      accumulate(positions, target.positions, data.basePositions, morphs[target.name]!);
    }
    const clothing = !/body|teeth|tongue|eyes/i.test(mesh.name);
    const beforeBoost = boosted.length > 0 ? Float32Array.from(positions) : undefined;
    for (const boost of boosted) {
      boost.apply(positions, morphs[boost.key]!, {
        normals: data.baseNormals,
        clothing,
        name: sourceName(mesh.name),
      });
    }
    if (under && data.baseNormals) under.apply(positions, data.baseNormals);
    write(mesh, state, VertexBuffer.PositionKind, positions);
    if (data.baseNormals) {
      const normals = Float32Array.from(data.baseNormals);
      for (const target of active) {
        if (target.normals)
          accumulate(normals, target.normals, data.baseNormals, morphs[target.name]!);
      }
      // O reforço mexe nos vértices sem normais próprias: soma a variação das normais suaves (depois menos antes),
      // que mantém as arestas duras e as costuras da peça e só acompanha a deformação.
      const indices = beforeBoost ? mesh.getIndices() : null;
      if (beforeBoost && indices) {
        const welds = weldsOf(data);
        const before = smoothNormals(beforeBoost, indices, welds);
        const after = smoothNormals(positions, indices, welds);
        for (let i = 0; i < normals.length; i++) normals[i] = normals[i]! + after[i]! - before[i]!;
      }
      normalize(normals);
      write(mesh, state, VertexBuffer.NormalKind, normals);
    }
    state.dynamic = true;
  }
}
