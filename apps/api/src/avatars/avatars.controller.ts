import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AvatarConfig, type SessionUser } from '@3dx/contracts';
import { RateLimit } from '../common/rate-limit.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { AvatarsService } from './avatars.service.js';

/**
 * Aparência do próprio usuário. Só aceita itens do catálogo (`AvatarConfig`); itens premium só
 * podem ser equipados se foram comprados. Os outros jogadores recebem o avatar pelo ticket do
 * realtime, que a API monta a partir do que está salvo aqui.
 */
@Controller('avatar')
@UseGuards(SessionGuard)
export class AvatarsController {
  constructor(private readonly avatars: AvatarsService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser): Promise<AvatarConfig> {
    return this.avatars.get(user.id);
  }

  @Put()
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async save(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(AvatarConfig)) avatar: AvatarConfig,
  ): Promise<AvatarConfig> {
    return this.avatars.save(user.id, avatar);
  }
}
