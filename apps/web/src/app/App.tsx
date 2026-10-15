import { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AccountDialog } from '../features/account/AccountDialog';
import { AuthScreen } from '../features/auth/AuthScreen';
import { useSession } from '../features/auth/session';
import { ModerationPanel } from '../features/moderation/ModerationPanel';
import { WorldView } from '../features/world/WorldView';
import { ServiceStatusPanel } from './ServiceStatusPanel';

export function App() {
  const { session, login, register, logout, expire } = useSession();
  const [moderating, setModerating] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [managingAccount, setManagingAccount] = useState(false);
  const [showingFriends, setShowingFriends] = useState(false);
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

  const { user } = session;
  const canModerate = user.role === 'MODERATOR' || user.role === 'ADMIN';

  return (
    <div className="app">
      <WorldView
        userId={user.id}
        onUnauthorized={expire}
        editingAvatar={editingAvatar}
        onAvatarEditorClose={() => setEditingAvatar(false)}
        canModerate={canModerate}
        showingFriends={showingFriends}
        onFriendsClose={() => setShowingFriends(false)}
      />
      <header className="hud hud-start">
        <div className="hud-panel">
          <h1>3DXChat Web</h1>
          <p>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> ou setas: andar · arrastar: girar a câmera · roda: zoom
          </p>
          <p className="session-line">
            {user.displayName}
            <button type="button" onClick={() => setEditingAvatar(true)}>
              Avatar
            </button>
            <button type="button" onClick={() => setShowingFriends(true)}>
              Amigos
            </button>
            <button type="button" onClick={() => setManagingAccount(true)}>
              Conta
            </button>
            {canModerate && (
              <button type="button" onClick={() => setModerating(true)}>
                Moderação
              </button>
            )}
            <button type="button" onClick={() => void logout()}>
              Sair
            </button>
          </p>
        </div>
      </header>
      <aside className="hud hud-end">
        <ServiceStatusPanel />
      </aside>
      {moderating && <ModerationPanel onClose={() => setModerating(false)} />}
      {managingAccount && (
        <AccountDialog
          email={user.email}
          onClose={() => setManagingAccount(false)}
          onDeleted={() => {
            setManagingAccount(false);
            setAuthNotice('Conta excluída. Seus dados pessoais foram apagados.');
            expire();
          }}
        />
      )}
      <Analytics />
    </div>
  );
}
