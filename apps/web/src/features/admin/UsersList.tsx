import type { AdminUserSummary, AdminUsersPage, Role } from '@3dx/contracts';
import { ROLES } from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { api } from '../../app/api';

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const roleLabel = (role: Role) =>
  ({ USER: 'Usuário', MODERATOR: 'Moderador', ADMIN: 'Administrador' })[role];

const roleBadge = (role: Role) =>
  ({ USER: 'badge', MODERATOR: 'badge badge-warn', ADMIN: 'badge badge-accent' })[role];

interface UsersListProps {
  viewerId: string;
}

export function UsersList({ viewerId }: UsersListProps) {
  const [page, setPage] = useState(1);
  const [take] = useState(50);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(undefined);
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (roleFilter) params.set('role', roleFilter);
        params.set('page', String(page));
        params.set('take', String(take));
        const data: AdminUsersPage = await api(`/admin/users?${params}`);
        if (cancelled) return;
        setUsers(data.users);
        setTotal(data.total);
        setPages(Math.ceil(data.total / take) || 1);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Falha ao carregar usuários.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, roleFilter, page, take]);

  const changeRole = async (user: AdminUserSummary, nextRole: Role) => {
    if (user.id === viewerId) {
      setError('Não é possível alterar o seu próprio papel.');
      return;
    }
    setSaving(user.id);
    try {
      await api(`/admin/users/${user.id}/role`, {
        method: 'PATCH',
        json: { role: nextRole },
      });
      setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u)));
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao alterar o papel.');
    } finally {
      setSaving(undefined);
    }
  };

  return (
    <div>
      <p>Busca por nome ou e-mail. Alterar o papel gera entrada na auditoria.</p>
      {error && <p role="alert">{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <input
          value={q}
          placeholder="Buscar usuário…"
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
        />
        <select
          value={roleFilter || ''}
          onChange={(event) => {
            setRoleFilter((event.target.value as Role) || '');
            setPage(1);
          }}
        >
          <option value="">Todos os papéis</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setQ('');
            setRoleFilter('');
            setPage(1);
          }}
        >
          Limpar
        </button>
      </div>

      {!users && !error && <p>Carregando…</p>}
      {users.length === 0 && !error && <p>Nenhum usuário encontrado.</p>}
      <ul className="users">
        {users?.map((user) => (
          <li key={user.id}>
            <div className="user-row">
              <div>
                <strong>{user.displayName}</strong>
                <span className={`badge ${roleBadge(user.role)}`}>{roleLabel(user.role)}</span>
                {user.deletedAt && <span className="badge badge-warn">Excluída</span>}
              </div>
              <div className="user-meta">
                <span>{user.email}</span>
                <span>{dateTime(user.createdAt)}</span>
              </div>
              <div className="user-actions">
                <select
                  value={user.role}
                  disabled={saving === user.id || user.id === viewerId}
                  onChange={(event) => void changeRole(user, event.target.value as Role)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
                {saving === user.id && (
                  <span className="badge" style={{ color: 'var(--muted)' }}>
                    …
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div
          style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
        >
          <button
            type="button"
            disabled={page === 1 || loading}
            onClick={() => setPage((current) => current - 1)}
          >
            Anterior
          </button>
          <span className="badge">
            Página {page} de {pages}
          </span>
          <button
            type="button"
            disabled={page === pages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      <p className="stats">
        {total} usuário{total !== 1 ? 's' : ''} no total.
      </p>
    </div>
  );
}
