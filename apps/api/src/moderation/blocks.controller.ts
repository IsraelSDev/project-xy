import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BlockRequest, type BlockedUser, type SessionUser } from '@3dx/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bloqueios do usuário logado. O efeito (chat filtrado nos dois sentidos) é aplicado pelo servidor
 * realtime a partir do ticket assinado; o cliente não consegue desfazer o bloqueio de outra pessoa.
 */
@Controller('blocks')
@UseGuards(SessionGuard)
export class BlocksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<BlockedUser[]> {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: user.id },
      include: { blocked: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return blocks.map((block) => ({
      id: block.blocked.id,
      displayName: block.blocked.displayName,
      blockedAt: block.createdAt.toISOString(),
    }));
  }

  @Post()
  @HttpCode(204)
  async block(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(BlockRequest)) body: BlockRequest,
  ): Promise<void> {
    if (body.userId === user.id) {
      throw new BadRequestException('Você não pode bloquear a si mesmo.');
    }
    const target = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');

    // Idempotente: bloquear de novo não é erro.
    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: body.userId } },
      create: { blockerId: user.id, blockedId: body.userId },
      update: {},
    });
  }

  @Delete(':userId')
  @HttpCode(204)
  async unblock(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId: user.id, blockedId: userId } });
  }
}
