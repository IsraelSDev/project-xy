import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ProfilePhotoUpload,
  UpdateProfileRequest,
  type PublicProfile,
  type SessionUser,
} from '@3dx/contracts';
import type { Response } from 'express';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { ProfilePhotosService } from './profile-photos.service.js';
import { ProfilesService } from './profiles.service.js';

const MINUTE = 60_000;

/**
 * Perfis: o próprio (`/profiles/me`, editável) e o de outro membro (somente leitura). Só para
 * usuários logados, para não expor a lista de membros.
 */
@Controller('profiles')
@UseGuards(SessionGuard)
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly photos: ProfilePhotosService,
  ) {}

  @Get('me')
  mine(@CurrentUser() user: SessionUser): Promise<PublicProfile> {
    return this.profiles.get(user.id, user.id);
  }

  @Patch('me')
  @RateLimit({ limit: 30, windowMs: MINUTE })
  saveMine(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(UpdateProfileRequest)) body: UpdateProfileRequest,
  ): Promise<PublicProfile> {
    return this.profiles.update(user.id, body);
  }

  /** Foto em base64 no JSON (a API recusa outros formatos de corpo — proteção CSRF). */
  @Post('me/photo')
  @RateLimit({ limit: 10, windowMs: MINUTE })
  async uploadPhoto(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(ProfilePhotoUpload)) body: ProfilePhotoUpload,
  ): Promise<PublicProfile> {
    await this.photos.save(user.id, body);
    return this.profiles.get(user.id, user.id);
  }

  @Delete('me/photo')
  @RateLimit({ limit: 10, windowMs: MINUTE })
  async removePhoto(@CurrentUser() user: SessionUser): Promise<PublicProfile> {
    await this.photos.remove(user.id);
    return this.profiles.get(user.id, user.id);
  }

  /** Imagem crua da foto; o cliente usa direto no `<img>` (o cookie de sessão vai junto). */
  @Get(':id/photo')
  @Header('Cache-Control', 'private, max-age=300')
  async photo(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const photo = await this.photos.read(user.id, id);
    response.setHeader('Content-Type', photo.mime);
    return new StreamableFile(photo.data);
  }

  @Get(':id')
  get(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicProfile> {
    return this.profiles.get(user.id, id);
  }
}
