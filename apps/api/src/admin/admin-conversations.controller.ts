import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CONVERSATION_KINDS,
  conversationKey,
  type ConversationKind,
  type ConversationMessage,
  type ConversationSummary,
  type SessionUser,
} from '@3dx/contracts';
import { z } from 'zod';
import { CurrentUser, Roles, SessionGuard } from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConversationsService } from './conversations.service.js';

const KindQuery = z.enum(CONVERSATION_KINDS).default('DIRECT');

/** roomId do Colyseus: string curta e opaca. */
const RoomId = z.string().min(1).max(128);

/**
 * Leitura das conversas pela administração, **incluindo as privadas** (ADR 0015). Só ADMIN; toda
 * leitura entra na trilha de auditoria (`ModerationAction`).
 */
@Controller('admin/conversations')
@UseGuards(SessionGuard)
@Roles('ADMIN')
export class AdminConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@Query('kind') kind: unknown): Promise<ConversationSummary[]> {
    const parsed = KindQuery.safeParse(kind);
    if (!parsed.success) throw new BadRequestException('Tipo de conversa inválido.');
    return this.conversations.list(parsed.data);
  }

  @Get('direct/:a/:b')
  async direct(
    @CurrentUser() admin: SessionUser,
    @Param('a', ParseUUIDPipe) a: string,
    @Param('b', ParseUUIDPipe) b: string,
  ): Promise<ConversationMessage[]> {
    const messages = await this.conversations.directMessages(a, b);
    await this.audit(admin.id, 'DIRECT', conversationKey(a, b));
    return messages;
  }

  @Get('room/:roomId')
  async room(
    @CurrentUser() admin: SessionUser,
    @Param('roomId') roomId: string,
  ): Promise<ConversationMessage[]> {
    const parsed = RoomId.safeParse(roomId);
    if (!parsed.success) throw new BadRequestException('Sala inválida.');
    const messages = await this.conversations.roomMessages(parsed.data);
    await this.audit(admin.id, 'ROOM', parsed.data);
    return messages;
  }

  private audit(actorId: string, kind: ConversationKind, id: string): Promise<unknown> {
    return this.prisma.moderationAction.create({
      data: { actorId, action: 'conversation.read', note: `${kind}:${id}` },
    });
  }
}
