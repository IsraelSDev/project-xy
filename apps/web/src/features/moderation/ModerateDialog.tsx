import { useState, type FormEvent } from 'react';
import { api } from '../../app/api';
import { SANCTION_OPTIONS } from './sanctions';

interface ModerateDialogProps {
  target: { userId: string; name: string };
  onClose: () => void;
}

/** Sanção direta da moderação (sem denúncia), ex.: flagrante na sala. O motivo é obrigatório. */
export function ModerateDialog({ target, onClose }: ModerateDialogProps) {
  const [state, setState] = useState<'editing' | 'sending' | 'done'>('editing');
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const option = SANCTION_OPTIONS.find((entry) => entry.id === data.get('sanction'));
    const reason = data.get('reason');
    if (!option || typeof reason !== 'string') return;
    setState('sending');
    setError(undefined);
    try {
      await api('/admin/sanctions', {
        json: { userId: target.userId, sanction: option.sanction, reason: reason.trim() },
      });
      setState('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível aplicar a sanção.');
      setState('editing');
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderate-title"
      >
        <h2 id="moderate-title">Moderar {target.name}</h2>
        {state === 'done' ? (
          <>
            <p role="status">
              Sanção aplicada. Vale para quem está na sala na próxima renovação do ticket (até 20
              s).
            </p>
            <button type="button" onClick={onClose}>
              Fechar
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Sanção
              <select name="sanction" defaultValue={SANCTION_OPTIONS[0]?.id}>
                {SANCTION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Motivo (fica na auditoria)
              <textarea name="reason" required minLength={3} maxLength={500} rows={3} />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" disabled={state === 'sending'}>
                Aplicar sanção
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
