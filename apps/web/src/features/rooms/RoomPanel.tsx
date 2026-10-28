import {
  INTERACTION_LABELS,
  INTERACTION_TYPES,
  POSE_ACTIONS,
  RoomPassword,
  isPoseAction,
  type FriendStatus,
  type InteractionType,
} from '@3dx/contracts';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { identityColor, initialOf } from '../../app/identity-color';
import { StaffBadge } from '../../app/StaffBadge';
import type { GameAction, GameStats, GameView, PlayerListEntry } from '../../game/engine/game';
import type { ConnectionStatus } from '../../game/network/lounge-connection';
import { PAIR_POSES, coupleComposition, pairAccepts, sceneDisplayName } from '@3dx/game-core';

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
  /** Abraça o jogador mais próximo ou acena (cumprimentar). */
  onGreet: () => void;
  /** Dono de sala privada: troca a senha. */
  onChangePassword: (password: string) => void;
  /** Dono de sala privada: abre a lista de amigos para convidar. */
  onOpenFriends: () => void;
  /** Dono do quarto: abre o vestiário. */
  onOpenWardrobe: () => void;
  /** Solicitar interação consentida com outro jogador. */
  onInteract?: (targetUserId: string, type: InteractionType) => void;
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
  onGreet,
  onChangePassword,
  onOpenFriends,
  onOpenWardrobe,
  onInteract,
}: RoomPanelProps) {
  // Outra sessão da mesma conta (outra aba, ou a anterior aguardando reconexão) também é "você".
  const localUserId = view.players.find((player) => player.isLocal)?.userId;
  /** Jogador com o menu de ações aberto (um por vez). */
  const [menuFor, setMenuFor] = useState<string>();
  const act = (action: () => void) => {
    setMenuFor(undefined);
    action();
  };
  // Pares de móvel só aparecem quando o jogador local está sentado; o servidor valida de novo.
  // Os de parede dependem das âncoras do estúdio (as outras salas ainda não têm âncoras).
  const anchorReady = (type: InteractionType) => {
    const seat = PAIR_POSES[type]?.seat;
    if (seat === 'wall') return view.room?.scene === 'studio';
    return seat === undefined || view.localAction === 'sit';
  };
  const bodyOf = (model: PlayerListEntry['model'] | undefined) =>
    model === '3dx-female' ? 'female' : 'male';
  const localModel = view.players.find((player) => player.isLocal)?.model;
  // Cada par aceita uma composição (M/F, F/F, M/M): o menu do jogador só mostra o que o
  // servidor vai aceitar entre o corpo local e o corpo dele.
  const interactionsFor = (target: PlayerListEntry) => {
    const composition = coupleComposition(bodyOf(localModel), bodyOf(target.model));
    return INTERACTION_TYPES.filter(
      (type) => anchorReady(type) && pairAccepts(PAIR_POSES[type], composition),
    );
  };

  return (
    <section className="hud-panel room-panel" aria-label="Sala">
      <p className="room-title">
        <span className="room-name">
          <strong>{view.room?.title ?? 'Sala'}</strong>{' '}
          <span className="room-scene">{sceneDisplayName(view.room?.scene ?? 'lounge')}</span>
          {view.room?.privacy === 'private' && <span className="badge badge-accent">privada</span>}
        </span>
        <button type="button" className="small" onClick={onOpenRooms}>
          Salas
        </button>
      </p>
      {view.room?.isOwner && view.room.privacy === 'private' && (
        <OwnerControls
          onChangePassword={onChangePassword}
          onInvite={onOpenFriends}
          onWardrobe={onOpenWardrobe}
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
          <button type="button" onClick={() => onAct('dance2')}>
            {view.localAction === 'dance2' ? 'Parar' : 'Dança pole'} <kbd>4</kbd>
          </button>
          <button type="button" onClick={() => onAct('beer')}>
            {view.localAction === 'beer' ? 'Bebendo…' : 'Pegar cerveja'} <kbd>3</kbd>
          </button>
          <button type="button" onClick={onGreet}>
            Abraçar / Cumprimentar
          </button>
          <label className="pose-picker">
            Pose
            <select
              value={isPoseAction(view.localAction) ? view.localAction : ''}
              onChange={(event) => {
                onAct((event.target.value || 'stand') as GameAction);
              }}
            >
              <option value="">Nenhuma</option>
              {POSE_ACTIONS.map((pose) => (
                <option key={pose.id} value={pose.id}>
                  {pose.label}
                </option>
              ))}
            </select>
          </label>
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
                    {!isBlocked && onInteract && (
                      <>
                        {interactionsFor(player).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              const interact = onInteract;
                              if (interact) interact(player.userId, type);
                            }}
                          >
                            {INTERACTION_LABELS[type]}
                          </button>
                        ))}
                      </>
                    )}
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

/** Controles do dono da sala privada: convidar amigos e trocar a senha. */
function OwnerControls({
  onChangePassword,
  onInvite,
  onWardrobe,
}: {
  onChangePassword: (password: string) => void;
  onInvite: () => void;
  onWardrobe: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState<string>();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = RoomPassword.safeParse(new FormData(event.currentTarget).get('password'));
    if (!password.success) {
      setNotice('A senha precisa ter de 3 a 40 caracteres.');
      return;
    }
    onChangePassword(password.data);
    setNotice('Senha da sala alterada.');
    setChanging(false);
  };

  return (
    <div className="owner-controls">
      <button type="button" onClick={onWardrobe}>
        Trocar de roupa
      </button>
      <button type="button" onClick={onInvite}>
        Convidar amigos
      </button>
      <button
        type="button"
        onClick={() => {
          setNotice(undefined);
          setChanging((open) => !open);
        }}
        aria-expanded={changing}
      >
        {changing ? 'Cancelar' : 'Trocar senha'}
      </button>
      {changing && (
        <form className="room-password" onSubmit={submit}>
          <input
            name="password"
            type="password"
            minLength={3}
            maxLength={40}
            placeholder="Nova senha"
            aria-label="Nova senha da sala"
            autoComplete="new-password"
            required
          />
          <button type="submit" className="primary">
            Salvar
          </button>
        </form>
      )}
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
