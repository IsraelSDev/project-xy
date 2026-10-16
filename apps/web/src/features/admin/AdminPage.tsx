import type { AppealSummary, ReportSummary, SanctionSummary } from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { api } from '../../app/api';
import { ConversationsPanel } from '../moderation/ConversationsPanel';
import { ModerationPanel } from '../moderation/ModerationPanel';
import { UsersList } from './UsersList';

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const TAB_LABELS: { id: string; label: string }[] = [
  { id: 'users', label: 'Usuários' },
  { id: 'reports', label: 'Denúncias' },
  { id: 'sanctions', label: 'Sanções' },
  { id: 'appeals', label: 'Apelações' },
  { id: 'conversations', label: 'Conversas' },
];

interface AdminPageProps {
  viewerId: string;
  viewerRole: string;
  onClose: () => void;
}

export function AdminPage({ viewerId, viewerRole, onClose }: AdminPageProps) {
  const [tab, setTab] = useState('users');
  const [moderating, setModerating] = useState(false);
  const [readingConversations, setReadingConversations] = useState(false);
  const canReadConversations = viewerRole === 'ADMIN';

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog admin"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
        style={{ width: 'min(64rem, 100%)', maxHeight: '88vh', overflowY: 'auto' }}
      >
        <h2 id="admin-title">Painel de administração</h2>
        <p>Gerencie usuários, denúncias, sanções, apelações e leitura de conversas.</p>

        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {TAB_LABELS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'primary' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'users' && <UsersList viewerId={viewerId} />}

        {tab === 'reports' && <ModerationPanelInline kind="reports" />}

        {tab === 'sanctions' && <ModerationPanelInline kind="sanctions" />}

        {tab === 'appeals' && <ModerationPanelInline kind="appeals" />}

        {tab === 'conversations' && (
          <>
            {canReadConversations ? (
              <>
                <p>Cada conversa aberta fica registrada na auditoria.</p>
                <button type="button" onClick={() => setReadingConversations(true)}>
                  Abrir leitura de conversas
                </button>
              </>
            ) : (
              <p>Somente administradores podem ler conversas.</p>
            )}
            {readingConversations && (
              <ConversationsPanel onClose={() => setReadingConversations(false)} />
            )}
          </>
        )}

        <div
          style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}
        >
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>

      {moderating && <ModerationPanel onClose={() => setModerating(false)} />}
    </div>
  );
}

/** Conteúdo inline de denúncias, sanções e apelações (sem backdrop próprio). */
function ModerationPanelInline({ kind }: { kind: 'reports' | 'sanctions' | 'appeals' }) {
  const [reports, setReports] = useState<ReportSummary[]>();
  const [sanctions, setSanctions] = useState<SanctionSummary[]>();
  const [appeals, setAppeals] = useState<AppealSummary[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const promises: Array<Promise<unknown>> = [];
      if (kind === 'reports')
        promises.push(api<ReportSummary[]>('/admin/reports?status=OPEN').then(setReports));
      if (kind === 'sanctions')
        promises.push(api<SanctionSummary[]>('/admin/sanctions').then(setSanctions));
      if (kind === 'appeals')
        promises.push(api<AppealSummary[]>('/admin/appeals?status=OPEN').then(setAppeals));
      Promise.all(promises).catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Falha ao carregar.');
      });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const title = {
    reports: 'Denúncias abertas',
    sanctions: 'Sanções em vigor',
    appeals: 'Apelações abertas',
  }[kind];

  return (
    <div>
      <h3 style={{ margin: '0.5rem 0 0.25rem' }}>{title}</h3>
      {error && <p role="alert">{error}</p>}
      {kind === 'reports' && (
        <ul className="reports">
          {reports?.map((report) => (
            <li key={report.id}>
              <p>
                <strong>{report.reported.displayName}</strong> denunciado por{' '}
                {report.reporter.displayName} ·{dateTime(report.createdAt)}
              </p>
              <p>{report.details ? report.details : '(sem detalhes)'}</p>
              <div className="dialog-actions">
                <button type="button" onClick={() => void reviewReport(report.id, 'DISMISSED')}>
                  Descartar
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void reviewReport(report.id, 'RESOLVED')}
                >
                  Resolver
                </button>
              </div>
            </li>
          ))}
          {reports?.length === 0 && <p>Nenhuma denúncia aberta.</p>}
        </ul>
      )}
      {kind === 'sanctions' && (
        <ul className="reports">
          {sanctions?.map((sanction) => (
            <li key={sanction.id}>
              <p>
                <strong>{sanction.user.displayName}</strong>:{' '}
                {sanction.type === 'MUTE' ? 'Silenciado' : 'Suspenso'}{' '}
                {sanction.endsAt ? `até ${dateTime(sanction.endsAt)}` : 'permanentemente'}
              </p>
              <div className="dialog-actions">
                <button type="button" onClick={() => void revokeSanction(sanction.id)}>
                  Revogar
                </button>
              </div>
            </li>
          ))}
          {sanctions?.length === 0 && <p>Nenhuma sanção em vigor.</p>}
        </ul>
      )}
      {kind === 'appeals' && (
        <ul className="reports">
          {appeals?.map((appeal) => (
            <li key={appeal.id}>
              <p>
                <strong>{appeal.user.displayName}</strong> contesta:{' '}
                {appeal.sanction.type === 'MUTE' ? 'silenciamento' : 'suspensão'}
                {appeal.sanction.endsAt ? `até ${dateTime(appeal.sanction.endsAt)}` : ' permanente'}
              </p>
              <blockquote>{appeal.message}</blockquote>
              <div className="dialog-actions">
                <button type="button" onClick={() => void decideAppeal(appeal.id, 'REJECTED')}>
                  Negar
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void decideAppeal(appeal.id, 'ACCEPTED')}
                >
                  Aceitar e revogar
                </button>
              </div>
            </li>
          ))}
          {appeals?.length === 0 && <p>Nenhuma apelação aberta.</p>}
        </ul>
      )}
    </div>
  );
}

async function reviewReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
  await api(`/admin/reports/${id}/review`, { json: { status } });
}

async function revokeSanction(id: string) {
  await api(`/admin/sanctions/${id}/revoke`, { json: {} });
}

async function decideAppeal(id: string, decision: 'ACCEPTED' | 'REJECTED') {
  await api(`/admin/appeals/${id}/review`, { json: { decision } });
}
