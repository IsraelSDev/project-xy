import { INTERACTION_LABELS, type InteractionType } from '@3dx/contracts';
import { useEffect, useRef } from 'react';
import type { PlayerListEntry } from '../../game/engine/game';
import type { FriendStatus } from '@3dx/contracts';

interface WorldPlayerMenuProps {
  player: PlayerListEntry;
  /** Posição do toque na tela (px). */
  at: { x: number; y: number };
  blocked: boolean;
  friendStatus?: FriendStatus;
  /** Interações que o servidor aceita entre o corpo local e o dele agora. */
  interactions: readonly InteractionType[];
  onProfile?: () => void;
  onFriend: () => void;
  onBlock: () => void;
  onReport: () => void;
  onInteract: (type: InteractionType) => void;
  onClose: () => void;
}

const MENU_WIDTH = 208;
const MENU_MARGIN = 8;

/**
 * Menu de ações aberto ao tocar no corpo de alguém no mundo (sem passar pela lista da sala).
 * Posiciona-se ao lado do toque, dentro da janela, e fecha ao escolher uma ação, no Esc ou ao
 * tocar fora.
 */
export function WorldPlayerMenu({
  player,
  at,
  blocked,
  friendStatus,
  interactions,
  onProfile,
  onFriend,
  onBlock,
  onReport,
  onInteract,
  onClose,
}: WorldPlayerMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose]);

  const left = Math.max(
    MENU_MARGIN,
    Math.min(at.x + 12, window.innerWidth - MENU_WIDTH - MENU_MARGIN),
  );
  const top = Math.max(MENU_MARGIN, Math.min(at.y - 24, window.innerHeight - 360));

  /** Executa a ação e fecha o menu (o mesmo gesto não dispara duas coisas). */
  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  const friendLabel =
    friendStatus === 'FRIEND'
      ? undefined
      : friendStatus === 'INCOMING'
        ? 'Aceitar amizade'
        : friendStatus === 'OUTGOING'
          ? 'Pedido enviado'
          : 'Adicionar amigo';

  return (
    <div
      ref={ref}
      className="hud-panel world-menu"
      style={{ left, top, width: MENU_WIDTH }}
      role="menu"
      aria-label={`Ações para ${player.name}`}
    >
      <p className="world-menu-title">{player.name}</p>
      {onProfile && (
        <button type="button" role="menuitem" onClick={run(onProfile)}>
          Ver perfil
        </button>
      )}
      {!blocked && friendLabel && (
        <button
          type="button"
          role="menuitem"
          disabled={friendStatus === 'OUTGOING'}
          onClick={run(onFriend)}
        >
          {friendLabel}
        </button>
      )}
      {!blocked &&
        interactions.map((type) => (
          <button key={type} type="button" role="menuitem" onClick={run(() => onInteract(type))}>
            {INTERACTION_LABELS[type]}
          </button>
        ))}
      <button type="button" role="menuitem" onClick={run(onBlock)}>
        {blocked ? 'Desbloquear' : 'Bloquear'}
      </button>
      <button type="button" role="menuitem" onClick={run(onReport)}>
        Denunciar
      </button>
    </div>
  );
}
