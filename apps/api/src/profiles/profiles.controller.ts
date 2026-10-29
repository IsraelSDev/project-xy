import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { UpdateProfileRequest, type PublicProfile, type SessionUser } from '@3dx/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Perfis: o próprio (`/profiles/me`, editável) e o de outro membro (somente leitura). Só para
 * usuários logados, para não expor a lista de membros.
 */
@Controller('profiles')
@UseGuards(SessionGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me')
  mine(@CurrentUser() user: SessionUser): Promise<PublicProfile> {
    return this.profiles.get(user.id, user.id);
  }

  @Patch('me')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  saveMine(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(UpdateProfileRequest)) body: UpdateProfileRequest,
  ): Promise<PublicProfile> {
    return this.profiles.updateBio(user.id, body.bio);
  }

  @Get(':id')
  get(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicProfile> {
    return this.profiles.get(user.id, id);
  }
}
