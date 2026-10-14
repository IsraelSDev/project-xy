import type { AddressInfo } from 'node:net';
import {
  CHAT_EVENT,
  CHAT_MESSAGE,
  CHAT_REJECTED_EVENT,
  LOUNGE_ROOM,
  LoungeState,
  PROTOCOL_VERSION,
  REFRESH_TICKET_MESSAGE,
  type ChatEvent,
  type ChatRejectedEvent,
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

/** Sanções chegam pelo ticket: silenciamento nas claims, suspensão pela falta de ticket novo. */
describe('sanções na sala', () => {
  const tickets = createTicketIssuer();
  // Sem folga: o ticket vencido tira a pessoa da sala na conferência seguinte (1 s).
  const server = createRealtimeServer({
    reconnectSeconds: 1,
    ticketGraceSeconds: 0,
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

  /** Entra numa sala nova (só desta pessoa e de quem vier com `roomId`). */
  const join = async (user: TicketUser, roomId?: string, seconds = 60) => {
    const options = { protocol: PROTOCOL_VERSION, ticket: await tickets.issue(user, seconds) };
    const room = roomId
      ? await client.joinById<LoungeState>(roomId, options, LoungeState)
      : await client.create<LoungeState>(LOUNGE_ROOM, options, LoungeState);
    room.reconnection.enabled = false;
    opened.push(room);
    await waitFor(() => room.state.players.has(room.sessionId));
    return room;
  };

  it('silenciado não fala no chat até receber ticket sem silenciamento', async () => {
    const mutedUntil = Date.now() + 60_000;
    const muted = { ...tickets.newUser(), mutedUntil };
    const muteRoom = await join(muted);
    const listener = await join(tickets.newUser(), muteRoom.roomId);

    const heard: ChatEvent[] = [];
    listener.onMessage(CHAT_EVENT, (event: ChatEvent) => heard.push(event));
    const rejections: ChatRejectedEvent[] = [];
    muteRoom.onMessage(CHAT_REJECTED_EVENT, (event: ChatRejectedEvent) => rejections.push(event));
    muteRoom.onMessage(CHAT_EVENT, () => undefined);

    muteRoom.send(CHAT_MESSAGE, { text: 'ninguém me ouve' });
    await waitFor(() => rejections.length === 1);
    expect(rejections[0]).toEqual({
      reason: 'Você foi silenciado pela moderação.',
      until: mutedUntil,
    });
    await sleep(200);
    expect(heard).toEqual([]);

    // Sanção revogada: o próximo ticket vem sem `mutedUntil`.
    const unmuted: TicketUser = { sub: muted.sub, name: muted.name };
    muteRoom.send(REFRESH_TICKET_MESSAGE, { ticket: await tickets.issue(unmuted) });
    await sleep(200);
    muteRoom.send(CHAT_MESSAGE, { text: 'voltei' });
    await waitFor(() => heard.length === 1);
    expect(heard[0]?.text).toBe('voltei');
  });

  it('ticket vencido sem renovação tira da sala; renovado, a pessoa fica', async () => {
    const lapsed = await join(tickets.newUser(), undefined, 2);
    const renewedUser = tickets.newUser();
    const renewed = await join(renewedUser, lapsed.roomId, 2);
    renewed.send(REFRESH_TICKET_MESSAGE, { ticket: await tickets.issue(renewedUser) });

    let leftWith: number | undefined;
    lapsed.onLeave((code) => {
      leftWith = code;
    });
    await waitFor(() => leftWith !== undefined, 5000);
    // CONSENTED: sem reserva de vaga para reconexão (que não passaria pelo ticket).
    expect(leftWith).toBe(4000);

    await waitFor(() => renewed.state.players.size === 1);
    expect(renewed.state.players.has(renewed.sessionId)).toBe(true);
  });
});
