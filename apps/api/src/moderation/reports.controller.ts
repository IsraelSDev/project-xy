import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateReportRequest, type SessionUser } from '@3dx/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { PrismaService } from '../prisma/prisma.service';

const HOUR = 60 * 60_000;

@Controller('reports')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra uma denúncia para a moderação. Quem denuncia não vê o andamento (por enquanto). */
  @Post()
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  async create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(CreateReportRequest)) body: CreateReportRequest,
  ): Promise<{ id: string }> {
    if (body.reportedUserId === user.id) {
      throw new BadRequestException('Você não pode denunciar a si mesmo.');
    }
    const target = await this.prisma.user.findUnique({ where: { id: body.reportedUserId } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');

    const report = await this.prisma.report.create({
      data: {
        reporterId: user.id,
        reportedId: body.reportedUserId,
        reason: body.reason,
        details: body.details || null,
      },
      select: { id: true },
    });
    return report;
  }
}
