import { BODY_BUILD_MORPHS, type AvatarConfig } from '@3dx/contracts';
import type { MorphBoost, UnderClothes } from './morph-bake';

/**
 * Formas efetivas do avatar: o físico da aba Corpo por baixo e a aba Formas (`config.morphs`) por cima, que tem
 * prioridade. O JSON do avatar guarda só as chaves explícitas; o preset do físico é derivado de `body` aqui. O corpo e
 * as peças usam o mesmo resultado, senão a roupa não acompanha o físico.
 */
export function effectiveMorphs(config: AvatarConfig): Readonly<Partial<Record<string, number>>> {
  return { ...(BODY_BUILD_MORPHS[config.body] ?? {}), ...config.morphs };
}

const smooth = (value: number, low: number, high: number): number => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** Interpolação linear em tabela (`xs` crescente), presa nas pontas. */
const lerpTable = (value: number, xs: readonly number[], ys: readonly number[]): number => {
  const last = xs.length - 1;
  if (value <= xs[0]!) return ys[0]!;
  if (value >= xs[last]!) return ys[last]!;
  let i = 0;
  while (value > xs[i + 1]!) i++;
  const t = (value - xs[i]!) / (xs[i + 1]! - xs[i]!);
  return ys[i]! + (ys[i + 1]! - ys[i]!) * t;
};

/** Janela suave em torno de `center` (1 no centro, 0 a `width` de distância). */
const bump = (value: number, center: number, width: number): number => {
  const t = Math.max(0, 1 - ((value - center) / width) ** 2);
  return t * t;
};

// Corte do tronco e dos braços do GoE masculino, em metros, no espaço do modelo (x lateral, y para cima, z para a
// frente; o repouso é em T, braços ao longo de x a ~1,45 m de altura).
// Eixo do braço por |x| (o antebraço sai para a frente: z do centro da seção sobe do cotovelo ao punho).
const ARM_AXIS_X = [0.25, 0.3, 0.4, 0.5, 0.6, 0.7] as const;
const ARM_AXIS_Y = [1.443, 1.45, 1.453, 1.458, 1.459, 1.459] as const;
const ARM_AXIS_Z = [-0.048, -0.045, -0.03, 0, 0.05, 0.11] as const;
/** Eixo da perna (x do centro da seção, de cada lado, e z), da panturrilha à coxa. */
const LEG_AXIS_X = 0.092;
const LEG_AXIS_Z = -0.005;
/** Quanto a seção do braço e da perna cresce (fração do raio) com a influência cheia. */
const ARM_GIRTH = 0.3;
const LEG_GIRTH = 0.26;
/** Folga típica entre a roupa e a pele (m): a roupa a mantém onde o campo deforma o corpo depressa. */
const CLOTH_GAP = 0.01;
/**
 * Folga extra da roupa na parte de cima com a influência cheia (m). A chave do pacote deforma o corpo um pouco mais que a
 * roupa nos ombros e na omoplata (a pele aparecia pela manga com o físico musculoso, mesmo sem o campo abaixo).
 */
const CLOTH_UPPER_BODY_PUSH = 0.012;
/**
 * Peças da parte de baixo: não levam a folga acima. A camiseta e o moletom a levam desde a barra (y ~1,0 m), senão a
 * cintura da calça, que a chave do pacote empurra para fora, atravessa a barra.
 */
const LOWER_GARMENT = /pants|shorts|boots|shoes/i;

/**
 * Reforço do físico: o `BodyBodybuilderSize` do pacote mexe pouco na parte de cima (peito ~2,7 cm, ombro ~1,9 cm) e
 * deixa o tronco pequeno perto das pernas. Este campo, por posição, soma por cima: peitoral para a frente, caixa
 * torácica e dorsais mais largas, ombros mais largos e deltoides/braços mais grossos, trapézio mais alto e braços mais
 * longos. É função só da posição de repouso, então vale igual para o corpo e para qualquer roupa que o cubra.
 * `weight` é a influência da chave (0..1); o resultado é o deslocamento em metros.
 */
