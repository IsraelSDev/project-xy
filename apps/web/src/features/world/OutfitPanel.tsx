import type { AvatarConfig } from '@3dx/contracts';
import { useState } from 'react';
import { Icon } from '../../app/Icon';
import {
  OUTFIT_SLOTS,
  pieceIcon,
  pieceId,
  pieceLabel,
  pieceThumbPath,
  shortPieceLabel,
  wearingClothes,
  wornPieces,
  type OutfitSlot,
} from './outfit';

interface OutfitPanelProps {
  /** Avatar local (o que está valendo no servidor). */
  avatar?: AvatarConfig;
  /** Peças tiradas nesta sessão, por slot: dá para vestir de novo sem ir ao vestiário. */
  removed: Partial<Record<OutfitSlot, string>>;
  /** Salvando no servidor: evita cliques em sequência com estado velho. */
  busy: boolean;
  onRemove: (slot: OutfitSlot) => void;
  onWear: (slot: OutfitSlot, id: string) => void;
  /** Tira camada de cima, fantasia, parte de baixo, meias, sapatos e luvas (mantém íntima/acessórios). */
  onUndress: () => void;
}

/** Miniatura da peça; se o PNG não existir, cai no ícone do slot. */
function PieceThumb({ slot, id }: { slot: OutfitSlot; id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="outfit-tile-icon">
        <Icon name={pieceIcon(slot, id)} size={40} />
      </span>
    );
  }
  return (
    <img
      className="outfit-tile-image"
      src={pieceThumbPath(id)}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * "Roupa": o que o avatar está vestindo agora, em uma grade de miniaturas — um toque na peça tira,
 * e as peças tiradas ficam em "Vestir de novo" com o mesmo visual. Sem abrir o vestiário.
 */
export function OutfitPanel({
  avatar,
  removed,
  busy,
  onRemove,
  onWear,
  onUndress,
}: OutfitPanelProps) {
  const [open, setOpen] = useState(false);
  const worn = avatar ? wornPieces(avatar) : [];
  const stripped = avatar ? !wearingClothes(avatar) : true;
  const removedSlots = OUTFIT_SLOTS.filter(
    (slot) => removed[slot] !== undefined && (!avatar || pieceId(avatar, slot) === 'none'),
  );

  return (
    <div className={`hud-panel outfit-panel${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="outfit-header"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="shirt" size={16} />
        <span>Roupa</span>
        <span className="outfit-summary">
          {!avatar
            ? 'carregando…'
            : worn.length === 0
              ? 'sem roupa'
              : `${worn.length} ${worn.length === 1 ? 'peça' : 'peças'}`}
        </span>
      </button>

      {open && (
        <div className="outfit-body">
          {worn.length === 0 ? (
            <p className="outfit-empty">Você não está vestindo nada.</p>
          ) : (
            <ul className="outfit-grid" aria-label="Roupa vestida">
              {worn.map((piece) => (
                <li key={piece.slot}>
                  <button
                    type="button"
                    className="outfit-tile"
                    disabled={busy}
                    aria-label={`Tirar ${piece.label.toLowerCase()}`}
                    title={`Tirar ${piece.label}`}
                    onClick={() => onRemove(piece.slot)}
                  >
                    <PieceThumb slot={piece.slot} id={piece.id} />
                    <span className="outfit-tile-name">{shortPieceLabel(piece.label)}</span>
                    <span className="outfit-badge outfit-badge-remove" aria-hidden="true">
                      ×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {removedSlots.length > 0 && (
            <div className="outfit-removed">
              <span className="outfit-section">Vestir de novo</span>
              <ul className="outfit-grid" aria-label="Peças tiradas">
                {removedSlots.map((slot) => {
                  const id = removed[slot];
                  if (!id) return null;
                  const label = pieceLabel(id);
                  return (
                    <li key={slot}>
                      <button
                        type="button"
                        className="outfit-tile outfit-tile-add"
                        disabled={busy}
                        aria-label={`Vestir ${label.toLowerCase()}`}
                        title={`Vestir ${label}`}
                        onClick={() => onWear(slot, id)}
                      >
                        <PieceThumb slot={slot} id={id} />
                        <span className="outfit-tile-name">{shortPieceLabel(label)}</span>
                        <span className="outfit-badge outfit-badge-add" aria-hidden="true">
                          +
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <button
            type="button"
            className="ghost outfit-undress"
            disabled={busy || !avatar || stripped}
            onClick={onUndress}
          >
            <Icon name="underwear" size={15} />
            Tirar a roupa
          </button>
        </div>
      )}
    </div>
  );
}
