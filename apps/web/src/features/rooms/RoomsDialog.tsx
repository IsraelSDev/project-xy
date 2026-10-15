import { RoomPassword, RoomTitle, type RoomSummary } from '@3dx/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { REALTIME_URL } from '../../app/config';
import type { RoomTarget } from '../../game/network/lounge-connection';

interface RoomsDialogProps {
  currentRoomId?: string;
  onChoose: (target: RoomTarget) => void;
  onClose: () => void;
}

/** Salas abertas (privadas aparecem trancadas) e criação de sala pública ou privada com senha. */
export function RoomsDialog({ currentRoomId, onChoose, onClose }: RoomsDialogProps) {
  const [rooms, setRooms] = useState<RoomSummary[]>();
  const [error, setError] = useState<string>();
  /** Sala trancada para a qual o jogador está digitando a senha (uma por vez). */
  const [locked, setLocked] = useState<string>();
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');

  useEffect(() => {
    let cancelled = false;
    fetch(`${REALTIME_URL}/rooms`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<RoomSummary[]>;
      })
      .then((list) => {
        if (!cancelled) setRooms(list);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar as salas.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = RoomTitle.safeParse(data.get('title'));
    if (!title.success) {
      setError('O nome da sala precisa ter de 3 a 40 caracteres.');
      return;
    }
    if (privacy === 'private') {
      const password = RoomPassword.safeParse(data.get('password'));
      if (!password.success) {
        setError('A senha da sala precisa ter de 3 a 40 caracteres.');
        return;
      }
      onChoose({ kind: 'create', privacy: 'private', title: title.data, password: password.data });
      return;
    }
    onChoose({ kind: 'create', privacy: 'public', title: title.data });
  };

  const joinLocked = (event: FormEvent<HTMLFormElement>, room: RoomSummary) => {
    event.preventDefault();
    const password = RoomPassword.safeParse(new FormData(event.currentTarget).get('password'));
    if (!password.success) {
      setError('A senha da sala precisa ter de 3 a 40 caracteres.');
      return;
    }
    onChoose({ kind: 'join', roomId: room.roomId, password: password.data });
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rooms-title"
      >
        <h2 id="rooms-title">Salas</h2>
        {error && <p role="alert">{error}</p>}
        {!rooms && !error && <p>Carregando…</p>}
        {rooms?.length === 0 && <p>Nenhuma sala aberta agora.</p>}
        <ul className="rooms">
          {rooms?.map((room) => {
            const full = room.clients >= room.maxClients;
            return (
              <li key={room.roomId}>
                <span>
                  {room.privacy === 'private' && (
                    <span className="room-lock" aria-hidden="true" title="Protegida por senha">
                      🔒
                    </span>
                  )}
                  {room.title}{' '}
                  <span className="room-count">
                    {room.clients}/{room.maxClients}
                  </span>
                </span>
                {room.roomId === currentRoomId ? (
                  <span className="room-count">você está aqui</span>
                ) : full ? (
                  <span className="room-count">cheia</span>
                ) : room.privacy === 'private' && locked !== room.roomId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(undefined);
                      setLocked(room.roomId);
                    }}
                  >
                    Entrar
                  </button>
                ) : room.privacy === 'private' ? (
                  <form className="room-password" onSubmit={(event) => joinLocked(event, room)}>
                    <input
                      name="password"
                      type="password"
                      minLength={3}
                      maxLength={40}
                      placeholder="Senha"
                      aria-label={`Senha da sala ${room.title}`}
                      required
                    />
                    <button type="submit" className="primary">
                      Entrar
                    </button>
                    <button type="button" className="ghost" onClick={() => setLocked(undefined)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => onChoose({ kind: 'join', roomId: room.roomId })}
                  >
                    Entrar
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <form className="create-room" onSubmit={create}>
          <h3>Criar sala</h3>
          <label>
            Nome
            <input name="title" minLength={3} maxLength={40} required />
          </label>
          <fieldset className="choices">
            <legend>Quem pode entrar</legend>
            <label>
              <input
                type="radio"
                name="privacy"
                value="public"
                checked={privacy === 'public'}
                onChange={() => setPrivacy('public')}
              />{' '}
              Qualquer pessoa
            </label>
            <label>
              <input
                type="radio"
                name="privacy"
                value="private"
                checked={privacy === 'private'}
                onChange={() => setPrivacy('private')}
              />{' '}
              Só com senha
            </label>
          </fieldset>
          {privacy === 'private' && (
            <label>
              Senha
              <input
                name="password"
                type="password"
                minLength={3}
                maxLength={40}
                required
                autoComplete="new-password"
              />
            </label>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Fechar
            </button>
            <button type="submit" className="primary">
              Criar e entrar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
