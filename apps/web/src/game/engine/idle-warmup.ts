import type { RoomScene } from '@3dx/contracts';
import { PAIR_POSES } from '@3dx/game-core';

/**
 * Pares aquecidos em ociosidade: a **primeira opção de cada móvel**, na ordem em que o menu
 * oferece (`INTERACTION_TYPES`). Os pares sociais (`pair01`..`pair09`) ficam no corpo e não entram.
 *
 * Sem telemetria ainda, a ordem é a do menu (não a de uso real): sentar e convidar é o caminho mais
 * curto para o primeiro par, e cada móvel abre pela primeira opção.
 */
export const IDLE_PAIR_TYPES = ['sofa-1', 'chair-1', 'bed-1', 'wall-1'] as const;

/**
 * Clipes a aquecer na cena. Os pares de parede só existem onde há âncoras (estúdio), então fora
 * dele ficam de fora — são os maiores arquivos (2,2–2,5 MB) e não teriam como tocar.
 */
export function idlePairActions(scene: RoomScene | undefined): string[] {
  const actions = new Set<string>();
  for (const type of IDLE_PAIR_TYPES) {
    const pair = PAIR_POSES[type];
    if (!pair) continue;
    if (pair.seat === 'wall' && scene !== 'studio') continue;
    actions.add(pair.actor);
    actions.add(pair.partner);
  }
  return [...actions];
}

/** Agenda `task` para um período ocioso; devolve o cancelamento. */
export type IdleSchedule = (task: () => void) => () => void;

/**
 * O padrão usa `requestIdleCallback` (com prazo, para não ficar esperando uma ociosidade que não
 * vem) e cai para um atraso curto onde ele não existe.
 */
export const scheduleIdle: IdleSchedule = (task) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => task(), { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 1500);
  return () => clearTimeout(id);
};

export interface IdleWarmupOptions {
  /** Clipes na ordem de prioridade (um por ocioso). */
  actions: readonly string[];
  prefetch: (action: string) => void;
  /**
   * A cena local ainda não está pronta (corpo carregando, aba oculta): espera o próximo ocioso em
   * vez de baixar junto com o carregamento crítico. O primeiro `false` só adia o primeiro passo.
   */
  ready: () => boolean;
  schedule?: IdleSchedule;
  /** Quantos ociosos esperar pela cena pronta antes de desistir (~4 min com o prazo padrão). */
  readyRetries?: number;
}

/**
 * Baixa os clipes em segundo plano, **um por ocioso**, para não competir com o corpo e a cena. A
 * fila não repete um clipe já baixado (o loader tem cache por cena/modelo/ação), então chamar de
 * novo numa troca de sala é barato.
 *
 * Devolve o cancelamento (chamado no `dispose`); depois dele nada mais é agendado.
 */
export function warmUpOnIdle({
  actions,
  prefetch,
  ready,
  schedule = scheduleIdle,
  readyRetries = 80,
}: IdleWarmupOptions): () => void {
  let cancelled = false;
  let cancelPending: (() => void) | undefined;
  let index = 0;
  let waits = 0;

  const step = () => {
    cancelPending = undefined;
    if (cancelled) return;
    if (!ready()) {
      waits += 1;
      if (waits > readyRetries) return;
      cancelPending = schedule(step);
      return;
    }
    const action = actions[index];
    index += 1;
    if (action !== undefined) {
      // Um clipe que falha (arquivo ausente, rede caiu) não trava os seguintes.
      try {
        prefetch(action);
      } catch {
        // segue a fila
      }
    }
    if (index < actions.length) cancelPending = schedule(step);
  };

  cancelPending = schedule(step);
  return () => {
    cancelled = true;
    cancelPending?.();
    cancelPending = undefined;
  };
}
