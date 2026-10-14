import type { ReportSummary } from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { api } from '../../app/api';
import { REASON_LABELS } from '../safety/ReportDialog';

/** Fila de denúncias abertas (só moderação; a API também confere o papel). */
export function ModerationPanel({ onClose }: { onClose: () => void }) {
  const [reports, setReports] = useState<ReportSummary[]>();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    api<ReportSummary[]>('/admin/reports?status=OPEN')
      .then((list) => {
        if (!cancelled) setReports(list);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Falha ao carregar.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const review = async (id: string, status: 'RESOLVED' | 'DISMISSED') => {
    const note = notes[id]?.trim();
    try {
      await api(`/admin/reports/${id}/review`, { json: { status, note: note || undefined } });
      setReports((current) => current?.filter((report) => report.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao revisar.');
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
                {report.reporter.displayName} · {new Date(report.createdAt).toLocaleString('pt-BR')}
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
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </section>
    </div>
  );
}
