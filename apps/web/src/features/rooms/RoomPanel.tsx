import { useEffect, useState } from 'react';
import type { GameStats, GameView, PlayerListEntry } from '../../game/engine/game';
import type { ConnectionStatus } from '../../game/network/lounge-connection';

interface RoomPanelProps {
  view: GameView;
  /** Ids de usuário que o jogador local bloqueou. */
  blocked: ReadonlySet<string>;
  onToggleBlock: (player: PlayerListEntry) => void;
  onReport: (player: PlayerListEntry) => void;
  /** Diagnóstico de desempenho (atualizado a cada segundo). */
  stats?: GameStats;
}

/** Estado da conexão e jogadores presentes, com bloquear e denunciar para os outros. */
export function RoomPanel({ view, blocked, onToggleBlock, onReport, stats }: RoomPanelProps) {
  // Outra sessão da mesma conta (outra aba, ou a anterior aguardando reconexão) também é "você".
  const localUserId = view.players.find((player) => player.isLocal)?.userId;
  return (
    <section className="hud-panel room-panel" aria-label="Sala">
      <ConnectionLine status={view.status} count={view.players.length} />
      {view.players.length > 0 && (
        <ul className="players">
          {view.players.map((player) => {
            const isBlocked = blocked.has(player.userId);
            const isSelf = player.userId === localUserId;
            return (
              <li key={player.id} className={player.connected ? undefined : 'player-away'}>
                <span>
                  {player.name}
                  {player.isLocal && ' (você)'}
                  {isSelf && !player.isLocal && ' (outra sessão sua)'}
                  {isBlocked && ' · bloqueado'}
                  {!player.connected && ' · reconectando'}
                </span>
                {!isSelf && (
                  <span className="player-actions">
                    <button type="button" onClick={() => onToggleBlock(player)}>
                      {isBlocked ? 'Desbloquear' : 'Bloquear'}
                    </button>
                    <button type="button" onClick={() => onReport(player)}>
                      Denunciar
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {stats && (
        <p className="stats">
          {stats.fps} fps · {stats.activeMeshes} malhas ativas · {stats.avatarMeshes} de avatares
        </p>
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
