import type { SanctionType } from '@3dx/contracts';

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

/** Explicação para quem tenta entrar com a conta suspensa. */
export const suspensionMessage = (endsAt: Date | null) =>
  endsAt
    ? `Conta suspensa pela moderação até ${dateTime.format(endsAt)} (UTC).`
    : 'Conta suspensa permanentemente pela moderação.';
