import { useEffect, useState } from 'react';
import type { GameView } from '../../game/engine/game';
import type { ConnectionStatus } from '../../game/network/lounge-connection';

/** Painel de depuração da sala: estado da conexão e jogadores presentes. */
export function RoomPanel({ view }: { view: GameView }) {
  return (
    <section className="hud-panel room-panel" aria-label="Sala">
      <ConnectionLine status={view.status} count={view.players.length} />
      {view.players.length > 0 && (
        <ul className="players">
          {view.players.map((player) => (
            <li key={player.id} className={player.connected ? undefined : 'player-away'}>
              {player.name}
              {player.isLocal && ' (você)'}
              {!player.connected && ' · reconectando'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConnectionLine({ status, count }: { status: ConnectionStatus; count: number }) {
  // Texto em região viva: leitores de tela anunciam quedas e reconexões.
  return (
    <p className={`connection connection-${status.state}`} role="status">
      {describe(status, count)}
      {status.state === 'offline' && <RetryCountdown retryAt={status.retryAt} />}
    </p>
  );
}

function describe(status: ConnectionStatus, count: number): string {
  switch (status.state) {
    case 'connecting':
      return 'Entrando na sala…';
    case 'connected':
      return `Na sala · ${count} ${count === 1 ? 'jogador' : 'jogadores'}`;
    case 'reconnecting':
      return 'Conexão instável, reconectando…';
    case 'offline':
      return status.reason;
  }
}

function RetryCountdown({ retryAt }: { retryAt: number }) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return <> Nova tentativa {seconds > 0 ? `em ${seconds} s` : 'agora'}.</>;
}
