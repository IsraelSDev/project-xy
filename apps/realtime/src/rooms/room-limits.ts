import type { RoomScene } from '@3dx/contracts';

/**
 * Limite de jogadores por cenário, derivado da medição de desempenho
 * (`docs/operations/desempenho-cenarios.md`): a cena tem um custo fixo de triângulos e cada avatar
 * custa {@link AVATAR_TRIANGLES}; a sala não passa do orçamento.
 *
 * A conta é conservadora de propósito: o custo medido é de **geometria e skinning**, que independe
 * da GPU — o FPS real precisa ser remedido em hardware com GPU antes de subir o orçamento.
 */

/** Teto global de jogadores por sala (servidor, simulção e memória). */
export const MAX_PLAYERS = 16;

/** Triângulos por avatar (corpo + cabeça + cílios + cabelo/roupa; medido com os bots). */
export const AVATAR_TRIANGLES = 52_000;

/** Orçamento de triângulos por sala (cena + todos os avatares). */
export const ROOM_TRIANGLE_BUDGET = 1_000_000;

/**
 * Custo de cenário medido (malhas ativas do GLB, 2026-10-30). O lounge e o quarto privado ainda
 * usam o layout provisório, que é bem mais leve que as salas nativas.
 */
export const SCENE_TRIANGLES: Record<RoomScene, number> = {
  club: 126_000,
  home: 171_000, // depois do Decimate 50% (era 342 mil)
  beach: 58_000,
  studio: 47_000,
  lounge: 47_000,
  'private-room': 47_000,
};

/** Quantos avatares cabem no orçamento da cena (entre 4 e {@link MAX_PLAYERS}). */
export function maxPlayersForScene(scene: RoomScene): number {
  const sceneCost = SCENE_TRIANGLES[scene] ?? SCENE_TRIANGLES.lounge;
  const fit = Math.floor((ROOM_TRIANGLE_BUDGET - sceneCost) / AVATAR_TRIANGLES);
  return Math.max(4, Math.min(MAX_PLAYERS, fit));
}
