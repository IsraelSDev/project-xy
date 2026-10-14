import { REPORT_REASONS, type ReportReason } from '@3dx/contracts';
import { useState, type FormEvent } from 'react';
import { api } from '../../app/api';

export const REASON_LABELS: Record<ReportReason, string> = {
  HARASSMENT: 'Assédio ou ofensa',
  SPAM: 'Spam',
  INAPPROPRIATE_CONTENT: 'Conteúdo impróprio',
  UNDERAGE: 'Possível menor de idade',
  OTHER: 'Outro motivo',
};

interface ReportDialogProps {
  target: { userId: string; name: string };
  onClose: () => void;
}

/** Denúncia de um jogador para a moderação. */
export function ReportDialog({ target, onClose }: ReportDialogProps) {
  const [state, setState] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const details = data.get('details');
    setState('sending');
    setError(undefined);
    try {
      await api('/reports', {
        json: {
          reportedUserId: target.userId,
          reason: data.get('reason'),
          details: typeof details === 'string' && details.trim() ? details.trim() : undefined,
        },
      });
      setState('sent');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar.');
      setState('editing');
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
      >
        <h2 id="report-title">Denunciar {target.name}</h2>
        {state === 'sent' ? (
          <>
            <p role="status">Denúncia enviada. A moderação vai analisar.</p>
            <button type="button" onClick={onClose}>
              Fechar
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Motivo
              <select name="reason" defaultValue="HARASSMENT">
                {REPORT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {REASON_LABELS[reason]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Detalhes (opcional)
              <textarea name="details" maxLength={1000} rows={3} />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" disabled={state === 'sending'}>
                Enviar denúncia
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
