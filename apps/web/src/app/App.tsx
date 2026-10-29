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
import { ProfileDialog } from '../features/profile/ProfileDialog';
import { WorldView } from '../features/world/WorldView';
import { Icon } from './Icon';
import { identityColor, initialOf } from './identity-color';
import { ServiceStatusPanel } from './ServiceStatusPanel';
import { api } from './api';
import { OverlayTransition, ScreenTransition } from './transitions';
import { useOverlay } from './useOverlay';

export function App() {
  const { session, login, register, logout, expire } = useSession();
  const [authNotice, setAuthNotice] = useState<string>();

  if (session.state === 'loading') {
    return (
      <ScreenTransition key="loading">
        <LoadingScreen />
      </ScreenTransition>
    );
  }

  if (session.state === 'anonymous') {
    return (
      <ScreenTransition key="auth">
        <AuthScreen onLogin={login} onRegister={register} notice={authNotice} />
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition key="world">
      <Shell
        user={session.user}
        onLogout={() => void logout()}
        onExpired={expire}
        onDeleted={() => {
          setAuthNotice('Conta excluída. Seus dados pessoais foram apagados.');
          expire();
        }}
      />
    </ScreenTransition>
  );
}

/** Abertura exibida enquanto a sessão é consultada; dá lugar à entrada ou ao mundo. */
function LoadingScreen() {
  return (
    <main className="screen-loading">
      <span className="brand-mark" aria-hidden="true">
        3DX
      </span>
      <p role="status">Carregando…</p>
    </main>
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
  const [moderating, setModerating] = useOverlay(false);
  const [readingConversations, setReadingConversations] = useOverlay(false);
  const [admin, setAdmin] = useOverlay(false);
  const [editingAvatar, setEditingAvatar] = useOverlay(false);
  const [dressingUp, setDressingUp] = useOverlay(false);
  const [managingAccount, setManagingAccount] = useOverlay(false);
  const [showingFriends, setShowingFriends] = useOverlay(false);
  const [transferring, setTransferring] = useOverlay(false);
  /** Perfil aberto: 'me' ou o id de outro membro. */
  const [profiling, setProfiling] = useOverlay<string | undefined>(undefined);
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
        userName={user.displayName}
        friends={friends}
        onUnauthorized={onExpired}
        editingAvatar={editingAvatar}
        onAvatarEditorClose={() => setEditingAvatar(false)}
        editingWardrobe={dressingUp}
        onWardrobeClose={() => setDressingUp(false)}
        onWardrobeOpen={() => setDressingUp(true)}
        canModerate={canModerate}
        showingFriends={showingFriends}
        onFriendsClose={() => setShowingFriends(false)}
        onFriendsOpen={() => setShowingFriends(true)}
        onUserNotify={(event) => {
          if (event.kind === 'friends') void friends.reload();
          if (event.kind === 'queue') void queue.reload();
        }}
        onProfile={setProfiling}
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
              icon="profile"
              label="Perfil"
              onClick={() => setProfiling('me')}
              title="Ver e editar seu perfil"
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
      {moderating && (
        <OverlayTransition>
          <ModerationPanel onClose={() => setModerating(false)} />
        </OverlayTransition>
      )}
      {readingConversations && (
        <OverlayTransition>
          <ConversationsPanel onClose={() => setReadingConversations(false)} />
        </OverlayTransition>
      )}
      {admin && (
        <OverlayTransition>
          <AdminPage viewerId={user.id} viewerRole={user.role} onClose={() => setAdmin(false)} />
        </OverlayTransition>
      )}
      {managingAccount && (
        <OverlayTransition>
          <AccountDialog
            email={user.email}
            onClose={() => setManagingAccount(false)}
            onDeleted={() => {
              setManagingAccount(false);
              onDeleted();
            }}
          />
        </OverlayTransition>
      )}
      {profiling && (
        <OverlayTransition>
          <ProfileDialog
            key={profiling}
            userId={profiling === 'me' ? undefined : profiling}
            onClose={() => setProfiling(undefined)}
          />
        </OverlayTransition>
      )}
      {transferring && wallet !== null && (
        <OverlayTransition>
          <TransferDialog onClose={() => setTransferring(false)} balance={wallet.balance} />
        </OverlayTransition>
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
