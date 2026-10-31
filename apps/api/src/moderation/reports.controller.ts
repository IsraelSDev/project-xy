import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateReportRequest, type SessionUser } from '@3dx/contracts';
import { RateLimit } from '../common/rate-limit.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotifyService } from '../notify/notify.service.js';

const HOUR = 60 * 60_000;

@Controller('reports')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  /** Registra uma denúncia para a moderação. Quem denuncia não vê o andamento (por enquanto). */
  @Post()
  @RateLimit({ limit: 10, windowMs: HOUR })
  async create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(CreateReportRequest)) body: CreateReportRequest,
  ): Promise<{ id: string }> {
    if (body.reportedUserId === user.id) {
      throw new BadRequestException('Você não pode denunciar a si mesmo.');
    }
    const target = await this.prisma.user.findUnique({ where: { id: body.reportedUserId } });
    if (!target || target.deletedAt) throw new NotFoundException('Usuário não encontrado.');

    const report = await this.prisma.report.create({
      data: {
        reporterId: user.id,
        reportedId: body.reportedUserId,
        context: body.context,
        reason: body.reason,
        details: body.details || null,
        // Denúncia de perfil: guarda a bio como prova, que pode mudar antes da revisão.
        evidence: body.context === 'PROFILE' ? target.bio : null,
      },
      select: { id: true },
    });
    void this.notify.notifyStaff('queue');
    return report;
  }
}
