import { PAIR_POSES } from '@3dx/game-core';
import { describe, expect, it } from 'vitest';
import { PAIR_CLIPS } from '../characters/pair-clips';
import { IDLE_PAIR_TYPES, idlePairActions, warmUpOnIdle, type IdleSchedule } from './idle-warmup';

/** Fila de ociosos controlada pelo teste: `run` executa a próxima tarefa agendada. */
function manualSchedule() {
  const queue: Array<() => void> = [];
  const schedule: IdleSchedule = (task) => {
    queue.push(task);
    return () => {
      const at = queue.indexOf(task);
      if (at >= 0) queue.splice(at, 1);
    };
  };
  return {
    schedule,
    run: () => queue.shift()?.(),
    pending: () => queue.length,
  };
}

describe('aquecimento dos clipes em ociosidade', () => {
  it('baixa um clipe por ocioso, na ordem de prioridade', () => {
    const { schedule, run, pending } = manualSchedule();
    const baixados: string[] = [];
    warmUpOnIdle({
      actions: ['pair10', 'pair13', 'pair15'],
      prefetch: (action) => baixados.push(action),
      ready: () => true,
      schedule,
    });

    // O primeiro passo já é agendado, mas nada baixa fora de um ocioso.
    expect(baixados).toEqual([]);
    expect(pending()).toBe(1);

    run();
    expect(baixados).toEqual(['pair10']);
    expect(pending()).toBe(1);
    run();
    run();
    expect(baixados).toEqual(['pair10', 'pair13', 'pair15']);
    expect(pending()).toBe(0);
  });

  it('espera a cena local ficar pronta sem consumir a fila', () => {
    const { schedule, run } = manualSchedule();
    const baixados: string[] = [];
    let pronta = false;
    warmUpOnIdle({
      actions: ['pair10', 'pair13'],
      prefetch: (action) => baixados.push(action),
      ready: () => pronta,
      schedule,
    });

    run();
    run();
    expect(baixados).toEqual([]);

    pronta = true;
    run();
    expect(baixados).toEqual(['pair10']);
    run();
    expect(baixados).toEqual(['pair10', 'pair13']);
  });

  it('desiste depois das tentativas, sem baixar nada', () => {
    const { schedule, run, pending } = manualSchedule();
    const baixados: string[] = [];
    warmUpOnIdle({
      actions: ['pair10'],
      prefetch: (action) => baixados.push(action),
      ready: () => false,
      schedule,
      readyRetries: 2,
    });

    for (let i = 0; i < 10; i += 1) run();
    expect(baixados).toEqual([]);
    expect(pending()).toBe(0);
  });

  it('cancelar interrompe a fila', () => {
    const { schedule, run, pending } = manualSchedule();
    const baixados: string[] = [];
    const cancel = warmUpOnIdle({
      actions: ['pair10', 'pair13', 'pair15'],
      prefetch: (action) => baixados.push(action),
      ready: () => true,
      schedule,
    });

    run();
    cancel();
    expect(pending()).toBe(0);
    run();
    expect(baixados).toEqual(['pair10']);
  });

  it('um clipe que falha não trava os seguintes', () => {
    const { schedule, run } = manualSchedule();
    const baixados: string[] = [];
    warmUpOnIdle({
      actions: ['pair10', 'pair13'],
      prefetch: (action) => {
        if (action === 'pair10') throw new Error('arquivo ausente');
        baixados.push(action);
      },
      ready: () => true,
      schedule,
    });

    run();
    run();
    expect(baixados).toEqual(['pair13']);
  });

  it('fora do estúdio não aquece os pares de parede', () => {
    const clube = idlePairActions('club');
    expect(clube).toContain(PAIR_POSES['sofa-1']?.actor);
    expect(clube).toContain(PAIR_POSES['bed-1']?.actor);
    expect(clube).not.toContain(PAIR_POSES['wall-1']?.actor);

    const estudio = idlePairActions('studio');
    expect(estudio).toContain(PAIR_POSES['wall-1']?.actor);
    // Um clipe por ação, mesmo quando o par usa o mesmo clipe nos dois lados.
    expect(new Set(estudio).size).toBe(estudio.length);
  });

  it('todo clipe aquecido é clipe sob demanda nos dois corpos', () => {
    for (const type of IDLE_PAIR_TYPES) {
      const pair = PAIR_POSES[type];
      expect(pair, type).toBeDefined();
      for (const action of [pair!.actor, pair!.partner]) {
        expect(PAIR_CLIPS.male, `${type}: ${action}`).toContain(action);
        expect(PAIR_CLIPS.female, `${type}: ${action}`).toContain(action);
      }
    }
  });
});
