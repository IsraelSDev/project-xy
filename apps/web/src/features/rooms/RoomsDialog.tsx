import { RoomTitle, type RoomPrivacy, type RoomSummary } from '@3dx/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { REALTIME_URL } from '../../app/config';
import type { RoomTarget } from '../../game/network/lounge-connection';

interface RoomsDialogProps {
  currentRoomId?: string;
  onChoose: (target: RoomTarget) => void;
  onClose: () => void;
}

/** Salas públicas (do realtime) e criação de sala pública ou privada. */
export function RoomsDialog({ currentRoomId, onChoose, onClose }: RoomsDialogProps) {
  const [rooms, setRooms] = useState<RoomSummary[]>();
  const [error, setError] = useState<string>();

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
    const privacy: RoomPrivacy = data.get('privacy') === 'private' ? 'private' : 'public';
    onChoose({ kind: 'create', privacy, title: title.data });
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
        {rooms?.length === 0 && <p>Nenhuma sala pública aberta agora.</p>}
        <ul className="rooms">
          {rooms?.map((room) => (
            <li key={room.roomId}>
              <span>
                {room.title}{' '}
                <span className="room-count">
                  {room.clients}/{room.maxClients}
                </span>
              </span>
              {room.roomId === currentRoomId ? (
                <span className="room-count">você está aqui</span>
              ) : (
                <button
                  type="button"
                  disabled={room.clients >= room.maxClients}
                  onClick={() => onChoose({ kind: 'join', roomId: room.roomId })}
                >
                  Entrar
                </button>
              )}
            </li>
          ))}
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
              <input type="radio" name="privacy" value="public" defaultChecked /> Qualquer pessoa
            </label>
            <label>
              <input type="radio" name="privacy" value="private" /> Só com convite
            </label>
          </fieldset>
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

/** Lê `?sala=<id>&convite=<código>` (link de convite) e limpa a URL para não guardar o código. */
export function takeInviteFromUrl(): RoomTarget | undefined {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('sala');
  if (!roomId) return undefined;
  const invite = params.get('convite') ?? undefined;
  window.history.replaceState(null, '', window.location.pathname);
  return { kind: 'join', roomId, invite };
}

export const inviteLink = (roomId: string, code: string) =>
  `${window.location.origin}/?sala=${encodeURIComponent(roomId)}&convite=${encodeURIComponent(code)}`;
