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
import { RevokeSanctionRequest, type SanctionSummary, type SessionUser } from '@3dx/contracts';
import { activeSanction } from '../auth/sanctions';
import { CurrentUser, Roles, SessionGuard } from '../auth/session.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { PrismaService } from '../prisma/prisma.service';

const SANCTION_INCLUDE = {
  user: { select: { id: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
} as const;

type SanctionWithUsers = {
  id: string;
  type: SanctionSummary['type'];
  reportId: string;
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
  createdAt: sanction.createdAt.toISOString(),
  endsAt: sanction.endsAt?.toISOString() ?? null,
});

/** Sanções em vigor e revogação. Aplicar sanção é parte da revisão da denúncia. */
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

  /** Encerra a sanção antes do prazo. Sessões apagadas pela suspensão não voltam: é novo login. */
  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(
    @CurrentUser() moderator: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(RevokeSanctionRequest)) body: RevokeSanctionRequest,
  ): Promise<SanctionSummary> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Condição no próprio UPDATE: revogar duas vezes (ou depois do prazo) não gera auditoria dupla.
      const { count } = await tx.sanction.updateMany({
        where: { id, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        data: { revokedAt: now },
      });
      if (count === 0) {
        const exists = await tx.sanction.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw new NotFoundException('Sanção não encontrada.');
        throw new ConflictException('Esta sanção já terminou ou foi revogada.');
      }

      const sanction = await tx.sanction.findUniqueOrThrow({
        where: { id },
        include: SANCTION_INCLUDE,
      });
      await tx.moderationAction.create({
        data: {
          actorId: moderator.id,
          reportId: sanction.reportId,
          sanctionId: id,
          action: 'sanction.revoke',
          note: body.note || null,
        },
      });
      return toSummary(sanction);
    });
  }
}
