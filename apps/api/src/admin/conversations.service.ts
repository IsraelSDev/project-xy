import { Injectable } from '@nestjs/common';
import {
  DELETED_ACCOUNT_NAME,
  MESSAGE_RETENTION_DAYS,
  conversationKey,
  type ConversationKind,
  type ConversationMessage,
  type ConversationSummary,
  type UserRef,
} from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Teto de conversas listadas (mais recentes) e de mensagens por conversa. */
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 500;

/** A varredura da retenção roda no máximo uma vez por hora por instância. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

interface LogRow {
  id: string;
  senderId: string;
  recipientId: string | null;
  text: string;
  sentAt: Date;
}

/**
 * Leitura das conversas registradas pelo realtime (ADR 0015). Só a administração chama isto; os
 * nomes são resolvidos agora (conta excluída aparece como "Conta excluída") e o vencido é apagado
 * pelas próprias leituras, sem tarefa agendada.
 */
@Injectable()
export class ConversationsService {
  private nextSweep = 0;

  constructor(private readonly prisma: PrismaService) {}

  async list(kind: ConversationKind): Promise<ConversationSummary[]> {
    this.sweep();
    return kind === 'DIRECT' ? this.listDirect() : this.listRooms();
  }

  /** Mensagens privadas entre `a` e `b`, em ordem cronológica. */
  async directMessages(a: string, b: string): Promise<ConversationMessage[]> {
    const rows = await this.prisma.messageLog.findMany({
      where: { kind: 'DIRECT', conversationKey: conversationKey(a, b) },
      orderBy: { sentAt: 'asc' },
      take: MAX_MESSAGES,
    });
    return this.toMessages(rows);
  }

  /** Chat público de uma sala, em ordem cronológica. */
  async roomMessages(roomId: string): Promise<ConversationMessage[]> {
    const rows = await this.prisma.messageLog.findMany({
      where: { kind: 'ROOM', roomId },
      orderBy: { sentAt: 'asc' },
      take: MAX_MESSAGES,
    });
    return this.toMessages(rows);
  }

  private async listDirect(): Promise<ConversationSummary[]> {
    const groups = await this.prisma.messageLog.groupBy({
      by: ['conversationKey'],
      where: { kind: 'DIRECT', conversationKey: { not: null } },
      _count: { _all: true },
      _max: { sentAt: true },
      orderBy: { _max: { sentAt: 'desc' } },
      take: MAX_CONVERSATIONS,
    });

    const lasts = await Promise.all(
      groups.map((group) =>
        group.conversationKey
          ? this.prisma.messageLog.findFirst({
              where: { kind: 'DIRECT', conversationKey: group.conversationKey },
              orderBy: { sentAt: 'desc' },
            })
          : Promise.resolve(null),
      ),
    );
    const nameById = await this.names(
      lasts.flatMap((last) => (last ? [last.senderId, last.recipientId] : [])),
    );

    return groups.flatMap((group, index) => {
      const last = lasts[index];
      if (!group.conversationKey || !last) return [];
      const sender = this.ref(last.senderId, nameById);
      const participants = [
        sender,
        ...(last.recipientId ? [this.ref(last.recipientId, nameById)] : []),
      ];
      return [
        {
          kind: 'DIRECT' as const,
          id: group.conversationKey,
          title: null,
          participants,
          messageCount: group._count._all,
          lastText: last.text,
          lastSender: sender,
          lastAt: (group._max.sentAt ?? last.sentAt).toISOString(),
        },
      ];
    });
  }

  private async listRooms(): Promise<ConversationSummary[]> {
    const groups = await this.prisma.messageLog.groupBy({
      by: ['roomId'],
      where: { kind: 'ROOM', roomId: { not: null } },
      _count: { _all: true },
      _max: { sentAt: true },
      orderBy: { _max: { sentAt: 'desc' } },
      take: MAX_CONVERSATIONS,
    });

    const lasts = await Promise.all(
      groups.map((group) =>
        group.roomId
          ? this.prisma.messageLog.findFirst({
              where: { kind: 'ROOM', roomId: group.roomId },
              orderBy: { sentAt: 'desc' },
            })
          : Promise.resolve(null),
      ),
    );
    const nameById = await this.names(lasts.flatMap((last) => (last ? [last.senderId] : [])));

    return groups.flatMap((group, index) => {
      const last = lasts[index];
      if (!group.roomId || !last) return [];
      return [
        {
          kind: 'ROOM' as const,
          id: group.roomId,
          title: last.roomTitle,
          participants: [],
          messageCount: group._count._all,
          lastText: last.text,
          lastSender: this.ref(last.senderId, nameById),
          lastAt: (group._max.sentAt ?? last.sentAt).toISOString(),
        },
      ];
    });
  }

  private async toMessages(rows: LogRow[]): Promise<ConversationMessage[]> {
    const nameById = await this.names(rows.flatMap((row) => [row.senderId, row.recipientId]));
    return rows.map((row) => ({
      id: row.id,
      sender: this.ref(row.senderId, nameById),
      ...(row.recipientId ? { recipient: this.ref(row.recipientId, nameById) } : {}),
      text: row.text,
      sentAt: row.sentAt.toISOString(),
    }));
  }

  /** Nomes atuais dos ids citados; a conta excluída mostra o nome anonimizado. */
  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }

  private ref(id: string, nameById: Map<string, string>): UserRef {
    return { id, displayName: nameById.get(id) ?? DELETED_ACCOUNT_NAME };
  }

  /** Apaga o que passou da retenção (90 dias), no máximo uma vez por hora por instância. */
  private sweep(): void {
    const now = Date.now();
    if (now < this.nextSweep) return;
    this.nextSweep = now + SWEEP_INTERVAL_MS;
    const cutoff = new Date(now - MESSAGE_RETENTION_DAYS * DAY_MS);
    this.prisma.messageLog.deleteMany({ where: { sentAt: { lt: cutoff } } }).catch(() => undefined);
  }
}
