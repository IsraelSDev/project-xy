import type { ConversationKind, ConversationMessage, ConversationSummary } from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { api } from '../../app/api';

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const messageOf = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message : fallback;

const nameOf = (summary: ConversationSummary) =>
  summary.kind === 'DIRECT'
    ? summary.participants.map((person) => person.displayName).join(' ↔ ')
    : (summary.title ?? 'Sala sem título');

/**
 * Leitura das conversas pela administração, incluindo mensagens privadas (ADR 0015). Só ADMIN vê
 * este painel; a API confere o papel de novo e registra cada leitura na auditoria.
 */
export function ConversationsPanel({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<ConversationKind>('DIRECT');
  const [conversations, setConversations] = useState<ConversationSummary[]>();
  const [selected, setSelected] = useState<ConversationSummary>();
  const [messages, setMessages] = useState<ConversationMessage[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    api<ConversationSummary[]>(`/admin/conversations?kind=${kind}`)
      .then((list) => {
        if (!cancelled) setConversations(list);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught, 'Falha ao carregar as conversas.'));
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const switchKind = (next: ConversationKind) => {
    if (next === kind) return;
    setConversations(undefined);
    setSelected(undefined);
    setMessages(undefined);
    setError(undefined);
    setKind(next);
  };

  const open = async (summary: ConversationSummary) => {
    setSelected(summary);
    setMessages(undefined);
    setError(undefined);
    const path =
      summary.kind === 'DIRECT'
        ? `/admin/conversations/direct/${summary.id.split(':').join('/')}`
        : `/admin/conversations/room/${encodeURIComponent(summary.id)}`;
    try {
      setMessages(await api<ConversationMessage[]>(path));
    } catch (caught) {
      setError(messageOf(caught, 'Falha ao ler a conversa.'));
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog moderation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversations-title"
      >
        <h2 id="conversations-title">Conversas</h2>
        <p>Leitura para moderação. Cada conversa aberta fica registrada na auditoria.</p>
        {error && <p role="alert">{error}</p>}

        <div className="dialog-actions">
          <button
            type="button"
            className={kind === 'DIRECT' ? 'primary' : undefined}
            onClick={() => switchKind('DIRECT')}
          >
            Privadas
          </button>
          <button
            type="button"
            className={kind === 'ROOM' ? 'primary' : undefined}
            onClick={() => switchKind('ROOM')}
          >
            Salas
          </button>
        </div>

        {!conversations && !error && <p>Carregando…</p>}
        {conversations?.length === 0 && (
          <p>{kind === 'DIRECT' ? 'Nenhuma conversa privada.' : 'Nenhuma conversa de sala.'}</p>
        )}
        <ul className="reports">
          {conversations?.map((summary) => (
            <li key={summary.id}>
              <p>
                <strong>{nameOf(summary)}</strong> · {summary.messageCount}{' '}
                {summary.messageCount === 1 ? 'mensagem' : 'mensagens'} · {dateTime(summary.lastAt)}
              </p>
              <blockquote>
                {summary.lastSender.displayName}: {summary.lastText}
              </blockquote>
              <div className="dialog-actions">
                <button type="button" onClick={() => void open(summary)}>
                  Ler conversa
                </button>
              </div>
            </li>
          ))}
        </ul>

        {selected && (
          <>
            <h3>{nameOf(selected)}</h3>
            {!messages && !error && <p>Carregando…</p>}
            {messages?.length === 0 && <p>Sem mensagens guardadas nesta conversa.</p>}
            <ol className="thread">
              {messages?.map((message) => (
                <li key={message.id}>
                  <span className="thread-when">{dateTime(message.sentAt)}</span>
                  <span className="thread-from">
                    {message.sender.displayName}
                    {message.recipient ? ` → ${message.recipient.displayName}` : ''}
                  </span>
                  <span className="thread-text">{message.text}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </section>
    </div>
  );
}
