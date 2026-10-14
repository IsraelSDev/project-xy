import type { BlockedUser, ChatEvent } from '@3dx/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../app/api';
import { REALTIME_URL } from '../../app/config';
import {
  createGame,
  isWebGLSupported,
  type Game,
  type GameView,
  type PlayerListEntry,
} from '../../game/engine/game';
import { fetchRealtimeTicket } from '../auth/session';
import { ChatPanel } from '../chat/ChatPanel';
import { RoomPanel } from '../rooms/RoomPanel';
import { ReportDialog } from '../safety/ReportDialog';

const INITIAL_VIEW: GameView = { status: { state: 'connecting' }, players: [] };
/** Mensagens guardadas na tela; as mais antigas saem. Nada do chat é salvo no servidor. */
const MAX_CHAT_MESSAGES = 100;

/**
 * Canvas do mundo 3D, chat e painel da sala. O jogo é criado uma vez por montagem e liberado ao
 * desmontar; renderizações do React não recriam nada.
 */
export function WorldView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(undefined);
  const unauthorizedRef = useRef(onUnauthorized);
  const [supported] = useState(isWebGLSupported);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(INITIAL_VIEW);
  const [messages, setMessages] = useState<ChatEvent[]>([]);
  const [notice, setNotice] = useState<string>();
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());
  const [reporting, setReporting] = useState<PlayerListEntry>();

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
      onUnauthorized: () => {
        unauthorizedRef.current();
      },
    });
    gameRef.current = game;
    return () => {
      game.dispose();
      gameRef.current = undefined;
      setReady(false);
      setView(INITIAL_VIEW);
      setMessages([]);
    };
  }, [supported]);

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
        setNotice(isBlocked ? `${player.name} desbloqueado.` : `${player.name} bloqueado.`);
      } catch (caught) {
        setNotice(caught instanceof Error ? caught.message : 'Não foi possível bloquear.');
      }
    },
    [blocked],
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
        />
      </div>
      <div className="hud hud-bottom-end">
        <ChatPanel
          messages={messages}
          notice={notice}
          connected={view.status.state === 'connected'}
          onSend={sendChat}
        />
      </div>
      {reporting && (
        <ReportDialog
          target={{ userId: reporting.userId, name: reporting.name }}
          onClose={() => setReporting(undefined)}
        />
      )}
    </>
  );
}
