import type { AddressInfo } from 'node:net';
import {
  DM_EVENT,
  DM_MESSAGE,
  DM_REJECTED_EVENT,
  LOUNGE_ROOM,
  LoungeState,
  PROTOCOL_VERSION,
  type DirectMessageEvent,
  type DirectMessageRejectedEvent,
} from '@3dx/contracts';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTicketIssuer, type TicketUser } from '../../test/tickets.ts';
import { createRealtimeServer } from '../server.ts';

type LoungeRoom = Room<unknown, LoungeState>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condição não atendida dentro do prazo');
    await sleep(20);
  }
}

describe('mensagens privadas', () => {
  const tickets = createTicketIssuer();
  const server = createRealtimeServer({
    reconnectSeconds: 1,
    ticketGraceSeconds: 30,
    ticketPublicKey: tickets.publicKeyBase64,
  });
  let client: Client;
  const opened: LoungeRoom[] = [];

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const { port } = server.transport.server?.address() as AddressInfo;
    client = new Client(`http://127.0.0.1:${port}`);
  });

  afterEach(async () => {
    await Promise.all(
      opened
        .splice(0)
        .map((room) => Promise.race([room.leave().catch(() => undefined), sleep(300)])),
    );
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  interface Inbox {
    room: LoungeRoom;
    received: DirectMessageEvent[];
    rejected: DirectMessageRejectedEvent[];
  }

  /** Cada pessoa entra numa sala própria: a mensagem privada atravessa salas. */
  const enter = async (user: TicketUser): Promise<Inbox> => {
    const options = { protocol: PROTOCOL_VERSION, ticket: await tickets.issue(user) };
    const room = await client.create<LoungeState>(LOUNGE_ROOM, options, LoungeState);
    room.reconnection.enabled = false;
    opened.push(room);
    const inbox: Inbox = { room, received: [], rejected: [] };
    room.onMessage(DM_EVENT, (event: DirectMessageEvent) => inbox.received.push(event));
    room.onMessage(DM_REJECTED_EVENT, (event: DirectMessageRejectedEvent) =>
      inbox.rejected.push(event),
    );
    room.onMessage('*', () => undefined);
    await waitFor(() => room.state.players.has(room.sessionId));
    return inbox;
  };

  const friendsPair = () => {
    const ana = tickets.newUser();
    const bia = tickets.newUser();
    ana.friends = [bia.sub];
    bia.friends = [ana.sub];
    return { ana, bia };
  };

  it('entrega ao amigo em outra sala e devolve o eco a quem enviou', async () => {
    const { ana, bia } = friendsPair();
    const anaInbox = await enter(ana);
    const biaInbox = await enter(bia);
    expect(anaInbox.room.roomId).not.toBe(biaInbox.room.roomId);

    anaInbox.room.send(DM_MESSAGE, { to: bia.sub, text: '  oi, Bia!  ' });
    await waitFor(() => biaInbox.received.length === 1 && anaInbox.received.length === 1);
    expect(biaInbox.received[0]).toMatchObject({
      from: { id: ana.sub, name: ana.name },
      to: bia.sub,
      text: 'oi, Bia!',
    });
    expect(anaInbox.received[0]?.id).toBe(biaInbox.received[0]?.id);
  });

  it('recusa quem não é amigo e amigo offline', async () => {
    const { ana, bia } = friendsPair();
    const stranger = tickets.newUser();
    const anaInbox = await enter(ana);
    const strangerInbox = await enter(stranger);

    anaInbox.room.send(DM_MESSAGE, { to: stranger.sub, text: 'oi' });
    anaInbox.room.send(DM_MESSAGE, { to: bia.sub, text: 'oi' });
    await waitFor(() => anaInbox.rejected.length === 2);
    expect(anaInbox.rejected.map((event) => event.reason)).toEqual([
      'Mensagens privadas só entre amigos.',
      'Seu amigo não está online.',
    ]);
    await sleep(100);
    expect(strangerInbox.received).toEqual([]);
  });

  it('silenciado não envia', async () => {
    const { ana, bia } = friendsPair();
    const mutedUntil = Date.now() + 60_000;
    const anaInbox = await enter({ ...ana, mutedUntil });
    const biaInbox = await enter(bia);

    anaInbox.room.send(DM_MESSAGE, { to: bia.sub, text: 'oi' });
    await waitFor(() => anaInbox.rejected.length === 1);
    expect(anaInbox.rejected[0]).toEqual({
      to: bia.sub,
      reason: 'Você foi silenciado pela moderação.',
      until: mutedUntil,
    });
    await sleep(100);
    expect(biaInbox.received).toEqual([]);
  });

  it('vale o ticket do destinatário: quem bloqueou não recebe', async () => {
    const { ana, bia } = friendsPair();
    const anaInbox = await enter(ana);
    // Bia bloqueou Ana; o ticket de Ana ainda diz que são amigas (renovação pendente).
    const biaInbox = await enter({ ...bia, blocked: [ana.sub] });

    anaInbox.room.send(DM_MESSAGE, { to: bia.sub, text: 'oi' });
    await waitFor(() => anaInbox.received.length === 1);
    await sleep(100);
    expect(biaInbox.received).toEqual([]);
  });

  it('quem saiu da sala fica offline', async () => {
    const { ana, bia } = friendsPair();
    const anaInbox = await enter(ana);
    const biaInbox = await enter(bia);
    await biaInbox.room.leave();
    await sleep(100);

    anaInbox.room.send(DM_MESSAGE, { to: bia.sub, text: 'ainda aí?' });
    await waitFor(() => anaInbox.rejected.length === 1);
    expect(anaInbox.rejected[0]?.reason).toBe('Seu amigo não está online.');
  });
});
