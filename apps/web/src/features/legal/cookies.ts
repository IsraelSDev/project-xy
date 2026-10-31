/** Consentimento de cookies: um único registro versionado no armazenamento local. */

export const CONSENT_STORAGE_KEY = '3dx:cookie-consent';
/** Subir quando o texto dos cookies mudar e for preciso pedir de novo. */
export const CONSENT_VERSION = 1;
/** Disparado quando a pessoa aceita/recusa (o App liga/desliga a medição de audiência). */
export const CONSENT_EVENT = '3dx:consent-changed';
/** Disparado pelo botão "Preferências de cookies" para reabrir o aviso. */
export const OPEN_PREFERENCES_EVENT = '3dx:cookies-open';

export interface CookieConsent {
  version: number;
  /** Medição de audiência (Vercel). O cookie de sessão é essencial e não depende disto. */
  analytics: boolean;
  /** Quando a escolha foi feita (ISO). */
  at: string;
}

/** Lê o registro salvo; qualquer coisa de outra versão ou inválida é ignorada. */
export function parseConsent(raw: string | null): CookieConsent | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      analytics?: unknown;
      at?: unknown;
    };
    if (
      parsed.version !== CONSENT_VERSION ||
      typeof parsed.analytics !== 'boolean' ||
      typeof parsed.at !== 'string'
    ) {
      return undefined;
    }
    return { version: parsed.version, analytics: parsed.analytics, at: parsed.at };
  } catch {
    return undefined;
  }
}

const storage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

export function readConsent(): CookieConsent | undefined {
  return parseConsent(storage()?.getItem(CONSENT_STORAGE_KEY) ?? null);
}

/** Salva a escolha e avisa quem estiver ouvindo (o App reavalia a medição). */
export function writeConsent(analytics: boolean): CookieConsent {
  const consent: CookieConsent = {
    version: CONSENT_VERSION,
    analytics,
    at: new Date().toISOString(),
  };
  try {
    storage()?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Modo privado/quota: a escolha vale nesta visita, só não é lembrada.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<CookieConsent>(CONSENT_EVENT, { detail: consent }));
  }
  return consent;
}

export const analyticsAllowed = (): boolean => readConsent()?.analytics === true;

/** Reabre o aviso de cookies (botão de preferências no rodapé/Conta). */
export function openCookiePreferences(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
}
