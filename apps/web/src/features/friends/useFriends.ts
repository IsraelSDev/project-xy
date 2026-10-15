import type { FriendEntry, FriendStatus } from '@3dx/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../app/api';

export interface Friends {
  entries: FriendEntry[];
  statusOf: (userId: string) => FriendStatus | undefined;
  /** Pede amizade; `FRIEND` se a pessoa já tinha pedido (virou amizade na hora). */
  request: (userId: string) => Promise<'FRIEND' | 'OUTGOING'>;
  accept: (userId: string) => Promise<void>;
  /** Recusa, cancela ou desfaz. */
  remove: (userId: string) => Promise<void>;
  /** Recarrega da API (ex.: depois de bloquear, que desfaz a amizade no servidor). */
  reload: () => Promise<void>;
}

const FRIENDS_RELOAD_MS = 20_000;

/** Amizades da conta logada; cada ação recarrega a lista da API (fonte da verdade). */
export function useFriends(): Friends {
  const [entries, setEntries] = useState<FriendEntry[]>([]);

  const reload = useCallback(async () => {
    setEntries(await api<FriendEntry[]>('/friends'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api<FriendEntry[]>('/friends')
        .then((list) => {
          if (!cancelled) setEntries(list);
        })
        .catch(() => {
          // Falha momentânea: a próxima recarga tenta de novo.
        });
    };
    load();
    // Pedidos e aceites da outra pessoa chegam por aqui (no mesmo ritmo da renovação do ticket).
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

  return { entries, statusOf, request, accept, remove, reload };
}
