import { CHAT_MAX_LENGTH, type ChatEvent } from '@3dx/contracts';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { identityColor } from '../../app/identity-color';
import { StaffBadge } from '../../app/StaffBadge';

interface ChatPanelProps {
  messages: readonly ChatEvent[];
  /** Aviso do servidor ou da interface (ex.: limite de frequência). */
  notice?: string;
  connected: boolean;
  onSend: (text: string) => boolean;
}

const time = (sentAt: number) =>
  new Date(sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Chat público da sala. O texto é renderizado como texto (React escapa), nunca como HTML. */
export function ChatPanel({ messages, notice, connected, onSend }: ChatPanelProps) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onSend(text)) setText('');
  };

  // Esc devolve o foco ao mundo 3D, para voltar a andar com o teclado.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') event.currentTarget.blur();
  };

  return (
    <section className="hud-panel chat-panel" aria-label="Chat da sala">
      <h2 className="panel-title">Chat da sala</h2>
      <ol className="chat-messages" ref={listRef} aria-live="polite">
        {messages.length === 0 && <li className="chat-empty">Nenhuma mensagem ainda.</li>}
        {messages.map((message) => (
          <li key={message.id}>
            <span className="chat-time">{time(message.sentAt)}</span>{' '}
            <strong style={{ '--name': identityColor(message.userId) } as CSSProperties}>
              {message.name}
            </strong>{' '}
            <StaffBadge role={message.role} />
            {message.text}
          </li>
        ))}
      </ol>
      {notice && (
        <p className="chat-notice" role="status">
          {notice}
        </p>
      )}
      <form className="chat-form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="chat-input">
          Mensagem para a sala
        </label>
        <input
          id="chat-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={connected ? 'Escreva no chat…' : 'Sem conexão com a sala'}
          disabled={!connected}
          autoComplete="off"
        />
        <button type="submit" className="primary" disabled={!connected || text.trim() === ''}>
          Enviar
        </button>
      </form>
    </section>
  );
}
