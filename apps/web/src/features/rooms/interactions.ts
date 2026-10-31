import {
  INTERACTION_TYPES,
  type InteractionType,
  type PlayerAction,
  type RoomScene,
} from '@3dx/contracts';
import { PAIR_POSES, coupleComposition, pairAccepts } from '@3dx/game-core';

const bodyOf = (model: string | undefined) => (model === '3dx-female' ? 'female' : 'male');

export interface InteractionChoices {
  /** Modelo do avatar local (quem inicia). */
  localModel?: string;
  /** Modelo do avatar do outro lado. */
  targetModel?: string;
  /** Cenário da sala (os pares de parede só existem no estúdio). */
  scene?: RoomScene;
  /** Ação atual do jogador local (só sentado é que os pares de móvel valem). */
  localAction: PlayerAction;
}

/**
 * Interações que o servidor vai aceitar entre os dois corpos neste cenário: o par precisa combinar
 * com a composição (M/F, F/F, M/M) e a âncora precisa existir (sentado no móvel, ou perto de uma
 * parede no estúdio). É a mesma regra do menu da lista e do menu do mundo.
 */
export function interactionOptions({
  localModel,
  targetModel,
  scene,
  localAction,
}: InteractionChoices): InteractionType[] {
  const composition = coupleComposition(bodyOf(localModel), bodyOf(targetModel));
  return INTERACTION_TYPES.filter((type) => {
    const seat = PAIR_POSES[type]?.seat;
    const anchorReady =
      seat === 'wall' ? scene === 'studio' : seat === undefined || localAction === 'sit';
    return anchorReady && pairAccepts(PAIR_POSES[type], composition);
  });
}

/**
 * Pares que um móvel aceita entre os dois corpos, **sem exigir que o jogador já esteja sentado**:
 * o convite pelo móvel senta primeiro e só então chama o servidor. O primeiro da lista é a pose
 * padrão daquele móvel (sofa-1, chair-1, bed-1).
 */
export function seatPairOptions(
  kind: 'sofa' | 'chair' | 'bed',
  localModel?: string,
  targetModel?: string,
): InteractionType[] {
  const composition = coupleComposition(bodyOf(localModel), bodyOf(targetModel));
  return INTERACTION_TYPES.filter(
    (type) => PAIR_POSES[type]?.seat === kind && pairAccepts(PAIR_POSES[type], composition),
  );
}

/**
 * Cenas que dá para alternar a partir do par ativo, sem encerrar: as mesmas do móvel (ou os pares de
 * parede, ou os sociais quando o par não usa móvel), sempre na composição dos dois corpos.
 */
export function pairScenes(
  current: InteractionType,
  localModel?: string,
  targetModel?: string,
): InteractionType[] {
  const pair = PAIR_POSES[current];
  if (!pair) return [];
  const composition = coupleComposition(bodyOf(localModel), bodyOf(targetModel));
  if (pair.seat === 'wall') {
    return INTERACTION_TYPES.filter(
      (type) => PAIR_POSES[type]?.seat === 'wall' && pairAccepts(PAIR_POSES[type], composition),
    );
  }
  if (pair.seat) return seatPairOptions(pair.seat, localModel, targetModel);
  return INTERACTION_TYPES.filter(
    (type) =>
      PAIR_POSES[type] !== undefined &&
      PAIR_POSES[type]?.seat === undefined &&
      pairAccepts(PAIR_POSES[type], composition),
  );
}
