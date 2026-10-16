import { Injectable, Logger } from '@nestjs/common';
import { NOTIFY_HEADER, type UserNotifyKind } from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/** Papéis que enxergam a fila da moderação (`GET /admin/queue`). */
const STAFF_ROLES = ['ADMIN', 'MODERATOR'] as const;

/**
 * Avisa o realtime (`POST /notify`, rota interna) que os dados de um ou mais usuários mudaram, para
 * o navegador deles recarregar na hora em vez de esperar o polling. Sem `REALTIME_NOTIFY_URL` e
 * `NOTIFY_SECRET` configurados, é um no-op: o polling continua sendo a reserva.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);
  private readonly url = process.env.REALTIME_NOTIFY_URL;
  private readonly secret = process.env.NOTIFY_SECRET;

  constructor(private readonly prisma: PrismaService) {}

  /** Dispara e esquece: o aviso não pode derrubar nem atrasar a ação que o originou. */
  notify(users: string[], kind: UserNotifyKind): void {
    if (!this.url || !this.secret) return;
    const unique = [...new Set(users)];
    if (unique.length === 0) return;
    void fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [NOTIFY_HEADER]: this.secret },
      body: JSON.stringify({ users: unique, kind }),
    }).catch((error: unknown) => {
      this.logger.warn(`aviso "${kind}" não entregue ao realtime: ${String(error)}`);
    });
  }

  /** Avisa toda a moderação que a fila mudou (denúncia/contestação nova). */
  async notifyStaff(kind: UserNotifyKind): Promise<void> {
    if (!this.url || !this.secret) return;
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] }, deletedAt: null },
      select: { id: true },
    });
    this.notify(
      staff.map((user) => user.id),
      kind,
    );
  }
}
