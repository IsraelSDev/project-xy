import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AvatarConfig, parseAvatar, type SessionUser } from '@3dx/contracts';
import { RateLimit } from '../common/rate-limit.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Aparência do próprio usuário. Só aceita itens do catálogo (`AvatarConfig`); os outros jogadores
 * recebem o avatar pelo ticket do realtime, que a API monta a partir do que está salvo aqui.
 */
@Controller('avatar')
@UseGuards(SessionGuard)
export class AvatarsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser): Promise<AvatarConfig> {
    const stored = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { avatar: true },
    });
    return parseAvatar(stored.avatar);
  }

  @Put()
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async save(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(AvatarConfig)) avatar: AvatarConfig,
  ): Promise<AvatarConfig> {
    await this.prisma.user.update({ where: { id: user.id }, data: { avatar } });
    return avatar;
  }
}
