import { LoginRequest, MIN_AGE, RegisterRequest } from '@3dx/contracts';
import { useState, type FormEvent } from 'react';
import type { z } from 'zod';
import { ApiError } from '../../app/api';
import { AppealForm } from '../safety/AppealForm';

type Mode = 'login' | 'register';

interface AuthScreenProps {
  onLogin: (input: LoginRequest) => Promise<void>;
  onRegister: (input: RegisterRequest) => Promise<void>;
  /** Aviso ao chegar na tela (ex.: depois de excluir a conta). */
  notice?: string;
}

const LABELS: Record<string, string> = {
  email: 'E-mail',
  password: 'Senha',
  displayName: 'Nome público',
  birthDate: 'Data de nascimento',
};

/** Primeira mensagem de validação, com o nome do campo (os mesmos schemas da API). */
function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Dados inválidos.';
  const field = LABELS[String(issue.path[0])];
  return field ? `${field}: ${issue.message}` : issue.message;
}

export function AuthScreen({ onLogin, onRegister, notice }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** Login recusado por suspensão: com as credenciais já digitadas, a pessoa pode contestar. */
  const [suspended, setSuspended] = useState<LoginRequest>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = (mode === 'login' ? LoginRequest : RegisterRequest).safeParse(data);
    if (!parsed.success) {
      setError(firstIssue(parsed.error));
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'login') await onLogin(parsed.data);
      else await onRegister(parsed.data as RegisterRequest);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.');
      setSuspended(
        mode === 'login' && caught instanceof ApiError && caught.status === 403
          ? parsed.data
          : undefined,
      );
      setBusy(false);
    }
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(undefined);
    setSuspended(undefined);
  };

  return (
    <main className="auth">
      <h1>3DXChat Web</h1>
      <p className="auth-notice">
        Somente para maiores de {MIN_AGE} anos. Nesta versão de desenvolvimento a idade é apenas
        declarada.
      </p>
      {notice && <p role="status">{notice}</p>}

      <div className="auth-tabs" role="tablist" aria-label="Entrar ou criar conta">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => switchTo('login')}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          onClick={() => switchTo('register')}
        >
          Criar conta
        </button>
      </div>

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <label>
          {LABELS.email}
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          {LABELS.password}
          <input
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 10 : undefined}
            required
          />
        </label>
        {mode === 'register' && (
          <>
            <label>
              {LABELS.displayName}
              <input
                name="displayName"
                autoComplete="nickname"
                minLength={3}
                maxLength={24}
                required
              />
            </label>
            <label>
              {LABELS.birthDate}
              <input name="birthDate" type="date" autoComplete="bday" required />
            </label>
          </>
        )}

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>

      {suspended && (
        <section className="auth-appeal" aria-labelledby="appeal-title">
          <h2 id="appeal-title">Contestar suspensão</h2>
          <AppealForm key={suspended.email} email={suspended.email} password={suspended.password} />
        </section>
      )}
    </main>
  );
}
