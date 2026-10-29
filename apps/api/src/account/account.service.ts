import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  DELETED_ACCOUNT_NAME,
  parseAvatar,
  type AccountExport,
  type UserRef,
} from '@3dx/contracts';
import { verifyPassword } from '../auth/password.js';
import { friendEntriesOf } from '../friends/friends.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const userRef = { select: { id: true, displayName: true } } as const;

/** Teto de mensagens na exportação (a própria pessoa pode ter um histórico longo). */
const MAX_EXPORTED_MESSAGES = 5000;

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tudo o que a conta guarda sobre a própria pessoa (direito de acesso). */
  async export(userId: string): Promise<AccountExport> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        sessions: { select: { createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } },
        blocksMade: {
          select: { createdAt: true, blocked: userRef },
          orderBy: { createdAt: 'desc' },
        },
        reportsMade: {
          select: {
            id: true,
            reason: true,
            details: true,
            status: true,
            createdAt: true,
            reported: userRef,
          },
          orderBy: { createdAt: 'desc' },
        },
        sanctions: {
          select: { type: true, createdAt: true, endsAt: true, revokedAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const logs = await this.prisma.messageLog.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      orderBy: { sentAt: 'asc' },
      take: MAX_EXPORTED_MESSAGES,
    });
    const citedIds = new Set<string>([userId]);
    for (const log of logs) {
      citedIds.add(log.senderId);
      if (log.recipientId) citedIds.add(log.recipientId);
    }
    const cited = await this.prisma.user.findMany({
      where: { id: { in: [...citedIds] } },
      select: { id: true, displayName: true },
    });
    const nameById = new Map(cited.map((entry) => [entry.id, entry.displayName]));
    const ref = (id: string): UserRef => ({
      id,
      displayName: nameById.get(id) ?? DELETED_ACCOUNT_NAME,
    });

    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
        role: user.role,
        avatar: parseAvatar(user.avatar),
        createdAt: user.createdAt.toISOString(),
      },
      sessions: user.sessions.map((session) => ({
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      })),
      blocks: user.blocksMade.map((block) => ({
        user: block.blocked,
        createdAt: block.createdAt.toISOString(),
      })),
      friends: await friendEntriesOf(this.prisma, userId),
      reportsMade: user.reportsMade.map((report) => ({
        ...report,
        createdAt: report.createdAt.toISOString(),
      })),
      sanctionsReceived: user.sanctions.map((sanction) => ({
        type: sanction.type,
        createdAt: sanction.createdAt.toISOString(),
        endsAt: sanction.endsAt?.toISOString() ?? null,
        revokedAt: sanction.revokedAt?.toISOString() ?? null,
      })),
      messages: logs.map((log) => ({
        kind: log.kind,
        roomId: log.roomId,
        from: ref(log.senderId),
        to: log.recipientId ? ref(log.recipientId) : null,
        text: log.text,
        sentAt: log.sentAt.toISOString(),
      })),
    };
  }

  /**
   * Exclui a conta anonimizando: apaga e-mail, senha, data de nascimento, avatar, sessões,
   * bloqueios, amizades e as mensagens do chat/MP. O registro fica, sem dado pessoal, para manter
   * denúncias, sanções e auditoria
   * (decisão registrada em docs/operations/privacidade.md). O e-mail e o nome ficam livres.
   */
  async delete(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new ForbiddenException('Senha incorreta.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Condição no próprio UPDATE: duas exclusões simultâneas não auditam duas vezes.
      const { count } = await tx.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: {
          // Formatos que nenhum cadastro aceita: .invalid não recebe e-mail (RFC 2606) e o nome
          // de exibição não permite ":".
          email: `excluida-${userId}@excluida.invalid`,
          displayName: DELETED_ACCOUNT_NAME,
          displayNameKey: `excluida:${userId}`,
          // Senha impossível: não é um hash scrypt, então nenhuma senha confere.
          passwordHash: `excluida:${randomBytes(16).toString('base64url')}`,
          birthDate: null,
          avatar: Prisma.DbNull,
          bio: null,
          role: 'USER',
          deletedAt: new Date(),
        },
      });
      if (count === 0) return;

      await tx.session.deleteMany({ where: { userId } });
      // Nomes anteriores são dado pessoal: somem junto com a conta (o registro não é apagado,
      // então o cascade do banco não dispara aqui).
      await tx.nameChange.deleteMany({ where: { userId } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.friendship.deleteMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } });
      // O conteúdo das conversas é dado pessoal: some junto com a conta (ADR 0015).
      await tx.messageLog.deleteMany({
        where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      });
      await tx.moderationAction.create({
        data: { actorId: userId, action: 'account.deleted', note: null },
      });
    });
  }
}
