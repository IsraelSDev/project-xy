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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  APPEAL_STATUSES,
  ReviewAppealRequest,
  type AppealSummary,
  type ReportReason,
  type SessionUser,
} from '@3dx/contracts';
import { z } from 'zod';
import { CurrentUser, Roles, SessionGuard } from '../auth/session.guard.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { revokeSanction } from './apply-sanction.js';

const StatusQuery = z.enum(APPEAL_STATUSES).default('OPEN');

const APPEAL_INCLUDE = {
  user: { select: { id: true, displayName: true } },
  sanction: {
    select: {
      id: true,
      type: true,
      createdAt: true,
      endsAt: true,
      reason: true,
      report: { select: { reason: true } },
    },
  },
} as const;

type AppealWithDetails = {
  id: string;
  status: AppealSummary['status'];
  message: string;
  response: string | null;
  createdAt: Date;
  user: { id: string; displayName: string };
  sanction: {
    id: string;
    type: AppealSummary['sanction']['type'];
    createdAt: Date;
    endsAt: Date | null;
    reason: string | null;
    report: { reason: ReportReason } | null;
  };
};

const toSummary = (appeal: AppealWithDetails): AppealSummary => ({
  id: appeal.id,
  status: appeal.status,
  message: appeal.message,
  response: appeal.response,
  createdAt: appeal.createdAt.toISOString(),
  user: appeal.user,
  sanction: {
    id: appeal.sanction.id,
    type: appeal.sanction.type,
    createdAt: appeal.sanction.createdAt.toISOString(),
    endsAt: appeal.sanction.endsAt?.toISOString() ?? null,
    reportReason: appeal.sanction.report?.reason ?? null,
    reason: appeal.sanction.reason,
  },
});

/** Fila de contestações. Aceitar revoga a sanção; tudo fica na auditoria. */
@Controller('admin/appeals')
@UseGuards(SessionGuard)
@Roles('MODERATOR', 'ADMIN')
export class AdminAppealsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('status') status: unknown): Promise<AppealSummary[]> {
    const parsed = StatusQuery.safeParse(status);
    const appeals = await this.prisma.appeal.findMany({
      where: { status: parsed.success ? parsed.data : 'OPEN' },
      include: APPEAL_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return appeals.map(toSummary);
  }

  @Post(':id/review')
  @HttpCode(200)
  async review(
    @CurrentUser() moderator: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReviewAppealRequest)) body: ReviewAppealRequest,
  ): Promise<AppealSummary> {
    return this.prisma.$transaction(async (tx) => {
      const response = body.response || null;
      // Condição no próprio UPDATE: duas pessoas decidindo ao mesmo tempo não decidem duas vezes.
      const { count } = await tx.appeal.updateMany({
        where: { id, status: 'OPEN' },
        data: {
          status: body.decision,
          response,
          reviewedAt: new Date(),
          reviewedById: moderator.id,
        },
      });
      if (count === 0) {
        const exists = await tx.appeal.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw new NotFoundException('Contestação não encontrada.');
        throw new ConflictException('Esta contestação já foi decidida.');
      }

      const appeal = await tx.appeal.findUniqueOrThrow({ where: { id }, include: APPEAL_INCLUDE });
      if (body.decision === 'ACCEPTED') {
        // A sanção pode ter terminado enquanto a contestação esperava: aí não há o que revogar.
        await revokeSanction(tx, {
          sanctionId: appeal.sanction.id,
          moderatorId: moderator.id,
          note: 'Contestação aceita.',
        });
      }
      await tx.moderationAction.create({
        data: {
          actorId: moderator.id,
          sanctionId: appeal.sanction.id,
          action: `appeal.${body.decision.toLowerCase()}`,
          note: response,
        },
      });
      return toSummary(appeal);
    });
  }
}
