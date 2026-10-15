import type { AppealStatus, SanctionType } from '@3dx/contracts';

/** Filtro do Prisma para sanções em vigor: não revogadas e permanentes ou ainda no prazo. */
export const activeSanction = (type: SanctionType, now: Date) => ({
  type,
  revokedAt: null,
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Andamento da contestação, para a mensagem de login. */
function appealNote(appeal: { status: AppealStatus; response: string | null } | null): string {
  if (!appeal) return 'Você pode contestar a suspensão.';
  if (appeal.status === 'OPEN') return 'Sua contestação está em análise.';
  return appeal.response
    ? `Contestação negada pela moderação: ${appeal.response}`
    : 'Contestação negada pela moderação.';
}

/** Explicação para quem tenta entrar com a conta suspensa. */
export const suspensionMessage = (
  endsAt: Date | null,
  appeal: { status: AppealStatus; response: string | null } | null = null,
) =>
  `${
    endsAt
      ? `Conta suspensa pela moderação até ${dateTime.format(endsAt)} (UTC).`
      : 'Conta suspensa permanentemente pela moderação.'
  } ${appealNote(appeal)}`;
