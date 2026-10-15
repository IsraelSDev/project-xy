import type { BlockedUser, ChatEvent } from '@3dx/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../app/api';
import { REALTIME_URL } from '../../app/config';
import {
  createGame,
  isWebGLSupported,
  type Game,
  type GameStats,
  type GameView,
  type PlayerListEntry,
} from '../../game/engine/game';
import { fetchRealtimeTicket } from '../auth/session';
import { AvatarEditor } from '../avatar/AvatarEditor';
import { FriendsDialog } from '../friends/FriendsDialog';
import { useFriends } from '../friends/useFriends';
import { DirectMessagesPanel } from '../messages/DirectMessagesPanel';
import { markRead, receive, rejected, type Conversations } from '../messages/conversations';
import { ChatPanel } from '../chat/ChatPanel';
import { RoomPanel } from '../rooms/RoomPanel';
import { RoomsDialog, takeInviteFromUrl } from '../rooms/RoomsDialog';
import { ModerateDialog } from '../moderation/ModerateDialog';
import { ReportDialog } from '../safety/ReportDialog';

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
  onUnauthorized: () => void;
  editingAvatar: boolean;
  onAvatarEditorClose: () => void;
  /** Diálogo de amigos aberto (botão no topo, fora do mundo). */
  showingFriends: boolean;
  onFriendsClose: () => void;
  /** Moderação e administração: botão Moderar na lista de jogadores. */
  canModerate: boolean;
}

export function WorldView({
  userId,
  onUnauthorized,
  editingAvatar,
  onAvatarEditorClose,
  showingFriends,
  onFriendsClose,
  canModerate,
}: WorldViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(undefined);
  const unauthorizedRef = useRef(onUnauthorized);
  const [supported] = useState(isWebGLSupported);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(INITIAL_VIEW);
  const [messages, setMessages] = useState<ChatEvent[]>([]);
  const [notice, setNotice] = useState<string>();
  const friends = useFriends();
  const [conversations, setConversations] = useState<Conversations>(new Map());
  const [openChat, setOpenChat] = useState<string>();
  // O jogo é criado uma vez: os callbacks dele leem o estado atual por refs.
  const openChatRef = useRef(openChat);
  const friendsRef = useRef(friends);
  useEffect(() => {
    openChatRef.current = openChat;
    friendsRef.current = friends;
  }, [openChat, friends]);
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());
  const [reporting, setReporting] = useState<PlayerListEntry>();
  const [moderating, setModerating] = useState<PlayerListEntry>();
  const [stats, setStats] = useState<GameStats>();
  const [choosingRoom, setChoosingRoom] = useState(false);

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
      initialRoom: takeInviteFromUrl(),
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
      onNotice: setNotice,
      onUnauthorized: () => {
        unauthorizedRef.current();
      },
      onStats: setStats,
    });
    gameRef.current = game;
    return () => {
      game.dispose();
      gameRef.current = undefined;
      setReady(false);
      setView(INITIAL_VIEW);
      setMessages([]);
      setConversations(new Map());
    };
  }, [supported, userId]);

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
        if (incoming) await friends.accept(player.userId);
        else await friends.request(player.userId);
        setNotice(
          incoming
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
          onRotateInvite={() => gameRef.current?.rotateInvite()}
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
        />
        <ChatPanel
          messages={messages}
          notice={notice}
          connected={view.status.state === 'connected'}
          onSend={sendChat}
        />
      </div>
      {choosingRoom && (
        <RoomsDialog
          currentRoomId={view.room?.roomId}
          onChoose={(target) => {
            setChoosingRoom(false);
            setMessages([]);
            setNotice(undefined);
            gameRef.current?.switchRoom(target);
          }}
          onClose={() => setChoosingRoom(false)}
        />
      )}
      {showingFriends && (
        <FriendsDialog
          friends={friends}
          onClose={onFriendsClose}
          onMessage={(friendId) => {
            openConversation(friendId);
            onFriendsClose();
          }}
        />
      )}
      {editingAvatar && (
        <AvatarEditor
          onPreview={(avatar) => gameRef.current?.previewAvatar(avatar)}
          onSaved={() => gameRef.current?.refreshTicket() ?? Promise.resolve()}
          onClose={onAvatarEditorClose}
        />
      )}
      {moderating && (
        <ModerateDialog
          target={{ userId: moderating.userId, name: moderating.name }}
          onClose={() => setModerating(undefined)}
        />
      )}
      {reporting && (
        <ReportDialog
          target={{ userId: reporting.userId, name: reporting.name }}
          onClose={() => setReporting(undefined)}
        />
      )}
    </>
  );
}
