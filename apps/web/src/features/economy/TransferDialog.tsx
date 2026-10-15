import { useState } from 'react';
import { type TransferRequest } from '@3dx/contracts';
import { api } from '../../app/api';

interface TransferDialogProps {
  onClose: () => void;
  /** Saldo atual do remetente, para validar antes de enviar. */
  balance: number;
}

/** Envia créditos para outro usuário (qualquer conta existente). */
export function TransferDialog({ onClose, balance }: TransferDialogProps) {
  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const transfer = async () => {
    setError(undefined);
    const parsed = Number(amount);
    if (!targetUserId || !parsed || parsed <= 0) {
      setError('Informe o ID do destinatário e um valor maior que zero.');
      return;
    }
    if (parsed > balance) {
      setError('Saldo insuficiente.');
      return;
    }
    setBusy(true);
    try {
      await api<TransferRequest>('/economy/transfer', {
        json: {
          targetUserId,
          amount: parsed,
          ...(note ? { note } : {}),
        },
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível transferir.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-title"
      >
        <h2 id="transfer-title">Enviar créditos</h2>
        <p className="transfer-balance">
          Seu saldo: <strong>{balance}</strong> créditos
        </p>
        {error && <p role="alert">{error}</p>}
        <label>
          ID do usuário destinatário
          <input
            name="targetUserId"
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
            placeholder="ID da conta"
            required
          />
        </label>
        <label>
          Valor (créditos)
          <input
            name="amount"
            type="number"
            min="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>
        <label>
          Mensagem (opcional)
          <input
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="ex.: presente de aniversário"
            maxLength="120"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void transfer()}
            disabled={busy || !targetUserId || !amount || Number(amount) > balance}
          >
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </section>
    </div>
  );
}
