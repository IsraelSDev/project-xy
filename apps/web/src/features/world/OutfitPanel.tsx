import type { AvatarConfig } from '@3dx/contracts';
import { useState } from 'react';
import {
  OUTFIT_SLOTS,
  pieceId,
  pieceLabel,
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

/**
 * "Roupa": o que o avatar está vestindo agora, com um botão para tirar cada peça direto no mundo —
 * sem abrir o vestiário. A camada de cima (camiseta/casaco) aparece como uma peça só, como no
 * editor. As peças tiradas ficam lembradas para vestir de novo com um clique.
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
    <div className="hud-panel outfit-panel">
      <button
        type="button"
        className="outfit-header"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
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
            <ul className="outfit-list">
              {worn.map((piece) => (
                <li key={piece.slot}>
                  <span className="outfit-name">{piece.label}</span>
                  <button
                    type="button"
                    className="ghost outfit-action"
                    disabled={busy}
                    aria-label={`Tirar ${piece.label.toLowerCase()}`}
                    onClick={() => onRemove(piece.slot)}
                  >
                    Tirar
                  </button>
                </li>
              ))}
            </ul>
          )}

          {removedSlots.length > 0 && (
            <div className="outfit-removed">
              <span className="outfit-section">Vestir de novo</span>
              <ul className="outfit-list">
                {removedSlots.map((slot) => {
                  const id = removed[slot];
                  if (!id) return null;
                  const label = pieceLabel(id);
                  return (
                    <li key={slot}>
                      <span className="outfit-name outfit-name-removed">{label}</span>
                      <button
                        type="button"
                        className="ghost outfit-action"
                        disabled={busy}
                        aria-label={`Vestir ${label.toLowerCase()}`}
                        onClick={() => onWear(slot, id)}
                      >
                        Vestir
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
            Tirar a roupa
          </button>
          <p className="outfit-hint">
            A camiseta e o casaco ocupam a mesma camada: tirar uma peça de cima tira as duas. A
            roupa íntima e os acessórios ficam, e o “Tirar a roupa” não mexe neles.
          </p>
        </div>
      )}
    </div>
  );
}
