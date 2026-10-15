import type { AppealReceipt } from '@3dx/contracts';
import { useState, type FormEvent } from 'react';
import { api } from '../../app/api';

interface AppealFormProps {
  email: string;
  /** Senha já digitada (tela de login); sem ela, o formulário pede a senha. */
  password?: string;
}

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

/**
 * Contestação da sanção ativa mais grave. Usa e-mail e senha (não a sessão): funciona para quem
 * está suspenso e não consegue entrar.
 */
export function AppealForm({ email, password }: AppealFormProps) {
  const [receipt, setReceipt] = useState<AppealReceipt>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      setReceipt(
        await api<AppealReceipt>('/appeals', {
          json: { email, password: password ?? data.get('password'), message: data.get('message') },
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar a contestação.');
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    const { type, endsAt } = receipt.sanction;
    return (
      <p role="status">
        Contestação enviada. A moderação vai analisar a{' '}
        {type === 'SUSPEND' ? 'suspensão' : 'restrição de chat'}
        {endsAt ? ` (até ${dateTime(endsAt)})` : ' permanente'}; a resposta aparece quando você
        tentar entrar.
      </p>
    );
  }

  return (
    <form className="appeal-form" onSubmit={(event) => void submit(event)}>
      {password === undefined && (
        <label>
          Senha atual
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
      )}
      <label>
        Por que a sanção deve ser revista?
        <textarea name="message" required minLength={10} maxLength={1000} rows={3} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="submit" disabled={busy}>
          Enviar contestação
        </button>
      </div>
    </form>
  );
}
