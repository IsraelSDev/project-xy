import type { AccountExport } from '@3dx/contracts';
import { useState, type FormEvent } from 'react';
import { api } from '../../app/api';

interface AccountDialogProps {
  onClose: () => void;
  /** A conta foi excluída (a sessão já acabou no servidor). */
  onDeleted: () => void;
}

const messageOf = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message : fallback;

/** Baixa um JSON gerado na página (sem passar por outra requisição). */
function download(data: unknown, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A própria conta: exportar os dados e excluir (com a senha atual). */
export function AccountDialog({ onClose, onDeleted }: AccountDialogProps) {
  const [busy, setBusy] = useState<'export' | 'delete'>();
  const [error, setError] = useState<string>();

  const exportData = async () => {
    setBusy('export');
    setError(undefined);
    try {
      const data = await api<AccountExport>('/account/export');
      download(data, `3dxchat-meus-dados-${data.exportedAt.slice(0, 10)}.json`);
    } catch (caught) {
      setError(messageOf(caught, 'Não foi possível exportar.'));
    } finally {
      setBusy(undefined);
    }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    setBusy('delete');
    setError(undefined);
    try {
      await api<void>('/account/delete', { json: { password } });
      onDeleted();
    } catch (caught) {
      setError(messageOf(caught, 'Não foi possível excluir a conta.'));
      setBusy(undefined);
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <h2 id="account-title">Minha conta</h2>

        <h3>Meus dados</h3>
        <p>Baixe uma cópia do que a plataforma guarda sobre você (arquivo JSON).</p>
        <div className="dialog-actions">
          <button type="button" onClick={() => void exportData()} disabled={busy !== undefined}>
            Exportar meus dados
          </button>
        </div>

        <h3>Excluir conta</h3>
        <p>
          Apaga e-mail, senha, data de nascimento, avatar, sessões e bloqueios. Não dá para
          desfazer. Denúncias e sanções continuam registradas, sem os seus dados, para a segurança
          da comunidade.
        </p>
        <form onSubmit={(event) => void deleteAccount(event)}>
          <label>
            Senha atual
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <label className="confirm-check">
            <input name="confirm" type="checkbox" required />
            Entendo que a exclusão é definitiva.
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={busy === 'delete'}>
              Fechar
            </button>
            <button type="submit" disabled={busy !== undefined}>
              Excluir minha conta
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
