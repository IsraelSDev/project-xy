import type { FriendEntry, FriendStatus } from '@3dx/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../app/api';

export interface Friends {
  entries: FriendEntry[];
  statusOf: (userId: string) => FriendStatus | undefined;
  /** Pede amizade (ou aceita, se a pessoa já tinha pedido). */
  request: (userId: string) => Promise<void>;
  accept: (userId: string) => Promise<void>;
  /** Recusa, cancela ou desfaz. */
  remove: (userId: string) => Promise<void>;
  /** Recarrega da API (ex.: depois de bloquear, que desfaz a amizade no servidor). */
  reload: () => Promise<void>;
}

/** Amizades da conta logada; cada ação recarrega a lista da API (fonte da verdade). */
export function useFriends(): Friends {
  const [entries, setEntries] = useState<FriendEntry[]>([]);

  const reload = useCallback(async () => {
    setEntries(await api<FriendEntry[]>('/friends'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<FriendEntry[]>('/friends')
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => {
        // Sem a lista, os botões começam como "Adicionar"; a próxima ação recarrega.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusOf = useCallback(
    (userId: string) => entries.find((entry) => entry.user.id === userId)?.status,
    [entries],
  );

  const request = useCallback(
    async (userId: string) => {
      await api('/friends/requests', { json: { userId } });
      await reload();
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
