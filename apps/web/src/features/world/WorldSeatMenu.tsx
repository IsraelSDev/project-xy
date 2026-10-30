import { type InteractionType } from '@3dx/contracts';
import { useEffect, useRef } from 'react';
import type { PlayerListEntry, SeatTap } from '../../game/engine/game';
import { seatPairOptions } from '../rooms/interactions';

interface WorldSeatMenuProps {
  seat: SeatTap;
  /** Posição do toque na tela (px). */
  at: { x: number; y: number };
  /** O jogador local já está sentado (mostra "Levantar"). */
  sitting: boolean;
  /** Outros jogadores da sala que dá para convidar. */
  players: readonly PlayerListEntry[];
  localModel?: string;
  onSit: () => void;
  onLeave: () => void;
  onInvite: (player: PlayerListEntry, type: InteractionType) => void;
  onClose: () => void;
}

const MENU_WIDTH = 216;
const MENU_MARGIN = 8;

const KIND_LABEL: Record<SeatTap['kind'], string> = {
  sofa: 'Sofá',
  chair: 'Cadeira',
  bed: 'Cama',
  stool: 'Banco',
  wall: 'Parede',
};

/**
 * Menu do móvel aberto ao tocar num assento: senta ali ou convida alguém da sala para aquela
 * posição (o convite senta o jogador local antes de chamar o servidor). Fecha ao escolher, no Esc
 * ou ao tocar fora.
 */
export function WorldSeatMenu({
  seat,
  at,
  sitting,
  players,
  localModel,
  onSit,
  onLeave,
  onInvite,
  onClose,
}: WorldSeatMenuProps) {
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
  const top = Math.max(MENU_MARGIN, Math.min(at.y - 24, window.innerHeight - 320));

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  const label = KIND_LABEL[seat.kind];
  // Pares do móvel (o primeiro é a pose padrão) para cada jogador, pela composição dos corpos.
  const invitees =
    seat.kind === 'sofa' || seat.kind === 'chair' || seat.kind === 'bed'
      ? players
          .map((player) => ({
            player,
            type: seatPairOptions(
              seat.kind as 'sofa' | 'chair' | 'bed',
              localModel,
              player.model,
            )[0],
          }))
          .filter(
            (entry): entry is { player: PlayerListEntry; type: InteractionType } =>
              entry.type !== undefined,
          )
      : [];

  return (
    <div
      ref={ref}
      className="hud-panel world-menu"
      style={{ left, top, width: MENU_WIDTH }}
      role="menu"
      aria-label={`Ações do ${label.toLowerCase()}`}
    >
      <p className="world-menu-title">{label}</p>
      {sitting ? (
        <button type="button" role="menuitem" onClick={run(onLeave)}>
          Levantar
        </button>
      ) : (
        <button type="button" role="menuitem" disabled={seat.occupied} onClick={run(onSit)}>
          {seat.occupied ? 'Lugar ocupado' : 'Sentar aqui'}
        </button>
      )}
      {!seat.occupied && invitees.length > 0 && (
        <>
          <p className="world-menu-label">Convidar para cá</p>
          {invitees.map(({ player, type }) => (
            <button
              key={player.userId}
              type="button"
              role="menuitem"
              onClick={run(() => onInvite(player, type))}
            >
              {player.name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
