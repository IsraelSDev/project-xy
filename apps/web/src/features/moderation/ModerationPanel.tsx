import type { ReportSummary, SanctionInput, SanctionSummary } from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { api } from '../../app/api';
import { REASON_LABELS } from '../safety/ReportDialog';

/** Sanções oferecidas ao resolver uma denúncia (a API aceita qualquer prazo até um ano). */
const SANCTION_OPTIONS: { id: string; label: string; sanction?: SanctionInput }[] = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'mute-1h', label: 'Silenciar por 1 hora', sanction: { type: 'MUTE', hours: 1 } },
  { id: 'mute-24h', label: 'Silenciar por 24 horas', sanction: { type: 'MUTE', hours: 24 } },
  { id: 'suspend-7d', label: 'Suspender por 7 dias', sanction: { type: 'SUSPEND', hours: 168 } },
  {
    id: 'suspend-forever',
    label: 'Suspender permanentemente',
    sanction: { type: 'SUSPEND', hours: null },
  },
];

const TYPE_LABELS: Record<SanctionSummary['type'], string> = {
  MUTE: 'Silenciado',
  SUSPEND: 'Suspenso',
};

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const messageOf = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message : fallback;

/** Fila de denúncias abertas e sanções em vigor (só moderação; a API também confere o papel). */
export function ModerationPanel({ onClose }: { onClose: () => void }) {
  const [reports, setReports] = useState<ReportSummary[]>();
  const [sanctions, setSanctions] = useState<SanctionSummary[]>();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<ReportSummary[]>('/admin/reports?status=OPEN'),
      api<SanctionSummary[]>('/admin/sanctions'),
    ])
      .then(([reportList, sanctionList]) => {
        if (cancelled) return;
        setReports(reportList);
        setSanctions(sanctionList);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught, 'Falha ao carregar.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const review = async (id: string, status: 'RESOLVED' | 'DISMISSED') => {
    const note = notes[id]?.trim();
    // Sanção só acompanha a resolução; descartar nunca sanciona.
    const sanction =
      status === 'RESOLVED'
        ? SANCTION_OPTIONS.find((option) => option.id === choices[id])?.sanction
        : undefined;
    try {
      await api(`/admin/reports/${id}/review`, {
        json: { status, note: note || undefined, sanction },
      });
      setReports((current) => current?.filter((report) => report.id !== id));
      if (sanction) setSanctions(await api<SanctionSummary[]>('/admin/sanctions'));
    } catch (caught) {
      setError(messageOf(caught, 'Falha ao revisar.'));
    }
  };

  const revoke = async (id: string) => {
    try {
      await api(`/admin/sanctions/${id}/revoke`, { json: {} });
      setSanctions((current) => current?.filter((sanction) => sanction.id !== id));
    } catch (caught) {
      setError(messageOf(caught, 'Falha ao revogar.'));
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog moderation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderation-title"
      >
        <h2 id="moderation-title">Denúncias abertas</h2>
        {error && <p role="alert">{error}</p>}
        {!reports && !error && <p>Carregando…</p>}
        {reports?.length === 0 && <p>Nenhuma denúncia aberta.</p>}
        <ul className="reports">
          {reports?.map((report) => (
            <li key={report.id}>
              <p>
                <strong>{report.reported.displayName}</strong> denunciado por{' '}
                {report.reporter.displayName} · {dateTime(report.createdAt)}
              </p>
              <p>
                {REASON_LABELS[report.reason]}
                {report.details && `: ${report.details}`}
              </p>
              <label className="review-note">
                Observação para a auditoria (opcional)
                <input
                  value={notes[report.id] ?? ''}
                  maxLength={1000}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [report.id]: event.target.value }))
                  }
                />
              </label>
              <label className="review-note">
                Sanção ao resolver
                <select
                  value={choices[report.id] ?? 'none'}
                  onChange={(event) =>
                    setChoices((current) => ({ ...current, [report.id]: event.target.value }))
                  }
                >
                  {SANCTION_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dialog-actions">
                <button type="button" onClick={() => void review(report.id, 'DISMISSED')}>
                  Descartar
                </button>
                <button type="button" onClick={() => void review(report.id, 'RESOLVED')}>
                  Resolver
                </button>
              </div>
            </li>
          ))}
        </ul>

        <h2>Sanções em vigor</h2>
        {sanctions?.length === 0 && <p>Nenhuma sanção em vigor.</p>}
        <ul className="reports">
          {sanctions?.map((sanction) => (
            <li key={sanction.id}>
              <p>
                <strong>{sanction.user.displayName}</strong>: {TYPE_LABELS[sanction.type]}{' '}
                {sanction.endsAt ? `até ${dateTime(sanction.endsAt)}` : 'permanentemente'}
              </p>
              <p>
                Aplicada por {sanction.createdBy.displayName} em {dateTime(sanction.createdAt)}
              </p>
              <div className="dialog-actions">
                <button type="button" onClick={() => void revoke(sanction.id)}>
                  Revogar
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </section>
    </div>
  );
}
