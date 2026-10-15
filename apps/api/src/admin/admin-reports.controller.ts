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
  REPORT_STATUSES,
  ReviewReportRequest,
  type ReportSummary,
  type SessionUser,
} from '@3dx/contracts';
import { z } from 'zod';
import { Roles, CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { applySanction } from './apply-sanction.js';

const StatusQuery = z.enum(REPORT_STATUSES).default('OPEN');

const REPORT_INCLUDE = {
  reporter: { select: { id: true, displayName: true } },
  reported: { select: { id: true, displayName: true } },
} as const;

type ReportWithUsers = {
  id: string;
  reason: ReportSummary['reason'];
  details: string | null;
  status: ReportSummary['status'];
  createdAt: Date;
  reporter: { id: string; displayName: string };
  reported: { id: string; displayName: string };
};

const toSummary = (report: ReportWithUsers): ReportSummary => ({
  id: report.id,
  reason: report.reason,
  details: report.details,
  status: report.status,
  createdAt: report.createdAt.toISOString(),
  reporter: report.reporter,
  reported: report.reported,
});

/** Fila de denúncias. Só moderação e administração; toda decisão fica na trilha de auditoria. */
@Controller('admin/reports')
@UseGuards(SessionGuard)
@Roles('MODERATOR', 'ADMIN')
export class AdminReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('status') status: unknown): Promise<ReportSummary[]> {
    const parsed = StatusQuery.safeParse(status);
    const reports = await this.prisma.report.findMany({
      where: { status: parsed.success ? parsed.data : 'OPEN' },
      include: REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return reports.map(toSummary);
  }

  @Post(':id/review')
  @HttpCode(200)
  async review(
    @CurrentUser() moderator: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReviewReportRequest)) body: ReviewReportRequest,
  ): Promise<ReportSummary> {
    return this.prisma.$transaction(async (tx) => {
      // Condição no próprio UPDATE: duas pessoas revisando ao mesmo tempo não decidem duas vezes.
      const { count } = await tx.report.updateMany({
        where: { id, status: 'OPEN' },
        data: { status: body.status, reviewedAt: new Date() },
      });
      if (count === 0) {
        const exists = await tx.report.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw new NotFoundException('Denúncia não encontrada.');
        throw new ConflictException('Esta denúncia já foi revisada.');
      }

      const note = body.note || null;
      await tx.moderationAction.create({
        data: {
          actorId: moderator.id,
          reportId: id,
          action: `report.${body.status.toLowerCase()}`,
          note,
        },
      });

      if (body.sanction) {
        const { reportedId } = await tx.report.findUniqueOrThrow({
          where: { id },
          select: { reportedId: true },
        });
        await applySanction(tx, {
          moderatorId: moderator.id,
          userId: reportedId,
          sanction: body.sanction,
          reportId: id,
          reason: note,
        });
      }

      return toSummary(
        await tx.report.findUniqueOrThrow({ where: { id }, include: REPORT_INCLUDE }),
      );
    });
  }
}
