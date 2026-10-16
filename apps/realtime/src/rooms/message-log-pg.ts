import { logEvent } from '@3dx/observability';
import { Pool } from 'pg';
import type { MessageLog, MessageLogEntry } from './message-log.ts';

export interface PgMessageLog extends MessageLog {
  close(): Promise<void>;
}

/**
 * Grava as conversas no mesmo Postgres da API (tabela `MessageLog`, criada pelas migrações da API).
 * A escrita é assíncrona e não bloqueia a entrega: se o banco cair, o chat continua e o erro vira
 * um log de operação.
 */
export function createPgMessageLog(connectionString: string): PgMessageLog {
  const pool = new Pool({ connectionString });
  return {
    record(entry: MessageLogEntry) {
      pool
        .query(
          `INSERT INTO "MessageLog"
             ("id","kind","roomId","roomTitle","senderId","recipientId","conversationKey","text","sentAt")
           VALUES ($1,$2::"MessageKind",$3,$4,$5,$6,$7,$8,$9)`,
          [
            entry.id,
            entry.kind,
            entry.roomId ?? null,
            entry.roomTitle ?? null,
            entry.senderId,
            entry.recipientId ?? null,
            entry.conversationKey ?? null,
            entry.text,
            new Date(entry.sentAt),
          ],
        )
        .catch((error: unknown) => {
          logEvent('realtime', 'message.log.failed', { kind: entry.kind, error: String(error) });
        });
    },
    close: () => pool.end(),
  };
}
