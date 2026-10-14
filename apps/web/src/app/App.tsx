import { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AuthScreen } from '../features/auth/AuthScreen';
import { useSession } from '../features/auth/session';
import { ModerationPanel } from '../features/moderation/ModerationPanel';
import { WorldView } from '../features/world/WorldView';
import { ServiceStatusPanel } from './ServiceStatusPanel';

export function App() {
  const { session, login, register, logout, expire } = useSession();
  const [moderating, setModerating] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);

  if (session.state === 'loading') {
    return (
      <p className="world-loading" role="status">
        Carregando…
      </p>
    );
  }

  if (session.state === 'anonymous') {
    return <AuthScreen onLogin={login} onRegister={register} />;
  }

  const { user } = session;
  const canModerate = user.role === 'MODERATOR' || user.role === 'ADMIN';

  return (
    <div className="app">
      <WorldView
        onUnauthorized={expire}
        editingAvatar={editingAvatar}
        onAvatarEditorClose={() => setEditingAvatar(false)}
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
      <Analytics />
    </div>
  );
}
