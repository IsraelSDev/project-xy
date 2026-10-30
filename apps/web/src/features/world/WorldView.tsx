import type {
  BlockedUser,
  ChatEvent,
  InvitedEvent,
  InteractionRequestedEvent,
  InteractionRespondedEvent,
  InteractionStartedEvent,
  InteractionEndedEvent,
  InteractionType,
  UserNotifyEvent,
} from '@3dx/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../app/api';
import { REALTIME_URL } from '../../app/config';
import { OverlayTransition } from '../../app/transitions';
import { useOverlay } from '../../app/useOverlay';
import {
  createGame,
  isWebGLSupported,
  type Game,
  type GameStats,
  type GameView,
  type PlayerListEntry,
  type SeatTap,
} from '../../game/engine/game';
import { fetchRealtimeTicket } from '../auth/session';
import { AvatarEditor } from '../avatar/AvatarEditor';
import { WardrobeScreen } from '../wardrobe/WardrobeScreen';
import { FriendsDialog } from '../friends/FriendsDialog';
import type { Friends } from '../friends/useFriends';
import { DirectMessagesPanel } from '../messages/DirectMessagesPanel';
import { markRead, receive, rejected, type Conversations } from '../messages/conversations';
import { ChatPanel } from '../chat/ChatPanel';
import { RoomPanel } from '../rooms/RoomPanel';
import { RoomsDialog } from '../rooms/RoomsDialog';
import { interactionOptions } from '../rooms/interactions';
import { WorldPlayerMenu } from './WorldPlayerMenu';
import { WorldSeatMenu } from './WorldSeatMenu';
import { ModerateDialog } from '../moderation/ModerateDialog';
import { ReportDialog } from '../safety/ReportDialog';
import { InteractionDialog } from '../rooms/InteractionDialog';

const INITIAL_VIEW: GameView = { status: { state: 'connecting' }, players: [], localAction: '' };
/** Mensagens guardadas na tela; as mais antigas saem. Nada do chat é salvo no servidor. */
const MAX_CHAT_MESSAGES = 100;

/**
 * Canvas do mundo 3D, chat e painel da sala. O jogo é criado uma vez por montagem e liberado ao
 * desmontar; renderizações do React não recriam nada.
 */
interface WorldViewProps {
  /** Id da conta logada (para separar mensagens privadas recebidas das enviadas). */
  userId: string;
  /** Nome público da conta (título do quarto privado). */
  userName: string;
  /** Amizades (a barra superior também usa, para a contagem de pedidos). */
  friends: Friends;
  onUnauthorized: () => void;
  editingAvatar: boolean;
  onAvatarEditorClose: () => void;
  /** Vestiário aberto: a tela cheia assume o palco 3D e o mundo fica parado atrás. */
  editingWardrobe: boolean;
  onWardrobeClose: () => void;
  /** Abre o vestiário a partir do próprio quarto. */
  onWardrobeOpen: () => void;
  /** Diálogo de amigos aberto (botão no topo, fora do mundo). */
  showingFriends: boolean;
  onFriendsClose: () => void;
  /** Abre o diálogo de amigos (ex.: botão "Convidar amigos" do dono da sala). */
  onFriendsOpen: () => void;
  /** Moderação e administração: botão Moderar na lista de jogadores. */
  canModerate: boolean;
  /** Um dado do usuário mudou fora da sala: recarrega a lista correspondente. */
  onUserNotify?: (event: UserNotifyEvent) => void;
  /** Solicitar interação consentida com outro jogador. */
  onInteract?: (targetUserId: string, type: string) => void;
  /** Abre o perfil de um membro pelo id. */
  onProfile?: (userId: string) => void;
  /** Entrega o jogo criado (e `undefined` ao destruir), para o perfil tirar o retrato do avatar. */
  onGame?: (game: Game | undefined) => void;
}

