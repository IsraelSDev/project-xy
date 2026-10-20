import {
  RoomPassword,
  RoomTitle,
  ROOM_SCENES,
  type RoomSummary,
  type RoomScene,
} from '@3dx/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { REALTIME_URL } from '../../app/config';
import type { RoomTarget } from '../../game/network/lounge-connection';
import { sceneDisplayName } from '@3dx/game-core';

interface RoomsDialogProps {
  userId: string;
  userName: string;
  currentRoomId?: string;
  onChoose: (target: RoomTarget) => void;
  onClose: () => void;
}

/**
 * Ponto de entrada das salas: o quarto privado do jogador, a balada pública e as demais salas
 * abertas. O quarto é criado na primeira entrada e fica marcado pelo `ownerId`.
 */
export function RoomsDialog({
  userId,
  userName,
  currentRoomId,
  onChoose,
  onClose,
}: RoomsDialogProps) {
  const [rooms, setRooms] = useState<RoomSummary[]>();
  const [error, setError] = useState<string>();
  /** Sala trancada para a qual o jogador está digitando a senha (uma por vez). */
  const [locked, setLocked] = useState<string>();
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [scene, setScene] = useState<RoomScene>('home');

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

  const myRoom = rooms?.find((room) => room.ownerId === userId);
  const clubRoom = rooms?.find((room) => room.scene === 'club' && room.privacy === 'public');
  const otherRooms = rooms?.filter(
    (room) => room.ownerId !== userId && room.roomId !== clubRoom?.roomId,
  );

  const enterMyRoom = () => {
    if (myRoom) {
      onChoose({ kind: 'join', roomId: myRoom.roomId });
      return;
    }
    onChoose({ kind: 'create', privacy: 'private', title: 'Meu quarto', scene: 'home' });
  };

  const enterClub = () => {
    if (clubRoom) {
      onChoose({ kind: 'join', roomId: clubRoom.roomId });
      return;
    }
    onChoose({ kind: 'default' });
  };

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
      onChoose({
        kind: 'create',
        privacy: 'private',
        title: title.data,
        scene,
        password: password.data,
      });
      return;
    }
    onChoose({ kind: 'create', privacy: 'public', title: title.data, scene });
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
        className="hud-panel dialog rooms-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rooms-title"
      >
        <header className="rooms-head">
          <div>
            <h2 id="rooms-title">Onde você quer ir?</h2>
            <p>Seu espaço privado, a balada pública ou uma sala da comunidade.</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Fechar
          </button>
        </header>

        {error && <p role="alert">{error}</p>}

        <div className="room-destinations">
          <article className="room-card room-card-home">
            <div className="room-card-copy">
              <span className="room-card-kicker">Seu espaço</span>
              <h3>Meu quarto</h3>
              <p>
                Privado, só entra quem você convidar. Troque de roupa, receba amigos e use o quarto
                como quiser.
              </p>
              <p className="room-card-meta">
                {myRoom
                  ? `${myRoom.clients}/${myRoom.maxClients} na sala · ${userName}`
                  : 'Ainda não criado · será privado'}
              </p>
            </div>
            <button
              type="button"
              className="primary"
              disabled={myRoom?.roomId === currentRoomId}
              onClick={enterMyRoom}
            >
              {myRoom?.roomId === currentRoomId
                ? 'Você está no seu quarto'
                : myRoom
                  ? 'Entrar no meu quarto'
                  : 'Criar meu quarto'}
            </button>
          </article>

          <article className="room-card room-card-club">
            <div className="room-card-copy">
              <span className="room-card-kicker">Público</span>
              <h3>Balada</h3>
              <p>A pista pública do 3DX, aberta para todo mundo. Música, dança e conversa.</p>
              <p className="room-card-meta">
                {clubRoom ? `${clubRoom.clients}/${clubRoom.maxClients} na sala` : 'Sala pública'}
              </p>
            </div>
            <button
              type="button"
              className="primary"
              disabled={clubRoom?.roomId === currentRoomId}
              onClick={enterClub}
            >
              {clubRoom?.roomId === currentRoomId ? 'Você está na balada' : 'Entrar na balada'}
            </button>
          </article>
        </div>

        <section className="rooms-list-section">
          <h3>Outras salas abertas</h3>
          {!rooms && !error && <p>Carregando…</p>}
          {rooms?.length === 0 && <p>Nenhuma sala aberta agora.</p>}
          {otherRooms?.length === 0 && <p>Nenhuma outra sala agora.</p>}
          <ul className="rooms">
            {otherRooms?.map((room) => {
              const full = room.clients >= room.maxClients;
              return (
                <li key={room.roomId}>
                  <span>
                    {room.privacy === 'private' && (
                      <span className="room-lock" aria-hidden="true" title="Protegida por senha">
                        🔒
                      </span>
                    )}
                    {room.title} <span className="room-scene">{sceneDisplayName(room.scene)}</span>{' '}
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
        </section>

        <details className="create-room">
          <summary>Criar outra sala</summary>
          <form onSubmit={create}>
            <label>
              Nome
              <input name="title" minLength={3} maxLength={40} required placeholder="Minha sala" />
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
            <label>
              Cenário
              <select
                name="scene"
                value={scene}
                onChange={(event) => setScene(event.target.value as RoomScene)}
              >
                {ROOM_SCENES.map((s) => (
                  <option key={s} value={s}>
                    {sceneDisplayName(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="primary">
                Criar e entrar
              </button>
            </div>
          </form>
        </details>
      </section>
    </div>
  );
}
