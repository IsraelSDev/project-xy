import type { LoginRequest, RegisterRequest, SessionUser } from '@3dx/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../app/api';

export type Session =
  { state: 'loading' } | { state: 'anonymous' } | { state: 'authenticated'; user: SessionUser };

/** Sessão do usuário: consulta `/auth/me` ao abrir e expõe login, cadastro e logout. */
export function useSession() {
  const [session, setSession] = useState<Session>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api<SessionUser>('/auth/me')
      .then((user) => {
        if (!cancelled) setSession({ state: 'authenticated', user });
      })
      .catch(() => {
        // 401 (sem sessão) ou API fora do ar: as duas levam à tela de entrada.
        if (!cancelled) setSession({ state: 'anonymous' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginRequest) => {
    const user = await api<SessionUser>('/auth/login', { json: input });
    setSession({ state: 'authenticated', user });
  }, []);

  const register = useCallback(async (input: RegisterRequest) => {
    const user = await api<SessionUser>('/auth/register', { json: input });
    setSession({ state: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    await api<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession({ state: 'anonymous' });
  }, []);

  /** A sessão expirou no servidor (ex.: ticket negado com 401). */
  const expire = useCallback(() => {
    setSession({ state: 'anonymous' });
  }, []);

  return { session, login, register, logout, expire };
}

/** Ticket para entrar na sala; `null` quando não há sessão válida. */
export async function fetchRealtimeTicket(): Promise<string | null> {
  try {
    return (await api<{ ticket: string }>('/auth/realtime-ticket', { method: 'POST' })).ticket;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
