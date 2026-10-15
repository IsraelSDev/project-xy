import type { UserRef } from './safety.ts';

/**
 * Leitura das conversas pela administração (ADR 0015). O chat da sala e as mensagens privadas são
 * registrados no banco por 90 dias; só o papel ADMIN lê, e cada leitura fica na auditoria.
 */
export const MESSAGE_RETENTION_DAYS = 90;

export const CONVERSATION_KINDS = ['ROOM', 'DIRECT'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

/**
 * Chave do par de uma conversa privada: os dois ids em ordem alfabética, então a mesma dupla cai
 * sempre na mesma chave (como `Friendship`). O realtime grava e a API consulta com esta função.
 */
export const conversationKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Uma mensagem já com o nome de quem enviou/recebeu resolvido na hora da leitura. */
export interface ConversationMessage {
  id: string;
  sender: UserRef;
  /** Destinatário (DIRECT); ausente no chat da sala. */
  recipient?: UserRef;
  text: string;
  sentAt: string;
}

/** Uma conversa na lista da administração (chat de uma sala ou par de amigos). */
export interface ConversationSummary {
  kind: ConversationKind;
  /** DIRECT: a chave do par (`conversationKey`); ROOM: o roomId da sala. */
  id: string;
  /** Título da sala (ROOM); null em conversa privada. */
  title: string | null;
  /** Os dois participantes (DIRECT); vazio no chat da sala. */
  participants: UserRef[];
  messageCount: number;
  lastText: string;
  lastSender: UserRef;
  lastAt: string;
}
