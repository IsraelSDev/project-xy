import type { FriendStatus } from '@3dx/contracts';
import { useEffect, useState, type CSSProperties } from 'react';
import { identityColor, initialOf } from '../../app/identity-color';
import { StaffBadge } from '../../app/StaffBadge';
import type { GameAction, GameStats, GameView, PlayerListEntry } from '../../game/engine/game';
import { inviteLink } from './RoomsDialog';
import type { ConnectionStatus } from '../../game/network/lounge-connection';

interface RoomPanelProps {
  view: GameView;
  /** Ids de usuário que o jogador local bloqueou. */
  blocked: ReadonlySet<string>;
  onToggleBlock: (player: PlayerListEntry) => void;
  onReport: (player: PlayerListEntry) => void;
  /** Amizade com o jogador, do ponto de vista local. */
  friendStatusOf: (userId: string) => FriendStatus | undefined;
  /** Adicionar amigo ou aceitar o pedido dele. */
  onFriend: (player: PlayerListEntry) => void;
  /** Só para a moderação: sanção direta (sem denúncia). */
  onModerate?: (player: PlayerListEntry) => void;
  /** Diagnóstico de desempenho (atualizado a cada segundo). */
  stats?: GameStats;
  onOpenRooms: () => void;
  onAct: (action: GameAction) => void;
  onRotateInvite: () => void;
}

/** Estado da conexão e jogadores presentes, com bloquear e denunciar para os outros. */
export function RoomPanel({
  view,
  blocked,
  onToggleBlock,
  onReport,
  onModerate,
  friendStatusOf,
  onFriend,
  stats,
  onOpenRooms,
  onAct,
  onRotateInvite,
}: RoomPanelProps) {
  // Outra sessão da mesma conta (outra aba, ou a anterior aguardando reconexão) também é "você".
  const localUserId = view.players.find((player) => player.isLocal)?.userId;
  /** Jogador com o menu de ações aberto (um por vez). */
  const [menuFor, setMenuFor] = useState<string>();
  const act = (action: () => void) => {
    setMenuFor(undefined);
    action();
  };

  return (
    <section className="hud-panel room-panel" aria-label="Sala">
      <p className="room-title">
        <span className="room-name">
          <strong>{view.room?.title ?? 'Sala'}</strong>
          {view.room?.privacy === 'private' && <span className="badge badge-accent">privada</span>}
        </span>
        <button type="button" className="small" onClick={onOpenRooms}>
          Salas
        </button>
      </p>
      {view.room?.isOwner && view.room.invite && (
        <InviteControls
          roomId={view.room.roomId}
          code={view.room.invite}
          onRotate={onRotateInvite}
        />
      )}
      <ConnectionLine status={view.status} count={view.players.length} />
      {view.status.state === 'connected' && (
        <div className="actions" role="group" aria-label="Ações">
          <button type="button" onClick={() => onAct('sit')}>
            {view.localAction === 'sit' ? 'Levantar' : 'Sentar'} <kbd>E</kbd>
          </button>
          <button type="button" onClick={() => onAct('wave')}>
            Acenar <kbd>1</kbd>
          </button>
          <button type="button" onClick={() => onAct('dance')}>
            {view.localAction === 'dance' ? 'Parar' : 'Dançar'} <kbd>2</kbd>
          </button>
        </div>
      )}
      {view.players.length > 0 && (
        <ul className="players">
          {view.players.map((player) => {
            const isBlocked = blocked.has(player.userId);
            const isSelf = player.userId === localUserId;
            const friendStatus = friendStatusOf(player.userId);
            const menuOpen = menuFor === player.id;
            const classes = [player.connected ? '' : 'player-away', menuOpen ? 'menu-open' : '']
              .filter(Boolean)
              .join(' ');
            return (
              <li key={player.id} className={classes || undefined}>
                <span
                  className="avatar-dot"
                  style={{ '--dot': identityColor(player.userId) } as CSSProperties}
                  aria-hidden="true"
                >
                  {initialOf(player.name)}
                </span>
                <span className="player-name">
                  {player.name}
                  <StaffBadge role={player.role} />
                  {player.isLocal && <span className="badge">você</span>}
                  {isSelf && !player.isLocal && <span className="badge">outra sessão sua</span>}
                  {friendStatus === 'FRIEND' && <span className="badge badge-ok">amigo</span>}
                  {friendStatus === 'INCOMING' && (
                    <span className="badge badge-accent">pediu amizade</span>
                  )}
                  {isBlocked && <span className="badge badge-warn">bloqueado</span>}
                  {!player.connected && <span className="badge">reconectando</span>}
                </span>
                {!isSelf && (
                  <button
                    type="button"
                    className="icon ghost"
                    aria-label={`Ações para ${player.name}`}
                    aria-expanded={menuOpen}
                    onClick={() => setMenuFor(menuOpen ? undefined : player.id)}
                  >
                    ⋯
                  </button>
                )}
                {!isSelf && menuOpen && (
                  <span className="player-menu player-actions">
                    {!isBlocked && friendStatus !== 'FRIEND' && (
                      <button
                        type="button"
                        className={friendStatus === 'INCOMING' ? 'primary' : undefined}
                        disabled={friendStatus === 'OUTGOING'}
                        onClick={() => act(() => onFriend(player))}
                      >
                        {friendStatus === 'OUTGOING'
                          ? 'Pedido enviado'
                          : friendStatus === 'INCOMING'
                            ? 'Aceitar amizade'
                            : 'Adicionar amigo'}
                      </button>
                    )}
                    <button type="button" onClick={() => act(() => onToggleBlock(player))}>
                      {isBlocked ? 'Desbloquear' : 'Bloquear'}
                    </button>
                    <button type="button" onClick={() => act(() => onReport(player))}>
                      Denunciar
                    </button>
                    {onModerate && (
                      <button type="button" onClick={() => act(() => onModerate(player))}>
                        Moderar
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* Métricas de desempenho: só em desenvolvimento. */}
      {import.meta.env.DEV && stats && (
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

function InviteControls({
  roomId,
  code,
  onRotate,
}: {
  roomId: string;
  code: string;
  onRotate: () => void;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const link = inviteLink(roomId, code);

  // A área de transferência pode ser negada (permissão, aba sem foco): aí o link aparece para copiar.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setState('copied');
    } catch {
      setState('manual');
    }
  };

  return (
    <div className="invite">
      <button type="button" onClick={() => void copy()}>
        {state === 'copied' ? 'Convite copiado' : 'Copiar convite'}
      </button>
      <button
        type="button"
        onClick={() => {
          setState('idle');
          onRotate();
        }}
        title="Gera um convite novo; os links antigos param de funcionar"
      >
        Trocar convite
      </button>
      {state === 'manual' && (
        <label className="invite-link">
          Copie o link do convite:
          <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}