export function muscleDisplacement(
  x: number,
  y: number,
  z: number,
  weight: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const side = x < 0 ? -1 : 1;
  const ax = Math.abs(x);

  // Caixa torácica e dorsais: o tronco abre em V até a altura do ombro.
  const lats = smooth(y, 1.15, 1.28) * (1 - smooth(y, 1.42, 1.5)) * (1 - smooth(ax, 0.17, 0.25));
  // Ombros: tudo que está fora do ombro vai para fora; o braço ganha comprimento a partir do bíceps.
  const shoulderBand = smooth(y, 1.25, 1.36) * (1 - smooth(y, 1.52, 1.58));
  let dx =
    side *
    (ax * 0.08 * lats +
      0.026 * smooth(ax, 0.1, 0.3) * shoulderBand +
      0.055 * smooth(ax, 0.3, 0.65));

  // Deltoide, braço e antebraço: a seção cresce em torno do eixo do braço, até o punho (só na altura do braço).
  const armBand = smooth(y, 1.3, 1.38) * (1 - smooth(y, 1.52, 1.6));
  const girth = smooth(ax, 0.16, 0.26) * (1 - smooth(ax, 0.62, 0.76)) * armBand;
  let dy = (y - lerpTable(ax, ARM_AXIS_X, ARM_AXIS_Y)) * ARM_GIRTH * girth;
  let dz = (z - lerpTable(ax, ARM_AXIS_X, ARM_AXIS_Z)) * ARM_GIRTH * girth;

  // Coxa e panturrilha: a seção cresce em torno do eixo da perna. O lado de dentro não cruza o meio (e o que fica
  // junto ao meio, como a anatomia, não se mexe).
  const legBand = smooth(y, 0.28, 0.42) * (1 - smooth(y, 0.95, 1.02)) * smooth(ax, 0.03, 0.07);
  const legX = ax - LEG_AXIS_X;
  // A coxa cresce mais que a panturrilha (a chave do pacote já a deixa volumosa), senão ela vira um nó.
  const legGirth = LEG_GIRTH * (0.45 + 0.55 * smooth(y, 0.45, 0.8)) * legBand;
  dx += side * (legX > 0 ? legX : legX * smooth(ax, 0, 0.06)) * legGirth;
  dz += (z - LEG_AXIS_Z) * legGirth;

  // Peitoral: dois lobos na frente do peito.
  const pec =
    bump(y, 1.33, 0.085) *
    smooth(z, 0, 0.06) *
    smooth(ax, 0.02, 0.07) *
    (1 - smooth(ax, 0.15, 0.21));
  dz += 0.024 * pec;

  // Costas: espessura atrás, na altura das dorsais.
  const back = bump(y, 1.35, 0.12) * smooth(-z, 0.03, 0.08) * (1 - smooth(ax, 0.15, 0.22));
  dz -= 0.012 * back;

  // Trapézio: sobe do ombro ao pescoço (o pescoço, ax < 0,05, fica como está).
  const trap =
    smooth(ax, 0.04, 0.09) *
    (1 - smooth(ax, 0.2, 0.3)) *
    smooth(y, 1.44, 1.5) *
    (1 - smooth(y, 1.58, 1.64));
  dy += 0.028 * trap;
  dz -= 0.008 * trap;

  out[0] = dx * weight;
  out[1] = dy * weight;
  out[2] = dz * weight;
  return out;
}

/**
 * Roupa: a folga entre o tecido e a pele muda onde o campo deforma depressa (ombro, trapézio, axila), e a pele
 * atravessava a manga. Compara o deslocamento do ponto da roupa com o do ponto da pele logo abaixo dele (a
 * `CLOTH_GAP` contra a normal) e, onde a roupa chegaria mais perto, empurra o vértice para fora na mesma medida.
 */
function clothMargin(
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  weight: number,
  moved: readonly [number, number, number],
  scratch: [number, number, number],
): number {
  muscleDisplacement(x - nx * CLOTH_GAP, y - ny * CLOTH_GAP, z - nz * CLOTH_GAP, weight, scratch);
  // Quanto a pele se adiantou, a mais que a roupa, na direção da normal.
  const skin = scratch[0] * nx + scratch[1] * ny + scratch[2] * nz;
  const cloth = moved[0] * nx + moved[1] * ny + moved[2] * nz;
  return Math.max(0, skin - cloth);
}

