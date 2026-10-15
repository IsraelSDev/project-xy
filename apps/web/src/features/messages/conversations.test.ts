import type { DirectMessageEvent } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { markRead, receive, rejected, totalUnread, type Conversations } from './conversations';

const me = 'eu';
const event = (from: string, to: string, text: string): DirectMessageEvent => ({
  id: `${from}-${text}`,
  from: { id: from, name: from === me ? 'Eu' : 'Bia' },
  to,
  text,
  sentAt: 0,
});
const nameOf = (id: string) => (id === 'bia' ? 'Bia' : undefined);

describe('conversas privadas', () => {
  it('agrupa recebidas e enviadas pela outra pessoa e conta não lidas fora da conversa aberta', () => {
    let conversations: Conversations = new Map();
    conversations = receive(conversations, event('bia', me, 'oi'), me, { nameOf });
    conversations = receive(conversations, event(me, 'bia', 'oi!'), me, { nameOf });
    conversations = receive(conversations, event('bia', me, 'tudo bem?'), me, { nameOf });

    const bia = conversations.get('bia');
    expect(bia?.messages.map((message) => message.text)).toEqual(['oi', 'oi!', 'tudo bem?']);
    expect(bia?.unread).toBe(2);
    expect(totalUnread(conversations)).toBe(2);

    conversations = markRead(conversations, 'bia');
    expect(totalUnread(conversations)).toBe(0);

    conversations = receive(conversations, event('bia', me, 'tá aí?'), me, {
      nameOf,
      open: 'bia',
    });
    expect(conversations.get('bia')?.unread).toBe(0);
  });

  it('recusa aparece na conversa e some com a próxima mensagem', () => {
    let conversations: Conversations = rejected(
      new Map(),
      'bia',
      'Seu amigo não está online.',
      'Bia',
    );
    expect(conversations.get('bia')?.notice).toBe('Seu amigo não está online.');
    conversations = receive(conversations, event('bia', me, 'voltei'), me, { nameOf });
    expect(conversations.get('bia')?.notice).toBeUndefined();
  });
});
