import type { ModerationQueueSummary } from '@3dx/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../app/api';

/** Mesmo ritmo dos amigos: a fila é pequena e a consulta é barata. */
const QUEUE_RELOAD_MS = 60_000;

export interface ModerationQueue {
  /** Denúncias abertas. */
  reports: number;
  /** Contestações abertas. */
  appeals: number;
  /** Soma das duas: o número mostrado no botão. */
  total: number;
  /** Itens que chegaram desde a última vez que a moderação olhou; `0` = nada novo. */
  arrived: number;
  /** Some com o aviso (ao abrir o painel ou dispensar). */
  clearArrived: () => void;
  /** Recarrega a fila da API (ex.: aviso de push de que chegou item novo). */
  reload: () => Promise<void>;
}

const EMPTY: ModerationQueueSummary = { reports: 0, appeals: 0 };

/** Tamanho da fila de moderação, consultado de tempos em tempos, ao voltar para a aba e por push. */
export function useModerationQueue(enabled: boolean): ModerationQueue {
  const [summary, setSummary] = useState<ModerationQueueSummary>(EMPTY);
  const [arrived, setArrived] = useState(0);
  // `undefined` até a primeira resposta: assim a fila que já existia não conta como chegada.
  const seen = useRef<number | undefined>(undefined);

  const reload = useCallback(() => {
    if (!enabled) return;
    api<ModerationQueueSummary>('/admin/queue')
      .then((next) => {
        setSummary(next);
        const total = next.reports + next.appeals;
        const previous = seen.current;
        if (previous !== undefined && total > previous) {
          setArrived((current) => current + (total - previous));
        }
        seen.current = total;
      })
      .catch(() => {
        // Falha momentânea: a próxima consulta tenta de novo.
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = () => {
      api<ModerationQueueSummary>('/admin/queue')
        .then((next) => {
          if (cancelled) return;
          setSummary(next);
          const total = next.reports + next.appeals;
          const previous = seen.current;
          if (previous !== undefined && total > previous) {
            setArrived((current) => current + (total - previous));
          }
          seen.current = total;
        })
        .catch(() => {
          // Falha momentânea: a próxima consulta tenta de novo.
        });
    };

    load();
    const timer = setInterval(load, QUEUE_RELOAD_MS);
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [enabled]);

  const clearArrived = useCallback(() => setArrived(0), []);

  return {
    reports: summary.reports,
    appeals: summary.appeals,
    total: summary.reports + summary.appeals,
    arrived,
    clearArrived,
    reload,
  };
}
