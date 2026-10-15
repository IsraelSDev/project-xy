import type { FriendEntry, FriendStatus } from '@3dx/contracts';
import { useState } from 'react';
import type { Friends } from './useFriends';

interface FriendsDialogProps {
  friends: Friends;
  onClose: () => void;
  /** Abre a conversa privada com o amigo. */
  onMessage: (friendId: string) => void;
}

const SECTIONS: { status: FriendStatus; title: string; empty: string }[] = [
  { status: 'INCOMING', title: 'Pedidos recebidos', empty: 'Nenhum pedido recebido.' },
  { status: 'FRIEND', title: 'Amigos', empty: 'Nenhum amigo ainda: adicione pela lista da sala.' },
  { status: 'OUTGOING', title: 'Pedidos enviados', empty: 'Nenhum pedido enviado.' },
];

/** Amigos e pedidos: aceitar, recusar, cancelar e desfazer. */
export function FriendsDialog({ friends, onClose, onMessage }: FriendsDialogProps) {
  const [error, setError] = useState<string>();

  const run = (action: () => Promise<void>) => {
    setError(undefined);
    action().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir.');
    });
  };

  const actions = (entry: FriendEntry) => {
    const { id } = entry.user;
    switch (entry.status) {
      case 'INCOMING':
        return (
          <>
            <button type="button" onClick={() => run(() => friends.remove(id))}>
              Recusar
            </button>
            <button type="button" onClick={() => run(() => friends.accept(id))}>
              Aceitar
            </button>
          </>
        );
      case 'FRIEND':
        return (
          <>
            <button type="button" onClick={() => onMessage(id)}>
              Mensagem
            </button>
            <button type="button" onClick={() => run(() => friends.remove(id))}>
              Desfazer amizade
            </button>
          </>
        );
      case 'OUTGOING':
        return (
          <button type="button" onClick={() => run(() => friends.remove(id))}>
            Cancelar pedido
          </button>
        );
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="friends-title"
      >
        <h2 id="friends-title">Amigos</h2>
        {error && <p role="alert">{error}</p>}
        {SECTIONS.map(({ status, title, empty }) => {
          const entries = friends.entries.filter((entry) => entry.status === status);
          return (
            <section key={status} aria-label={title}>
              <h3>{title}</h3>
              {entries.length === 0 ? (
                <p>{empty}</p>
              ) : (
                <ul className="friends">
                  {entries.map((entry) => (
                    <li key={entry.user.id}>
                      <span>{entry.user.displayName}</span>
                      <span className="player-actions">{actions(entry)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </section>
    </div>
  );
}
