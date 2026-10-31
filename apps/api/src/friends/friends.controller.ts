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
  type FriendSuggestion,
  type SessionUser,
} from '@3dx/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { FriendsService } from './friends.service.js';
import { NotifyService } from '../notify/notify.service.js';

const HOUR = 60 * 60_000;

/** Amizades do usuário logado: pedir, aceitar, recusar e desfazer. */
@Controller('friends')
@UseGuards(SessionGuard)
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly notify: NotifyService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<FriendEntry[]> {
    return this.friends.list(user.id);
  }

  /** Sugestões de amizade (amigos em comum), para o diálogo de amigos. */
  @Get('suggestions')
  suggestions(@CurrentUser() user: SessionUser): Promise<FriendSuggestion[]> {
    return this.friends.suggestions(user.id);
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
    const status = await this.friends.request(user.id, body.userId);
    void this.notify.notify([user.id, body.userId], 'friends');
    return { status };
  }

  @Post(':userId/accept')
  @HttpCode(204)
  async accept(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.friends.accept(user.id, userId);
    void this.notify.notify([user.id, userId], 'friends');
  }

  /** Recusa um pedido recebido, cancela um enviado ou desfaz a amizade. */
  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.friends.remove(user.id, userId);
    void this.notify.notify([user.id, userId], 'friends');
  }
}
