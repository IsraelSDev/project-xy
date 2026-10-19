import { useEffect, useState, type CSSProperties } from 'react';
import { Analytics } from '@vercel/analytics/react';
import type { SessionUser, Wallet } from '@3dx/contracts';
import { AccountDialog } from '../features/account/AccountDialog';
import { AdminPage } from '../features/admin/AdminPage';
import { AuthScreen } from '../features/auth/AuthScreen';
import { useSession } from '../features/auth/session';
import { useFriends } from '../features/friends/useFriends';
import { ConversationsPanel } from '../features/moderation/ConversationsPanel';
import { ModerationPanel } from '../features/moderation/ModerationPanel';
import { useModerationQueue } from '../features/moderation/useModerationQueue';
import { TransferDialog } from '../features/economy/TransferDialog';
import { WorldView } from '../features/world/WorldView';
import { Icon } from './Icon';
import { identityColor, initialOf } from './identity-color';
import { ServiceStatusPanel } from './ServiceStatusPanel';
import { api } from './api';

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
  const [admin, setAdmin] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [dressingUp, setDressingUp] = useState(false);
  const [managingAccount, setManagingAccount] = useState(false);
  const [showingFriends, setShowingFriends] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const friends = useFriends();
  const canModerate = user.role === 'MODERATOR' || user.role === 'ADMIN';
  const canAdmin = user.role === 'ADMIN';
  const canReadConversations = user.role === 'ADMIN';
  const incoming = friends.entries.filter((entry) => entry.status === 'INCOMING').length;
  const queue = useModerationQueue(canModerate);

  useEffect(() => {
    let cancelled = false;
    api<Wallet>('/economy/wallet')
      .then((w) => {
        if (!cancelled) setWallet(w);
      })
      .catch(() => {
        /* carteira ainda não criada no servidor; sem saldo exibido */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openModeration = () => {
    queue.clearArrived();
    setModerating(true);
  };

  const balance = wallet ? ` ${wallet.balance}¢` : '';

  return (
    <div className="app">
      <WorldView
        userId={user.id}
        friends={friends}
        onUnauthorized={onExpired}
        editingAvatar={editingAvatar}
        onAvatarEditorClose={() => setEditingAvatar(false)}
        editingWardrobe={dressingUp}
        onWardrobeClose={() => setDressingUp(false)}
        canModerate={canModerate}
        showingFriends={showingFriends}
        onFriendsClose={() => setShowingFriends(false)}
        onFriendsOpen={() => setShowingFriends(true)}
        onUserNotify={(event) => {
          if (event.kind === 'friends') void friends.reload();
          if (event.kind === 'queue') void queue.reload();
        }}
      />
      <header className="hud-panel topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            3DX
          </span>
          <h1>3DXChat Web</h1>
        </div>
        <nav className="session-line" aria-label="Sua conta">
          {/* Identidade do usuário */}
          <span className="user-chip">
            <span
              className="avatar-dot"
              style={{ '--dot': identityColor(user.id) } as CSSProperties}
              aria-hidden="true"
            >
              {initialOf(user.displayName)}
            </span>
            <span>{user.displayName}</span>
            {balance && (
              <span className="count" aria-label={`Saldo de ${wallet?.balance} créditos`}>
                {balance}
              </span>
            )}
          </span>

          <div className="nav-group">
            <NavButton
              icon="account"
              label="Conta"
              onClick={() => setManagingAccount(true)}
              title="Gerenciar sua conta"
            />
            <NavButton
              icon="user"
              label="Avatar"
              onClick={() => setEditingAvatar(true)}
              title="Editar aparência"
            />
            <NavButton
              icon="wardrobe"
              label="Vestiário"
              onClick={() => setDressingUp(true)}
              title="Abrir o closet e provar cabelos, roupas e tatuagens"
            />
          </div>

          <div className="nav-group">
            <NavButton
              icon="friends"
              label="Amigos"
              onClick={() => setShowingFriends(true)}
              badge={incoming > 0 ? String(incoming) : undefined}
              title={`Amigos${incoming > 0 ? ` (${incoming} pedido${incoming > 1 ? 's' : ''} recebido${incoming > 1 ? 's' : ''})` : ''}`}
            />
            <NavButton
              icon="send"
              label="Enviar"
              onClick={() => setTransferring(true)}
              title="Transferir créditos"
            />
          </div>

          {canModerate && (
            <div className="nav-group staff">
              <NavButton
                icon="shield"
                label="Moderação"
                onClick={openModeration}
                badge={queue.total > 0 ? String(queue.total) : undefined}
                title={`Fila de moderação${queue.total > 0 ? ` (${queue.total})` : ''}`}
              />
              {canReadConversations && (
                <NavButton
                  icon="chat"
                  label="Conversas"
                  onClick={() => setReadingConversations(true)}
                  title="Conversas registradas"
                />
              )}
              {canAdmin && (
                <NavButton
                  icon="admin"
                  label="Admin"
                  onClick={() => setAdmin(true)}
                  title="Administração"
                />
              )}
            </div>
          )}

          <button type="button" className="ghost logout" onClick={onLogout}>
            <Icon name="logOut" size={14} />
            <span>Sair</span>
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
      {admin && (
        <AdminPage viewerId={user.id} viewerRole={user.role} onClose={() => setAdmin(false)} />
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
      {transferring && wallet !== null && (
        <TransferDialog onClose={() => setTransferring(false)} balance={wallet.balance} />
      )}
      <Analytics />
    </div>
  );
}

interface NavButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  badge?: string;
  title?: string;
}

/** Botão de navegação compacto com ícone e rótulo. */
function NavButton({ icon, label, onClick, badge, title }: NavButtonProps) {
  return (
    <button type="button" className="nav-item" onClick={onClick} title={title}>
      <Icon name={icon} size={14} />
      <span>{label}</span>
      {badge && <span className="badge count">{badge}</span>}
    </button>
  );
}
