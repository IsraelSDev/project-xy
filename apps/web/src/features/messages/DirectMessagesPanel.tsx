import { CHAT_MAX_LENGTH, type FriendEntry } from '@3dx/contracts';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { totalUnread, type Conversations } from './conversations';

interface DirectMessagesPanelProps {
  me: string;
  friends: readonly FriendEntry[];
  conversations: Conversations;
  /** Amigo da conversa aberta. */
  open?: string;
  onOpen: (friendId: string | undefined) => void;
  onSend: (friendId: string, text: string) => boolean;
}

const time = (sentAt: number) =>
  new Date(sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Mensagens privadas com amigos. Nada fica guardado no servidor: recarregar a página apaga. */
export function DirectMessagesPanel({
  me,
  friends,
  conversations,
  open,
  onOpen,
  onSend,
}: DirectMessagesPanelProps) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const conversation = open ? conversations.get(open) : undefined;
  const unread = totalUnread(conversations);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [conversation?.messages]);

  if (friends.length === 0 && conversations.size === 0) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (open && onSend(open, text)) setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') event.currentTarget.blur();
  };

  return (
    <section className="hud-panel dm-panel" aria-label="Mensagens privadas">
      <label className="dm-picker">
        Mensagens{unread > 0 && ` (${unread} não lidas)`}
        <select value={open ?? ''} onChange={(event) => onOpen(event.target.value || undefined)}>
          <option value="">Fechada</option>
          {friends.map((friend) => {
            const count = conversations.get(friend.user.id)?.unread ?? 0;
            return (
              <option key={friend.user.id} value={friend.user.id}>
                {friend.user.displayName}
                {count > 0 && ` (${count})`}
              </option>
            );
          })}
        </select>
      </label>
      {open && (
        <>
          <ol className="chat-messages" ref={listRef} aria-live="polite">
            {(conversation?.messages.length ?? 0) === 0 && (
              <li className="chat-empty">Nenhuma mensagem nesta conversa.</li>
            )}
            {conversation?.messages.map((message) => (
              <li key={message.id}>
                <time>{time(message.sentAt)}</time>{' '}
                <strong>{message.from.id === me ? 'Você' : message.from.name}</strong>:{' '}
                {message.text}
              </li>
            ))}
          </ol>
          {conversation?.notice && (
            <p className="chat-notice" role="status">
              {conversation.notice}
            </p>
          )}
          <form className="chat-form" onSubmit={submit}>
            <label className="visually-hidden" htmlFor="dm-input">
              Mensagem privada
            </label>
            <input
              id="dm-input"
              value={text}
              maxLength={CHAT_MAX_LENGTH}
              placeholder="Mensagem privada…"
              autoComplete="off"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="submit" disabled={!text.trim()}>
              Enviar
            </button>
          </form>
        </>
      )}
    </section>
  );
}
