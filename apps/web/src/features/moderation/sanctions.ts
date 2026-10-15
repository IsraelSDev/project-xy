import type { SanctionInput, SanctionSummary } from '@3dx/contracts';

/** Sanções oferecidas na moderação (a API aceita qualquer prazo até um ano). */
export const SANCTION_OPTIONS: { id: string; label: string; sanction: SanctionInput }[] = [
  { id: 'mute-1h', label: 'Silenciar por 1 hora', sanction: { type: 'MUTE', hours: 1 } },
  { id: 'mute-24h', label: 'Silenciar por 24 horas', sanction: { type: 'MUTE', hours: 24 } },
  { id: 'suspend-7d', label: 'Suspender por 7 dias', sanction: { type: 'SUSPEND', hours: 168 } },
  {
    id: 'suspend-forever',
    label: 'Suspender permanentemente',
    sanction: { type: 'SUSPEND', hours: null },
  },
];

export const SANCTION_TYPE_LABELS: Record<SanctionSummary['type'], string> = {
  MUTE: 'Silenciado',
  SUSPEND: 'Suspenso',
};
