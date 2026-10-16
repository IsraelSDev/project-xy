import { useState } from 'react';
import type { InteractionType } from '@3dx/contracts';

interface InteractionDialogProps {
  /** Quem está solicitando a interação. */
  from: { id: string; name: string };
  /** Tipo de interação solicitada. */
  type: InteractionType;
  /** Chamado quando o usuário aceita ou recusa. */
  onRespond: (accept: boolean) => void;
  /** Chamado quando o dialog fecha. */
  onClose: () => void;
}

/** Diálogo para aceitar ou recusar uma interação social consentida. */
export function InteractionDialog({ from, type, onRespond, onClose }: InteractionDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const typeLabel: Record<InteractionType, string> = {
    hug: 'Abraço',
    'dance-duo': 'Dança a dois',
    'pose-intimate': 'Pose íntima',
  };

  const respond = (accept: boolean) => {
    setError(undefined);
    setBusy(true);
    try {
      onRespond(accept);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível responder.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog interaction-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interaction-title"
      >
        <h2 id="interaction-title">Interação social</h2>
        <p>
          <strong>{from.name}</strong> quer <strong>{typeLabel[type]}</strong> com você. Aceita?
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button
            type="button"
            onClick={() => {
              void respond(false);
            }}
            disabled={busy}
          >
            Recusar
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void respond(true);
            }}
            disabled={busy}
          >
            {busy ? 'Processando…' : 'Aceitar'}
          </button>
        </div>
      </section>
    </div>
  );
}
