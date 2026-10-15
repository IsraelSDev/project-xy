/**
 * Registro das conversas (chat da sala e mensagens privadas) para a administração ler depois
 * (ADR 0015). A sala recebe um `MessageLog` pronto; sem ele, nada é guardado (testes e ambientes
 * sem banco seguem funcionando).
 */
export interface MessageLogEntry {
  /** Mesmo id do evento entregue às sessões (uuid). */
  id: string;
  kind: 'ROOM' | 'DIRECT';
  senderId: string;
  text: string;
  /** Horário do servidor (epoch ms). */
  sentAt: number;
  /** Chat da sala (`ROOM`). */
  roomId?: string;
  roomTitle?: string;
  /** Mensagem privada (`DIRECT`). */
  recipientId?: string;
  conversationKey?: string;
}

export interface MessageLog {
  /** Fire-and-forget: uma falha de escrita não pode derrubar o chat. */
  record(entry: MessageLogEntry): void;
}

/** Nada é guardado: usado nos testes e onde não há banco configurado. */
export const noopMessageLog: MessageLog = {
  record() {
    // Sem registro.
  },
};
