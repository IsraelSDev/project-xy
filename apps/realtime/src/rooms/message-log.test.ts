import type { AddressInfo } from 'node:net';
import {
  CHAT_MESSAGE,
  conversationKey,
  DM_MESSAGE,
  LOUNGE_ROOM,
  LoungeState,
  PROTOCOL_VERSION,
} from '@3dx/contracts';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTicketIssuer, type TicketUser } from '../../test/tickets.ts';
import { createRealtimeServer } from '../server.ts';
import type { MessageLogEntry } from './message-log.ts';

type LoungeRoom = Room<unknown, LoungeState>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condição não atendida dentro do prazo');
    await sleep(20);
  }
}

describe('registro das conversas (ADR 0015)', () => {
  const tickets = createTicketIssuer();
  const entries: MessageLogEntry[] = [];
  const server = createRealtimeServer({
    reconnectSeconds: 1,
    ticketGraceSeconds: 30,
    ticketPublicKey: tickets.publicKeyBase64,
    messageLog: { record: (entry) => entries.push(entry) },
  });
  let client: Client;
  const opened: LoungeRoom[] = [];

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const { port } = server.transport.server?.address() as AddressInfo;
    client = new Client(`http://127.0.0.1:${port}`);
  });

  afterEach(async () => {
    entries.length = 0;
    await Promise.all(
      opened
        .splice(0)
        .map((room) => Promise.race([room.leave().catch(() => undefined), sleep(300)])),
    );
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  const enter = async (user: TicketUser): Promise<LoungeRoom> => {
    const options = { protocol: PROTOCOL_VERSION, ticket: await tickets.issue(user) };
    const room = await client.create<LoungeState>(LOUNGE_ROOM, options, LoungeState);
    room.reconnection.enabled = false;
    opened.push(room);
    room.onMessage('*', () => undefined);
    await waitFor(() => room.state.players.has(room.sessionId));
    return room;
  };

  it('grava o chat da sala com o id da sala e o título', async () => {
    const ana = tickets.newUser();
    const room = await enter(ana);

    room.send(CHAT_MESSAGE, { text: '  bom dia  ' });
    await waitFor(() => entries.length === 1);
    expect(entries[0]).toMatchObject({
      kind: 'ROOM',
      roomId: room.roomId,
      roomTitle: 'Balada',
      senderId: ana.sub,
      text: 'bom dia',
    });
  });

  it('grava a mensagem privada com remetente, destinatário e a chave do par', async () => {
    const ana = tickets.newUser();
    const bia = tickets.newUser();
    ana.friends = [bia.sub];
    bia.friends = [ana.sub];
    const anaRoom = await enter(ana);
    await enter(bia);

    anaRoom.send(DM_MESSAGE, { to: bia.sub, text: 'oi, Bia!' });
    await waitFor(() => entries.length === 1);
    expect(entries[0]).toMatchObject({
      kind: 'DIRECT',
      senderId: ana.sub,
      recipientId: bia.sub,
      conversationKey: conversationKey(ana.sub, bia.sub),
      text: 'oi, Bia!',
    });
  });

  it('não grava a mensagem privada recusada', async () => {
    const ana = tickets.newUser();
    const stranger = tickets.newUser();
    const anaRoom = await enter(ana);
    await enter(stranger);

    anaRoom.send(DM_MESSAGE, { to: stranger.sub, text: 'oi' });
    await sleep(150);
    expect(entries).toEqual([]);
  });
});
