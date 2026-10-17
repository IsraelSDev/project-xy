import type { PosePreset } from './goe-poses';

/**
 * Clipes de animação do GoE (Universal Animation Library, CC0, retargetada para o rig do pacote; ver
 * `tools/goe/anim/` e `public/assets/goe/clips/clips-<gênero>.json`). Cada clipe é um ciclo de `frames`
 * quadros; por osso, `frames * 7` números `[x, y, z, qx, qy, qz, qw]` (transform local no rig de jogo, como as poses).
 */
export interface Clip {
  frames: number;
  /** Distância (m) percorrida em um ciclo, nos clipes de locomoção; 0 = o clipe corre pelo relógio. */
  stride: number;
  bones: Record<string, readonly number[]>;
}

export interface ClipLibrary {
  fps: number;
  clips: ReadonlyMap<string, Clip>;
}

type Gender = 'male' | 'female';

interface ClipFile {
  fps: number;
  clips: Record<string, Clip>;
}

const libraries = new Map<Gender, Promise<ClipLibrary>>();

/** Carrega os clipes do gênero uma vez (arquivo global, não por cena). */
export function loadClipLibrary(gender: Gender): Promise<ClipLibrary> {
  let loading = libraries.get(gender);
  if (!loading) {
    loading = fetch(`/assets/goe/clips/clips-${gender}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`clipes: HTTP ${response.status}`);
        return response.json() as Promise<ClipFile>;
      })
      .then((file) => ({ fps: file.fps, clips: new Map(Object.entries(file.clips)) }))
      .catch((error: unknown) => {
        libraries.delete(gender);
        throw error;
      });
    libraries.set(gender, loading);
  }
  return loading;
}

/** Duração do ciclo em segundos. */
export const clipDuration = (library: ClipLibrary, clip: Clip): number => clip.frames / library.fps;

const FADE_SECONDS = 0.25;
/** Cadência máxima da locomoção, em múltiplos da velocidade original do clipe. */
const MAX_PACE = 1.6;
const BONE_WIDTH = 7;

/** Transform do osso entre os quadros `a` e `b` (fração `t`), em `out`; rotação pelo lado curto e normalizada. */
function sampleBone(bone: readonly number[], a: number, b: number, t: number, out: number[]): void {
  const from = a * BONE_WIDTH;
  const to = b * BONE_WIDTH;
  const at = (offset: number, fallback = 0) => bone[from + offset] ?? fallback;
  const bt = (offset: number, fallback = 0) => bone[to + offset] ?? fallback;
  for (let i = 0; i < 3; i++) out[i] = at(i) + (bt(i) - at(i)) * t;
  const sign = at(3) * bt(3) + at(4) * bt(4) + at(5) * bt(5) + at(6, 1) * bt(6, 1) < 0 ? -1 : 1;
  for (let i = 3; i < BONE_WIDTH; i++) {
    const fallback = i === 6 ? 1 : 0;
    out[i] = at(i, fallback) + (sign * bt(i, fallback) - at(i, fallback)) * t;
  }
  normalize(out);
}

function normalize(q: number[]): void {
  const length = Math.hypot(q[3] ?? 0, q[4] ?? 0, q[5] ?? 0, q[6] ?? 1) || 1;
  for (let i = 3; i < BONE_WIDTH; i++) q[i] = (q[i] ?? 0) / length;
}

/** `target` passa a ser `target` misturado com `sample` (peso de `sample` entre 0 e 1). */
function mixInto(target: number[], sample: readonly number[], weight: number): void {
  const dot =
    (target[3] ?? 0) * (sample[3] ?? 0) +
    (target[4] ?? 0) * (sample[4] ?? 0) +
    (target[5] ?? 0) * (sample[5] ?? 0) +
    (target[6] ?? 1) * (sample[6] ?? 1);
  const sign = dot < 0 ? -1 : 1;
  for (let i = 0; i < BONE_WIDTH; i++) {
    const value = i >= 3 ? sign * (sample[i] ?? 0) : (sample[i] ?? 0);
    target[i] = (target[i] ?? 0) + (value - (target[i] ?? 0)) * weight;
  }
  normalize(target);
}

/** O que o avatar está fazendo neste quadro: o clipe pedido e o quanto andou (m) desde o quadro anterior. */
export interface ClipRequest {
  clip: string;
  distance: number;
  /** Toca o clipe pelo relógio mesmo sendo de locomoção (diagnóstico: ver o ciclo com o avatar parado). */
  forced?: boolean;
}

interface Track {
  name: string;
  /** Posição no ciclo, de 0 (inclusive) a `frames` (exclusive). */
  cursor: number;
}

/**
 * Toca clipes num avatar: avança o ciclo (pelo relógio, ou pela distância andada nos clipes de locomoção, para o
 * pé não patinar), mistura o clipe anterior com o novo e devolve a pose pronta (o mesmo objeto, reescrito a cada
 * `update`) para `setPosePreset`.
 */
export class ClipPlayer {
  private readonly frame: PosePreset;
  private readonly bones: Record<string, number[]> = {};
  private current: Track | undefined;
  private previous: Track | undefined;
  private fade = 1;
  private readonly scratch = [0, 0, 0, 0, 0, 0, 1];

  constructor(private readonly library: ClipLibrary) {
    this.frame = { bones: this.bones };
  }

  /** Há clipe com esse nome na biblioteca? */
  has(name: string): boolean {
    return this.library.clips.has(name);
  }

  /** Clipe em primeiro plano (o último pedido que existe). */
  get playing(): string | undefined {
    return this.current?.name;
  }

  update(request: ClipRequest, dt: number): PosePreset {
    const wanted = this.library.clips.has(request.clip) ? request.clip : 'idle';
    if (!this.current) {
      this.current = { name: wanted, cursor: 0 };
    } else if (this.current.name !== wanted) {
      this.previous = this.current;
      this.current = { name: wanted, cursor: 0 };
      this.fade = 0;
    }
    this.advance(this.current, request, dt);
    if (this.previous) {
      this.advance(this.previous, request, dt);
      this.fade += dt / FADE_SECONDS;
      if (this.fade >= 1) {
        this.previous = undefined;
        this.fade = 1;
      }
    }
    if (this.previous) this.write(this.previous, 1);
    this.write(this.current, this.previous ? this.fade : 1);
    return this.frame;
  }

  private advance(track: Track, request: ClipRequest, dt: number): void {
    const clip = this.library.clips.get(track.name);
    if (!clip) return;
    const natural = dt / clipDuration(this.library, clip);
    // Locomoção: um ciclo por `stride` metros (o pé não patina), mas a cadência não passa de `MAX_PACE` vezes a do clipe:
    // o jogador mais rápido que o clipe vira passada apressada, não perna de desenho animado.
    const cycles =
      !request.forced && clip.stride > 0
        ? Math.min(request.distance / clip.stride, natural * MAX_PACE)
        : natural;
    track.cursor =
      (((track.cursor + cycles * clip.frames) % clip.frames) + clip.frames) % clip.frames;
  }

  private write(track: Track, weight: number): void {
    const clip = this.library.clips.get(track.name);
    if (!clip) return;
    const a = Math.floor(track.cursor) % clip.frames;
    const b = (a + 1) % clip.frames;
    const t = track.cursor - Math.floor(track.cursor);
    for (const [name, bone] of Object.entries(clip.bones)) {
      const out = (this.bones[name] ??= [0, 0, 0, 0, 0, 0, 1]);
      if (weight >= 1) {
        sampleBone(bone, a, b, t, out);
      } else {
        sampleBone(bone, a, b, t, this.scratch);
        mixInto(out, this.scratch, weight);
      }
    }
  }
}
