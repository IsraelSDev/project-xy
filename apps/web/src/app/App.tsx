import { useState, type CSSProperties } from 'react';
import { Analytics } from '@vercel/analytics/react';
import type { SessionUser } from '@3dx/contracts';
import { AccountDialog } from '../features/account/AccountDialog';
import { AuthScreen } from '../features/auth/AuthScreen';
import { useSession } from '../features/auth/session';
import { useFriends } from '../features/friends/useFriends';
import { ConversationsPanel } from '../features/moderation/ConversationsPanel';
import { ModerationPanel } from '../features/moderation/ModerationPanel';
import { useModerationQueue } from '../features/moderation/useModerationQueue';
import { WorldView } from '../features/world/WorldView';
import { identityColor, initialOf } from './identity-color';
import { ServiceStatusPanel } from './ServiceStatusPanel';

export function App() {
  const { session, login, register, logout, expire } = useSession();
  const [authNotice, setAuthNotice] = useState<string>();

  if (session.state === 'loading') {
    return (
      <p className="world-loading" role="status">
        Carregando…
      </p>
    );
  }

  if (session.state === 'anonymous') {
    return <AuthScreen onLogin={login} onRegister={register} notice={authNotice} />;
  }

  return (
    <Shell
      user={session.user}
      onLogout={() => void logout()}
      onExpired={expire}
      onDeleted={() => {
        setAuthNotice('Conta excluída. Seus dados pessoais foram apagados.');
        expire();
      }}
    />
  );
}

interface ShellProps {
  user: SessionUser;
  onLogout: () => void;
  onExpired: () => void;
  onDeleted: () => void;
}

/** Tudo o que existe com sessão: mundo 3D, barra superior e diálogos da conta. */
function Shell({ user, onLogout, onExpired, onDeleted }: ShellProps) {
  const [moderating, setModerating] = useState(false);
  const [readingConversations, setReadingConversations] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [managingAccount, setManagingAccount] = useState(false);
  const [showingFriends, setShowingFriends] = useState(false);
  const friends = useFriends();
  const canModerate = user.role === 'MODERATOR' || user.role === 'ADMIN';
  const canReadConversations = user.role === 'ADMIN';
  const incoming = friends.entries.filter((entry) => entry.status === 'INCOMING').length;
  const queue = useModerationQueue(canModerate);
  const openModeration = () => {
    queue.clearArrived();
    setModerating(true);
  };

  return (
    <div className="app">
      <WorldView
        userId={user.id}
        friends={friends}
        onUnauthorized={onExpired}
        editingAvatar={editingAvatar}
        onAvatarEditorClose={() => setEditingAvatar(false)}
        canModerate={canModerate}
        showingFriends={showingFriends}
        onFriendsClose={() => setShowingFriends(false)}
        onFriendsOpen={() => setShowingFriends(true)}
      />
      <header className="hud-panel topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            3DX
          </span>
          <h1>3DXChat Web</h1>
        </div>
        <nav className="session-line" aria-label="Sua conta">
          <span className="user-chip">
            <span
              className="avatar-dot"
              style={{ '--dot': identityColor(user.id) } as CSSProperties}
              aria-hidden="true"
            >
              {initialOf(user.displayName)}
            </span>
            <span>{user.displayName}</span>
            {canModerate && <span className="badge badge-accent">Moderação</span>}
          </span>
          <button type="button" onClick={() => setEditingAvatar(true)}>
            Avatar
          </button>
          <button type="button" onClick={() => setShowingFriends(true)}>
            Amigos
            {incoming > 0 && (
              <span className="count" aria-label={`${incoming} pedidos recebidos`}>
                {incoming}
              </span>
            )}
          </button>
          <button type="button" onClick={() => setManagingAccount(true)}>
            Conta
          </button>
          {canModerate && (
            <button type="button" onClick={openModeration}>
              Moderação
              {queue.total > 0 && (
                <span className="count" aria-label={`${queue.total} na fila de moderação`}>
                  {queue.total}
                </span>
              )}
            </button>
          )}
          {canReadConversations && (
            <button type="button" onClick={() => setReadingConversations(true)}>
              Conversas
            </button>
          )}
          <button type="button" className="ghost" onClick={onLogout}>
            Sair
          </button>
        </nav>
      </header>
      <p className="controls-hint">
        <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> ou setas para andar · arrastar gira a
        câmera · roda dá zoom
      </p>
      <aside className="hud hud-end">
        <ServiceStatusPanel />
      </aside>
      {canModerate && queue.arrived > 0 && !moderating && (
        <div className="hud-panel moderation-alert" role="status">
          <span>
            {queue.arrived} {queue.arrived === 1 ? 'item novo' : 'itens novos'} na fila de moderação
          </span>
          <button type="button" className="primary" onClick={openModeration}>
            Ver fila
          </button>
          <button type="button" className="ghost" onClick={queue.clearArrived}>
            Dispensar
          </button>
        </div>
      )}
      {moderating && <ModerationPanel onClose={() => setModerating(false)} />}
      {readingConversations && (
        <ConversationsPanel onClose={() => setReadingConversations(false)} />
      )}
      {managingAccount && (
        <AccountDialog
          email={user.email}
          onClose={() => setManagingAccount(false)}
          onDeleted={() => {
            setManagingAccount(false);
            onDeleted();
          }}
        />
      )}
      <Analytics />
    </div>
  );
}
