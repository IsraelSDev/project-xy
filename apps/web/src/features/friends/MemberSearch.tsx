import type { PublicProfile } from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { api } from '../../app/api';
import { StaffBadge } from '../../app/StaffBadge';
import type { Friends } from './useFriends';

interface MemberSearchProps {
  friends: Friends;
  /** Abre o perfil do membro encontrado. */
  onProfile?: (userId: string) => void;
}

/** Busca de membros por nome (mín. 2 letras); bloqueados e contas excluídas ficam de fora. */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;

export function MemberSearch({ friends, onProfile }: MemberSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const term = query.trim();
  const visible = term.length >= MIN_QUERY ? results : undefined;

  useEffect(() => {
    if (term.length < MIN_QUERY) return;
    let cancelled = false;
    // Espera a pessoa parar de digitar: uma requisição por pausa, não por letra.
    const timer = setTimeout(() => {
      api<PublicProfile[]>(`/profiles/search?q=${encodeURIComponent(term)}`)
        .then((list) => {
          if (cancelled) return;
          setResults(list);
          setError(undefined);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          setError(caught instanceof Error ? caught.message : 'Não foi possível buscar.');
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir.');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section className="member-search" aria-label="Buscar membros">
      <label>
        Buscar membros
        <input
          value={query}
          maxLength={24}
          placeholder="Nome (mín. 2 letras)"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {visible && (
        <ul className="friends">
          {visible.length === 0 && <li className="hint">Ninguém encontrado.</li>}
          {visible.map((profile) => {
            const status = friends.statusOf(profile.id);
            return (
              <li key={profile.id}>
                <span>
                  {profile.displayName}
                  <StaffBadge role={profile.role} />
                  {profile.verifiedAdult && (
                    <span className="badge badge-ok" title="Idade verificada">
                      18+
                    </span>
                  )}
                </span>
                <span className="player-actions">
                  {onProfile && (
                    <button type="button" onClick={() => onProfile(profile.id)}>
                      Perfil
                    </button>
                  )}
                  {status === undefined && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy === profile.id}
                      onClick={() => void run(profile.id, () => friends.request(profile.id))}
                    >
                      Adicionar
                    </button>
                  )}
                  {status === 'INCOMING' && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy === profile.id}
                      onClick={() => void run(profile.id, () => friends.accept(profile.id))}
                    >
                      Aceitar
                    </button>
                  )}
                  {status === 'OUTGOING' && <span className="hint">pedido enviado</span>}
                  {status === 'FRIEND' && <span className="hint">amigo</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
