import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { SanctionInput } from '@3dx/contracts';
import type { Prisma } from '../generated/prisma/client.js';

const HOUR = 60 * 60_000;

export interface ApplySanctionInput {
  moderatorId: string;
  userId: string;
  sanction: SanctionInput;
  /** Denúncia que motivou a sanção; `null` = sanção direta. */
  reportId: string | null;
  reason: string | null;
}

/**
 * Aplica a sanção dentro da transação de quem chama: registro, auditoria e, na suspensão, fim das
 * sessões (quem está numa sala sai quando o ticket vencer). Recusar desfaz a transação inteira.
 */
export async function applySanction(
  tx: Prisma.TransactionClient,
  { moderatorId, userId, sanction, reportId, reason }: ApplySanctionInput,
): Promise<string> {
  const target = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, deletedAt: true },
  });
  if (!target || target.deletedAt) throw new NotFoundException('Usuário não encontrado.');
  // Equipe não sanciona equipe (nem a si mesma): papéis mudam pela linha de comando.
  if (target.role !== 'USER') {
    throw new ForbiddenException('Sanções só se aplicam a contas sem papel de moderação.');
  }

  const { type, hours } = sanction;
  const created = await tx.sanction.create({
    data: {
      userId,
      type,
      endsAt: hours === null ? null : new Date(Date.now() + hours * HOUR),
      reportId,
      reason,
      createdById: moderatorId,
    },
  });
  await tx.moderationAction.create({
    data: {
      actorId: moderatorId,
      reportId,
      sanctionId: created.id,
      action: `sanction.${type.toLowerCase()}`,
      note: reason,
    },
  });
  if (type === 'SUSPEND') await tx.session.deleteMany({ where: { userId } });
  return created.id;
}
