import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  FriendRequest,
  type FriendEntry,
  type FriendStatus,
  type SessionUser,
} from '@3dx/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { FriendsService } from './friends.service.js';

const HOUR = 60 * 60_000;

/** Amizades do usuário logado: pedir, aceitar, recusar e desfazer. */
@Controller('friends')
@UseGuards(SessionGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<FriendEntry[]> {
    return this.friends.list(user.id);
  }

  /** Pedido de amizade; se a outra pessoa já tinha pedido, vira amizade na hora. */
  @Post('requests')
  @RateLimit({ limit: 30, windowMs: HOUR })
  async request(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(FriendRequest)) body: FriendRequest,
  ): Promise<{ status: Exclude<FriendStatus, 'INCOMING'> }> {
    if (body.userId === user.id) {
      throw new BadRequestException('Você não pode adicionar a si mesmo.');
    }
    return { status: await this.friends.request(user.id, body.userId) };
  }

  @Post(':userId/accept')
  @HttpCode(204)
  accept(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.friends.accept(user.id, userId);
  }

  /** Recusa um pedido recebido, cancela um enviado ou desfaz a amizade. */
  @Delete(':userId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.friends.remove(user.id, userId);
  }
}