/** Reforços por modelo: só o masculino (o corpo feminino tem outra anatomia). */
export function muscleBoosts(model: AvatarConfig['model']): readonly MorphBoost[] {
  if (model !== 'goe-male') return [];
  return [
    {
      key: 'BodyBodybuilderSize',
      apply(positions, weight, { normals, clothing, name }) {
        const push = LOWER_GARMENT.test(name) ? 0 : CLOTH_UPPER_BODY_PUSH;
        const delta: [number, number, number] = [0, 0, 0];
        const scratch: [number, number, number] = [0, 0, 0];
        for (let i = 0; i + 2 < positions.length; i += 3) {
          const x = positions[i]!;
          const y = positions[i + 1]!;
          const z = positions[i + 2]!;
          muscleDisplacement(x, y, z, weight, delta);
          if (clothing && normals) {
            const nx = normals[i]!;
            const ny = normals[i + 1]!;
            const nz = normals[i + 2]!;
            const upper = smooth(y, 0.95, 1.05) * (1 - smooth(y, 1.5, 1.58));
            const margin =
              clothMargin(x, y, z, nx, ny, nz, weight, delta, scratch) + push * weight * upper;
            positions[i] = x + delta[0] + nx * margin;
            positions[i + 1] = y + delta[1] + ny * margin;
            positions[i + 2] = z + delta[2] + nz * margin;
            continue;
          }
          positions[i] = x + delta[0];
          positions[i + 1] = y + delta[1];
          positions[i + 2] = z + delta[2];
        }
      },
    },
  ];
}

/** O que cada peça de roupa cobre do corpo (alturas e alcance do braço em metros, no espaço do modelo). */
interface Cover {
  /** A peça veste o tronco a partir desta altura (barra). */
  torsoFrom?: number;
  /** A peça cobre o braço até este |x| (manga). */
  armTo?: number;
  /** A peça veste as pernas até esta altura (barra da perna), da cintura para baixo. */
  legsTo?: number;
}

const COVER: Readonly<Record<string, Cover>> = {
  GoE_M_Top_Fitness: { torsoFrom: 1.0, armTo: 0.45 },
  GoE_M_Outerwear_Street: { torsoFrom: 0.98, armTo: 0.7 },
  GoE_M_Bottom_Fitness: { legsTo: 0.5 },
  GoE_M_Bottom_Street: { legsTo: 0.15 },
  GoE_F_Top_CasualSport: { torsoFrom: 1.1, armTo: 0.7 },
  GoE_F_Top_Sportswear: { torsoFrom: 1.15, armTo: 0.4 },
  GoE_F_Bottom_CasualSport: { legsTo: 0.15 },
  GoE_F_Bottom_Sportswear: { legsTo: 0.55 },
};

/** Quanto a pele sob a roupa recua (m) para não aparecer pelo tecido quando a pose dobra o corpo. */
const SKIN_RECESS = 0.004;

/**
 * Corpo nu por baixo da roupa: a pele e o tecido têm pesos de esqueleto parecidos, não iguais, e nas poses (perna
 * levantada, braço dobrado) a pele aparecia por buracos na calça e na manga. Onde há roupa, a pele recua `SKIN_RECESS`
 * ao longo da normal, com transição suave nas bordas (cintura, barra, punho, pescoço).
 */
export function underClothes(config: AvatarConfig): UnderClothes | undefined {
  const worn = [config.bottom, config.outerwear !== 'none' ? config.outerwear : config.top]
    .map((id) => COVER[id])
    .filter((cover): cover is Cover => cover !== undefined);
  if (worn.length === 0) return undefined;
  const key = [config.bottom, config.outerwear !== 'none' ? config.outerwear : config.top].join(
    '+',
  );
  return {
    key,
    apply(positions, normals) {
      for (let i = 0; i + 2 < positions.length; i += 3) {
        const ax = Math.abs(positions[i]!);
        const y = positions[i + 1]!;
        let covered = 0;
        for (const cover of worn) {
          let amount = 0;
          if (cover.torsoFrom !== undefined) {
            const hem = smooth(y, cover.torsoFrom, cover.torsoFrom + 0.06);
            const neck = 1 - smooth(y, 1.5, 1.58);
            const torso = hem * neck * (1 - smooth(ax, 0.2, 0.26));
            const arm =
              cover.armTo === undefined
                ? 0
                : smooth(ax, 0.16, 0.24) *
                  (1 - smooth(ax, cover.armTo - 0.08, cover.armTo)) *
                  smooth(y, 1.3, 1.38) *
                  (1 - smooth(y, 1.52, 1.6));
            amount = Math.max(torso, arm);
          }
          if (cover.legsTo !== undefined) {
            const waist = 1 - smooth(y, 1.06, 1.14);
            const hem = smooth(y, cover.legsTo, cover.legsTo + 0.08);
            amount = Math.max(amount, waist * hem);
          }
          covered = Math.max(covered, amount);
        }
        if (covered <= 0) continue;
        const shift = SKIN_RECESS * covered;
        positions[i] = positions[i]! - normals[i]! * shift;
        positions[i + 1] = positions[i + 1]! - normals[i + 1]! * shift;
        positions[i + 2] = positions[i + 2]! - normals[i + 2]! * shift;
      }
    },
  };
}
