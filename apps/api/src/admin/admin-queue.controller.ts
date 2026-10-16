import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ModerationQueueSummary } from '@3dx/contracts';
import { Roles, SessionGuard } from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Tamanho da fila de denúncias e contestações abertas. O front consulta de tempos em tempos para
 * avisar a moderação que chegou item novo, sem precisar abrir o painel.
 */
@Controller('admin/queue')
@UseGuards(SessionGuard)
@Roles('MODERATOR', 'ADMIN')
export class AdminQueueController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async summary(): Promise<ModerationQueueSummary> {
    const [reports, appeals] = await this.prisma.$transaction([
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.appeal.count({ where: { status: 'OPEN' } }),
    ]);
    return { reports, appeals };
  }
}
