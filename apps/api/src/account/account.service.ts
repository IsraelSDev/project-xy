import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { DELETED_ACCOUNT_NAME, parseAvatar, type AccountExport } from '@3dx/contracts';
import { verifyPassword } from '../auth/password.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const userRef = { select: { id: true, displayName: true } } as const;

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
    };
  }

  /**
   * Exclui a conta anonimizando: apaga e-mail, senha, data de nascimento, avatar, sessões e
   * bloqueios. O registro fica, sem dado pessoal, para manter denúncias, sanções e auditoria
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
          role: 'USER',
          deletedAt: new Date(),
        },
      });
      if (count === 0) return;

      await tx.session.deleteMany({ where: { userId } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.moderationAction.create({
        data: { actorId: userId, action: 'account.deleted', note: null },
      });
    });
  }
}
