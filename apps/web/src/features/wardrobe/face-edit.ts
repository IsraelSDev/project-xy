import { MORPHS, type AvatarConfig, type AvatarModelId } from '@3dx/contracts';

/** Formas do avatar: `{ chave: 0..1 }`, só as diferentes de zero (ver `AvatarConfig.morphs`). */
export type Morphs = AvatarConfig['morphs'];

type Morph = (typeof MORPHS)[number];

const MIN_INFLUENCE = 0.001;

const expressionIds = new Set<string>(
  MORPHS.filter((morph) => morph.group === 'expression').map((morph) => morph.id),
);

/** Chaves que o editor de rosto mexe: formato, expressões e movimentos finos. O corpo e a anatomia ficam fora. */
const isFaceMorph = (morph: Morph) =>
  morph.group === 'face' || morph.group === 'expression' || morph.group === 'facial';

/** Troca (ou tira, com 0) a influência de uma chave, sem mexer nas outras. */
export function withMorph(morphs: Morphs, id: string, value: number): Morphs {
  const rest = Object.fromEntries(Object.entries(morphs).filter(([key]) => key !== id));
  const influence = Math.min(1, Math.max(0, value));
  return influence > MIN_INFLUENCE ? { ...rest, [id]: influence } : rest;
}

/** Expressão em uso (a de maior influência) ou nenhuma. */
export function activeExpression(morphs: Morphs): { id: string; value: number } | undefined {
  let best: { id: string; value: number } | undefined;
  for (const [id, value] of Object.entries(morphs)) {
    if (!expressionIds.has(id) || value === undefined) continue;
    if (!best || value > best.value) best = { id, value };
  }
  return best;
}

/**
 * Escolhe a expressão do avatar: só uma por vez (as de `Anim*` brigam entre si quando somadas). `undefined` deixa o
 * rosto neutro. `value` é a intensidade (0..1).
 */
export function withExpression(morphs: Morphs, id: string | undefined, value = 1): Morphs {
  const rest = Object.fromEntries(
    Object.entries(morphs).filter(([key]) => !expressionIds.has(key)),
  );
  return id === undefined ? rest : withMorph(rest, id, value);
}

/** Zera tudo do rosto (formato, expressões e movimentos) e deixa o corpo e a anatomia como estão. */
export function clearFace(morphs: Morphs): Morphs {
  const face = new Set<string>(MORPHS.filter(isFaceMorph).map((morph) => morph.id));
  return Object.fromEntries(Object.entries(morphs).filter(([key]) => !face.has(key)));
}

/** Variações fortes demais para um sorteio (outras etnias, anime, orelha de elfo...): só entram à mão. */
const NOT_RANDOM = /Anime|Elf|Mega|Old|Black|Indian|Japan|Flatten|Stretch|Symmetry/;

/**
 * Sorteia o formato do rosto: troca as chaves `Face*` do modelo por `count` chaves comuns com influência de 15% a 70%.
 * O corpo, as expressões e os movimentos continuam como estão. `random` devolve 0..1 (injetável nos testes).
 */
export function randomFace(
  morphs: Morphs,
  model: AvatarModelId,
  random: () => number = Math.random,
  count = 8,
): Morphs {
  const faceKeys = new Set<string>(
    MORPHS.filter((morph) => morph.group === 'face').map((morph) => morph.id),
  );
  let next = Object.fromEntries(
    Object.entries(morphs).filter(([key]) => !faceKeys.has(key)),
  ) as Morphs;
  const pool = MORPHS.filter(
    (morph) =>
      morph.group === 'face' &&
      (morph.models as readonly string[]).includes(model) &&
      !NOT_RANDOM.test(morph.id),
  ).map((morph) => morph.id);
  for (let picked = 0; picked < count && pool.length > 0; picked++) {
    const [id] = pool.splice(Math.floor(random() * pool.length), 1);
    if (id) next = withMorph(next, id, 0.15 + random() * 0.55);
  }
  return next;
}

/** Uma linha de movimento do rosto: os dois lados juntos (`left`/`right`) ou uma chave sem par. */
export interface MorphRow {
  label: string;
  left?: Morph;
  right?: Morph;
  single?: Morph;
}

const LEFT = /Left$/;
const SIDE_LABEL = / \((esq|dir)\.\)$/;

/**
 * Junta as chaves `xxxLeft`/`xxxRight` numa linha só (ex.: "Piscar" com esquerdo e direito). Só pareia quando os dois
 * rótulos acabam em "(esq.)"/"(dir.)": `jawLeft` e `mouthLeft` são direções com nome próprio e ficam soltas.
 */
export function pairRows(items: readonly Morph[]): MorphRow[] {
  const byId = new Map<string, Morph>(items.map((morph) => [morph.id, morph]));
  const partnerOf = (morph: Morph) => {
    if (!LEFT.test(morph.id)) return undefined;
    const right = byId.get(morph.id.replace(LEFT, 'Right'));
    return right && SIDE_LABEL.test(morph.label) && SIDE_LABEL.test(right.label)
      ? right
      : undefined;
  };
  const paired = new Set(items.flatMap((morph) => partnerOf(morph)?.id ?? []));
  const rows: MorphRow[] = [];
  for (const morph of items) {
    if (paired.has(morph.id)) continue;
    const right = partnerOf(morph);
    rows.push(
      right
        ? { label: morph.label.replace(SIDE_LABEL, ''), left: morph, right }
        : { label: morph.label, single: morph },
    );
  }
  return rows;
}