export function WorldView({
  userId,
  userName,
  friends,
  onUnauthorized,
  editingAvatar,
  onAvatarEditorClose,
  editingWardrobe,
  onWardrobeClose,
  onWardrobeOpen,
  showingFriends,
  onFriendsClose,
  onFriendsOpen,
  canModerate,
  onUserNotify,
  onProfile,
  onGame,
}: WorldViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(undefined);
  const unauthorizedRef = useRef(onUnauthorized);
  const [supported] = useState(isWebGLSupported);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(INITIAL_VIEW);
  const [messages, setMessages] = useState<ChatEvent[]>([]);
  const [notice, setNotice] = useState<string>();
  const [conversations, setConversations] = useState<Conversations>(new Map());
  const [openChat, setOpenChat] = useState<string>();
  // O jogo é criado uma vez: os callbacks dele leem o estado atual por refs.
  const openChatRef = useRef(openChat);
  const friendsRef = useRef(friends);
  const onUserNotifyRef = useRef(onUserNotify);
  const onGameRef = useRef(onGame);
  useEffect(() => {
    openChatRef.current = openChat;
    friendsRef.current = friends;
    onUserNotifyRef.current = onUserNotify;
    onGameRef.current = onGame;
  }, [openChat, friends, onUserNotify, onGame]);
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());
  const [reporting, setReporting] = useOverlay<PlayerListEntry | undefined>(undefined);
  const [moderating, setModerating] = useOverlay<PlayerListEntry | undefined>(undefined);
  const [stats, setStats] = useState<GameStats>();
  const [choosingRoom, setChoosingRoom] = useOverlay(false);
  /** Convites recebidos para salas privadas (aceitar entra sem senha). */
  const [invites, setInvites] = useState<InvitedEvent[]>([]);
  /** Solicitação de interação recebida (aguardando resposta do jogador local). */
  const [interactionRequest, setInteractionRequest] = useOverlay<
    InteractionRequestedEvent | undefined
  >(undefined);
  /** Interação ativa do jogador local (quem e que tipo). */
  const [activeInteraction, setActiveInteraction] = useState<{
    with: { id: string; name: string };
    type: InteractionType;
  }>();
  /** Menu de ações aberto ao tocar no corpo de outro jogador (posição na tela). */
  const [worldMenu, setWorldMenu] = useState<{ userId: string; x: number; y: number }>();
  /** Menu do móvel aberto ao tocar num assento. */
  const [seatMenu, setSeatMenu] = useState<{ seat: SeatTap; x: number; y: number }>();

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => {
    let cancelled = false;
    api<BlockedUser[]>('/blocks')
      .then((list) => {
        if (!cancelled) setBlocked(new Set(list.map((entry) => entry.id)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!supported || !canvas) return;

    const game = createGame(canvas, {
      realtimeUrl: REALTIME_URL,
      getTicket: fetchRealtimeTicket,
      onReady: () => {
        setReady(true);
      },
      onViewChange: setView,
      onChat: (event) => {
        setMessages((current) => [...current, event].slice(-MAX_CHAT_MESSAGES));
      },
      onChatRejected: setNotice,
      onDirectMessage: (event) => {
        setConversations((current) =>
          receive(current, event, userId, {
            open: openChatRef.current,
            nameOf: (id) =>
              friendsRef.current.entries.find((entry) => entry.user.id === id)?.user.displayName,
          }),
        );
      },
      onDirectMessageRejected: (to, reason) => {
        const name =
          friendsRef.current.entries.find((entry) => entry.user.id === to)?.user.displayName ??
          'Amigo';
        setConversations((current) => rejected(current, to, reason, name));
      },
      onInvited: (event) => {
        setInvites((current) =>
          current.some((invite) => invite.roomId === event.roomId) ? current : [...current, event],
        );
      },
      onInviteRejected: (_to, reason) => setNotice(reason),
      onNotice: setNotice,
      onUnauthorized: () => {
        unauthorizedRef.current();
      },
      onUserNotify: (event) => {
        onUserNotifyRef.current?.(event);
      },
      onInteractionRequested: (event: InteractionRequestedEvent) => {
        setInteractionRequest(event);
        setNotice(`${event.from.name} quer fazer ${event.type} com você.`);
      },
      onInteractionResponded: (event: InteractionRespondedEvent) => {
        if (event.accept) {
          setNotice(`Você e ${event.to.name} agora estão em ${event.type}.`);
          setActiveInteraction({ with: event.to, type: event.type });
        } else {
          setNotice(`${event.to.name} recusou a interação.`);
        }
        setInteractionRequest(undefined);
      },
      onInteractionStarted: (event: InteractionStartedEvent) => {
        setNotice(`Interação ${event.type} iniciada com ${event.with.name}.`);
        setActiveInteraction({ with: event.with, type: event.type });
      },
      onInteractionEnded: (event: InteractionEndedEvent) => {
        setNotice(`Interação ${event.type} com ${event.with.name} terminou.`);
        setActiveInteraction(undefined);
      },
      onStats: setStats,
      onAvatarTap: (userId, screen) => setWorldMenu({ userId, x: screen.x, y: screen.y }),
      onSeatTap: (seat, screen) => setSeatMenu({ seat, x: screen.x, y: screen.y }),
    });
    gameRef.current = game;
    onGameRef.current?.(game);
    return () => {
      game.dispose();
      gameRef.current = undefined;
      onGameRef.current?.(undefined);
      setReady(false);
      setView(INITIAL_VIEW);
      setMessages([]);
      setConversations(new Map());
      setInvites([]);
    };
  }, [supported, userId, setInteractionRequest]);

  // Mensagem privada exige a amizade no ticket: quando a lista de amigos muda, pede um novo.
  const friendIds = friends.entries
    .filter((entry) => entry.status === 'FRIEND')
    .map((entry) => entry.user.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (friendIds) void gameRef.current?.refreshTicket().catch(() => undefined);
  }, [friendIds]);

  // O vestiário traz o próprio palco: o mundo para de desenhar (e de reagir a teclas) enquanto ele
  // estiver aberto, sem sair da sala.
  useEffect(() => {
    gameRef.current?.setPaused(editingWardrobe);
    gameRef.current?.setCloset(editingWardrobe);
  }, [editingWardrobe]);

  const openConversation = useCallback((friendId: string | undefined) => {
    setOpenChat(friendId);
    if (friendId) setConversations((current) => markRead(current, friendId));
  }, []);

  const sendDirectMessage = useCallback(
    (friendId: string, text: string) => gameRef.current?.sendDirectMessage(friendId, text) ?? false,
    [],
  );

  const sendChat = useCallback((text: string) => {
    setNotice(undefined);
    return gameRef.current?.sendChat(text) ?? false;
  }, []);

  const acceptInvite = useCallback((invite: InvitedEvent) => {
    setInvites((current) => current.filter((other) => other.roomId !== invite.roomId));
    setMessages([]);
    setNotice(undefined);
    // Convidado entra sem senha: o servidor já liberou este usuário pelo convite.
    gameRef.current?.switchRoom({ kind: 'join', roomId: invite.roomId });
  }, []);

  const declineInvite = useCallback((roomId: string) => {
    setInvites((current) => current.filter((other) => other.roomId !== roomId));
  }, []);

  const toggleBlock = useCallback(
    async (player: PlayerListEntry) => {
      const isBlocked = blocked.has(player.userId);
      try {
        if (isBlocked) await api(`/blocks/${player.userId}`, { method: 'DELETE' });
        else await api('/blocks', { json: { userId: player.userId } });
        setBlocked((current) => {
          const next = new Set(current);
          if (isBlocked) next.delete(player.userId);
          else next.add(player.userId);
          return next;
        });
        // O filtro do chat é do servidor: ele só aplica o bloqueio com um ticket novo assinado.
        await gameRef.current?.refreshTicket();
        // Bloquear desfaz amizade e pedidos no servidor.
        if (!isBlocked) await friends.reload();
        setNotice(isBlocked ? `${player.name} desbloqueado.` : `${player.name} bloqueado.`);
      } catch (caught) {
        setNotice(caught instanceof Error ? caught.message : 'Não foi possível bloquear.');
      }
    },
    [blocked, friends],
  );

  const befriend = useCallback(
    async (player: PlayerListEntry) => {
      const incoming = friends.statusOf(player.userId) === 'INCOMING';
      try {
        // Pedir para quem já tinha pedido também vira amizade (a lista local pode estar atrasada).
        const result = incoming ? 'FRIEND' : await friends.request(player.userId);
        if (incoming) await friends.accept(player.userId);
        setNotice(
          result === 'FRIEND'
            ? `Você e ${player.name} agora são amigos.`
            : `Pedido enviado para ${player.name}.`,
        );
      } catch (caught) {
        setNotice(caught instanceof Error ? caught.message : 'Não foi possível adicionar.');
      }
    },
    [friends],
  );

  if (!supported) {
    return (
      <p className="world-error" role="alert">
        Seu navegador não suporta WebGL, necessário para exibir o mundo 3D. Tente um navegador
        desktop atualizado com aceleração de hardware ativa.
      </p>
    );
  }

  // Menu do mundo: quem foi tocado (some se a pessoa sair da sala) e o que o servidor vai aceitar.
  const menuPlayer = worldMenu
    ? view.players.find((player) => player.userId === worldMenu.userId && !player.isLocal)
    : undefined;
  const menuInteractions = menuPlayer
    ? interactionOptions({
        localModel: view.players.find((player) => player.isLocal)?.model,
        targetModel: menuPlayer.model,
        scene: view.room?.scene,
        localAction: view.localAction,
      })
    : [];

  return (
    <>
      <canvas ref={canvasRef} className="world-canvas" aria-label="Mundo 3D" tabIndex={0} />
      {!ready && (
        <p className="world-loading" role="status">
          Carregando o mundo…
        </p>
      )}
      <div className="hud hud-bottom-start">
        <RoomPanel
          view={view}
          blocked={blocked}
          onToggleBlock={(player) => void toggleBlock(player)}
          onReport={setReporting}
          friendStatusOf={friends.statusOf}
          onFriend={(player) => void befriend(player)}
          onModerate={canModerate ? setModerating : undefined}
          stats={stats}
          onOpenRooms={() => setChoosingRoom(true)}
          onAct={(action) => gameRef.current?.act(action)}
          onGreet={() => gameRef.current?.greetNearest()}
          onInteract={(targetUserId, type) => gameRef.current?.interact(targetUserId, type)}
          onProfile={onProfile ? (player) => onProfile(player.userId) : undefined}
          onChangePassword={(password) => gameRef.current?.changePassword(password)}
          onOpenFriends={onFriendsOpen}
          onOpenWardrobe={onWardrobeOpen}
        />
      </div>
      <div className="hud hud-bottom-end">
        <DirectMessagesPanel
          me={userId}
          friends={friends.entries.filter((entry) => entry.status === 'FRIEND')}
          conversations={conversations}
          open={openChat}
          onOpen={openConversation}
          onSend={sendDirectMessage}
          onProfile={onProfile}
        />
        <ChatPanel
          messages={messages}
          notice={notice}
          connected={view.status.state === 'connected'}
          onSend={sendChat}
        />
      </div>
      {invites.length > 0 && (
        <div className="invites">
          {invites.map((invite) => (
            <div className="hud-panel invite-alert" role="status" key={invite.roomId}>
              <span>
                <strong>{invite.from}</strong> convidou você para a sala «{invite.title}».
              </span>
              <button type="button" className="primary" onClick={() => acceptInvite(invite)}>
                Aceitar
              </button>
              <button type="button" className="ghost" onClick={() => declineInvite(invite.roomId)}>
                Recusar
              </button>
            </div>
          ))}
        </div>
      )}
      {choosingRoom && (
        <OverlayTransition>
          <RoomsDialog
            userId={userId}
            userName={userName}
            currentRoomId={view.room?.roomId}
            onChoose={(target) => {
              setChoosingRoom(false);
              setMessages([]);
              setNotice(undefined);
              gameRef.current?.switchRoom(target);
            }}
            onClose={() => setChoosingRoom(false)}
          />
        </OverlayTransition>
      )}
      {showingFriends && (
        <OverlayTransition>
          <FriendsDialog
            friends={friends}
            onClose={onFriendsClose}
            onMessage={(friendId) => {
              openConversation(friendId);
              onFriendsClose();
            }}
            canInvite={view.room?.isOwner === true && view.room.privacy === 'private'}
            onInvite={(friendId) => gameRef.current?.invite(friendId)}
            onProfile={onProfile}
          />
        </OverlayTransition>
      )}
      {editingAvatar && (
        <OverlayTransition>
          <AvatarEditor
            onPreview={(avatar) => gameRef.current?.previewAvatar(avatar)}
            onSaved={() => gameRef.current?.refreshTicket() ?? Promise.resolve()}
            onClose={onAvatarEditorClose}
          />
        </OverlayTransition>
      )}
      {editingWardrobe && (
        <OverlayTransition>
          <WardrobeScreen
            onSaved={() => gameRef.current?.refreshTicket() ?? Promise.resolve()}
            onClose={onWardrobeClose}
          />
        </OverlayTransition>
      )}
      {moderating && (
        <OverlayTransition>
          <ModerateDialog
            target={{ userId: moderating.userId, name: moderating.name }}
            onClose={() => setModerating(undefined)}
          />
        </OverlayTransition>
      )}
      {reporting && (
        <OverlayTransition>
          <ReportDialog
            target={{ userId: reporting.userId, name: reporting.name }}
            onClose={() => setReporting(undefined)}
          />
        </OverlayTransition>
      )}
      {interactionRequest && (
        <OverlayTransition>
          <InteractionDialog
            from={interactionRequest.from}
            type={interactionRequest.type}
            onRespond={(accept) =>
              gameRef.current?.respondInteraction(interactionRequest.from.id, accept)
            }
            onClose={() => setInteractionRequest(undefined)}
          />
        </OverlayTransition>
      )}
      {worldMenu && menuPlayer && (
        <WorldPlayerMenu
          player={menuPlayer}
          at={worldMenu}
          blocked={blocked.has(menuPlayer.userId)}
          friendStatus={friends.statusOf(menuPlayer.userId)}
          interactions={menuInteractions}
          onProfile={onProfile ? () => onProfile(menuPlayer.userId) : undefined}
          onFriend={() => void befriend(menuPlayer)}
          onBlock={() => void toggleBlock(menuPlayer)}
          onReport={() => setReporting(menuPlayer)}
          onInteract={(type) => gameRef.current?.interact(menuPlayer.userId, type)}
          onClose={() => setWorldMenu(undefined)}
        />
      )}
      {seatMenu && (
        <WorldSeatMenu
          seat={seatMenu.seat}
          at={seatMenu}
          sitting={view.localAction === 'sit'}
          players={view.players.filter((player) => !player.isLocal && !blocked.has(player.userId))}
          localModel={view.players.find((player) => player.isLocal)?.model}
          onSit={() => gameRef.current?.sitAt({ x: seatMenu.seat.x, z: seatMenu.seat.z })}
          onLeave={() => gameRef.current?.act('stand')}
          onInvite={(player, type) =>
            gameRef.current?.sitAndInvite(
              { x: seatMenu.seat.x, z: seatMenu.seat.z },
              player.userId,
              type,
            )
          }
          onClose={() => setSeatMenu(undefined)}
        />
      )}
      {activeInteraction && (
        <div className="hud-panel interaction-active" role="status">
          <span>
            {activeInteraction.type} com {activeInteraction.with.name}
          </span>
          <button type="button" className="ghost" onClick={() => gameRef.current?.act('stand')}>
            Encerrar
          </button>
        </div>
      )}
    </>
  );
}
