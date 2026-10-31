import type { FriendEntry, FriendStatus, FriendSuggestion } from '@3dx/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../app/api';

export interface Friends {
  entries: FriendEntry[];
  /** Sugestões por amigos em comum (atualizam junto com a lista). */
  suggestions: FriendSuggestion[];
  statusOf: (userId: string) => FriendStatus | undefined;
  /** Pede amizade; `FRIEND` se a pessoa já tinha pedido (virou amizade na hora). */
  request: (userId: string) => Promise<'FRIEND' | 'OUTGOING'>;
  accept: (userId: string) => Promise<void>;
  /** Recusa, cancela ou desfaz. */
  remove: (userId: string) => Promise<void>;
  /** Recarrega da API (ex.: depois de bloquear, que desfaz a amizade no servidor). */
  reload: () => Promise<void>;
}

const FRIENDS_RELOAD_MS = 60_000;

/** Amizades da conta logada; cada ação recarrega a lista da API (fonte da verdade). */
export function useFriends(): Friends {
  const [entries, setEntries] = useState<FriendEntry[]>([]);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);

  const reload = useCallback(async () => {
    const [list, ideas] = await Promise.all([
      api<FriendEntry[]>('/friends'),
      // Sugestão é conveniência: se falhar, a lista de amigos continua valendo.
      api<FriendSuggestion[]>('/friends/suggestions').catch(() => []),
    ]);
    setEntries(list);
    setSuggestions(ideas);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([
        api<FriendEntry[]>('/friends'),
        api<FriendSuggestion[]>('/friends/suggestions').catch(() => []),
      ])
        .then(([list, ideas]) => {
          if (cancelled) return;
          setEntries(list);
          setSuggestions(ideas);
        })
        .catch(() => {
          // Falha momentânea: a próxima recarga tenta de novo.
        });
    };
    load();
    // Pedidos e aceites da outra pessoa chegam por push (onUserNotify). O intervalo longo é só
    // reserva, caso o realtime não esteja configurado ou um aviso se perca.
    const timer = setInterval(load, FRIENDS_RELOAD_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const statusOf = useCallback(
    (userId: string) => entries.find((entry) => entry.user.id === userId)?.status,
    [entries],
  );

  const request = useCallback(
    async (userId: string) => {
      const { status } = await api<{ status: 'FRIEND' | 'OUTGOING' }>('/friends/requests', {
        json: { userId },
      });
      await reload();
      return status;
    },
    [reload],
  );
  const accept = useCallback(
    async (userId: string) => {
      await api(`/friends/${userId}/accept`, { method: 'POST' });
      await reload();
    },
    [reload],
  );
  const remove = useCallback(
    async (userId: string) => {
      await api(`/friends/${userId}`, { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { entries, suggestions, statusOf, request, accept, remove, reload };
}
