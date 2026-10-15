import type { DirectMessageEvent } from '@3dx/contracts';

/** Mensagens guardadas por conversa, só nesta aba (nada fica no servidor). */
export const MAX_DM_MESSAGES = 100;

export interface Conversation {
  friendId: string;
  name: string;
  messages: DirectMessageEvent[];
  unread: number;
  /** Aviso da última tentativa (ex.: amigo offline). */
  notice?: string;
}

export type Conversations = ReadonlyMap<string, Conversation>;

const withConversation = (
  conversations: Conversations,
  friendId: string,
  name: string,
  update: (current: Conversation) => Conversation,
): Conversations => {
  const current = conversations.get(friendId) ?? { friendId, name, messages: [], unread: 0 };
  return new Map(conversations).set(friendId, update(current));
};

/**
 * Mensagem recebida ou eco de uma enviada: vai para a conversa com a outra pessoa. Conta como não
 * lida se veio dela e a conversa não está aberta.
 */
export function receive(
  conversations: Conversations,
  event: DirectMessageEvent,
  me: string,
  options: { open?: string; nameOf: (userId: string) => string | undefined },
): Conversations {
  const incoming = event.from.id !== me;
  const friendId = incoming ? event.from.id : event.to;
  const name = incoming ? event.from.name : (options.nameOf(friendId) ?? 'Amigo');
  return withConversation(conversations, friendId, name, (current) => ({
    ...current,
    name,
    messages: [...current.messages, event].slice(-MAX_DM_MESSAGES),
    unread: incoming && options.open !== friendId ? current.unread + 1 : current.unread,
    notice: undefined,
  }));
}

/** Mensagem não enviada: o motivo aparece na conversa. */
export function rejected(
  conversations: Conversations,
  friendId: string,
  reason: string,
  name: string,
): Conversations {
  return withConversation(conversations, friendId, name, (current) => ({
    ...current,
    notice: reason,
  }));
}

/** Conversa aberta: tudo lido. */
export function markRead(conversations: Conversations, friendId: string): Conversations {
  const current = conversations.get(friendId);
  if (!current || current.unread === 0) return conversations;
  return new Map(conversations).set(friendId, { ...current, unread: 0 });
}

export const totalUnread = (conversations: Conversations) =>
  [...conversations.values()].reduce((total, conversation) => total + conversation.unread, 0);
