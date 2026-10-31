import { useEffect, useState } from 'react';
import { CONSENT_EVENT, OPEN_PREFERENCES_EVENT, readConsent, writeConsent } from './cookies';

/**
 * Aviso de cookies (LGPD/ePrivacy): o cookie de sessão é essencial; a medição de audiência é
 * opcional e só liga com o consentimento. A escolha fica salva e pode ser reaberta pelo rodapé
 * ("Preferências de cookies") a qualquer momento.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(() => readConsent() === undefined);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(() => readConsent()?.analytics ?? false);

  useEffect(() => {
    const reopen = () => {
      setAnalytics(readConsent()?.analytics ?? false);
      setDetails(false);
      setOpen(true);
    };
    const changed = (event: Event) => {
      setAnalytics((event as CustomEvent<{ analytics: boolean }>).detail.analytics);
      setOpen(false);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, reopen);
    window.addEventListener(CONSENT_EVENT, changed);
    return () => {
      window.removeEventListener(OPEN_PREFERENCES_EVENT, reopen);
      window.removeEventListener(CONSENT_EVENT, changed);
    };
  }, []);

  // Enquanto o aviso está na tela, o rodapé ganha espaço para não cobrir o formulário de entrada.
  useEffect(() => {
    document.body.classList.toggle('cookie-open', open);
    return () => document.body.classList.remove('cookie-open');
  }, [open]);

  if (!open) return null;

  const decide = (value: boolean) => {
    writeConsent(value);
    setAnalytics(value);
    setOpen(false);
  };

  return (
    <aside className="cookie-banner" role="dialog" aria-label="Preferências de cookies">
      <div className="cookie-copy">
        <strong>Cookies</strong>
        <p>
          Usamos um cookie essencial para manter você conectado. Com o seu consentimento, também
          medimos a audiência do site (estatísticas agregadas, sem publicidade).{' '}
          <a href="/politica-de-cookies">Política de cookies</a>.
        </p>
      </div>

      {details ? (
        <div className="cookie-actions">
          <label className="cookie-toggle">
            <input
              type="checkbox"
              checked={analytics}
              onChange={(event) => setAnalytics(event.target.checked)}
            />
            Medição de audiência
          </label>
          <button type="button" className="ghost" onClick={() => setDetails(false)}>
            Voltar
          </button>
          <button type="button" className="primary" onClick={() => decide(analytics)}>
            Salvar escolha
          </button>
        </div>
      ) : (
        <div className="cookie-actions">
          <button type="button" className="ghost" onClick={() => setDetails(true)}>
            Preferências
          </button>
          <button type="button" className="ghost" onClick={() => decide(false)}>
            Só essenciais
          </button>
          <button type="button" className="primary" onClick={() => decide(true)}>
            Aceitar todos
          </button>
        </div>
      )}
    </aside>
  );
}
