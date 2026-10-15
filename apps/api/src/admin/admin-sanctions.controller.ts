import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  DirectSanctionRequest,
  RevokeSanctionRequest,
  type SanctionSummary,
  type SessionUser,
} from '@3dx/contracts';
import { activeSanction } from '../auth/sanctions.js';
import { CurrentUser, Roles, SessionGuard } from '../auth/session.guard.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { applySanction, revokeSanction } from './apply-sanction.js';

const SANCTION_INCLUDE = {
  user: { select: { id: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
} as const;

type SanctionWithUsers = {
  id: string;
  type: SanctionSummary['type'];
  reportId: string | null;
  reason: string | null;
  createdAt: Date;
  endsAt: Date | null;
  user: { id: string; displayName: string };
  createdBy: { id: string; displayName: string };
};

const toSummary = (sanction: SanctionWithUsers): SanctionSummary => ({
  id: sanction.id,
  type: sanction.type,
  user: sanction.user,
  createdBy: sanction.createdBy,
  reportId: sanction.reportId,
  reason: sanction.reason,
  createdAt: sanction.createdAt.toISOString(),
  endsAt: sanction.endsAt?.toISOString() ?? null,
});

/** Sanções em vigor, sanção direta (sem denúncia) e revogação. */
@Controller('admin/sanctions')
@UseGuards(SessionGuard)
@Roles('MODERATOR', 'ADMIN')
export class AdminSanctionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listActive(): Promise<SanctionSummary[]> {
    const now = new Date();
    const sanctions = await this.prisma.sanction.findMany({
      where: { OR: [activeSanction('MUTE', now), activeSanction('SUSPEND', now)] },
      include: SANCTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return sanctions.map(toSummary);
  }

  /** Sanção sem denúncia (ex.: flagrante numa sala). O motivo é obrigatório e vai para a auditoria. */
  @Post()
  async create(
    @CurrentUser() moderator: SessionUser,
    @Body(new ZodBody(DirectSanctionRequest)) body: DirectSanctionRequest,
  ): Promise<SanctionSummary> {
    return this.prisma.$transaction(async (tx) => {
      const id = await applySanction(tx, {
        moderatorId: moderator.id,
        userId: body.userId,
        sanction: body.sanction,
        reportId: null,
        reason: body.reason,
      });
      return toSummary(
        await tx.sanction.findUniqueOrThrow({ where: { id }, include: SANCTION_INCLUDE }),
      );
    });
  }

  /** Encerra a sanção antes do prazo. Sessões apagadas pela suspensão não voltam: é novo login. */
  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(
    @CurrentUser() moderator: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(RevokeSanctionRequest)) body: RevokeSanctionRequest,
  ): Promise<SanctionSummary> {
    return this.prisma.$transaction(async (tx) => {
      const revoked = await revokeSanction(tx, {
        sanctionId: id,
        moderatorId: moderator.id,
        note: body.note || null,
      });
      if (!revoked) {
        const exists = await tx.sanction.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw new NotFoundException('Sanção não encontrada.');
        throw new ConflictException('Esta sanção já terminou ou foi revogada.');
      }
      return toSummary(
        await tx.sanction.findUniqueOrThrow({ where: { id }, include: SANCTION_INCLUDE }),
      );
    });
  }
}
