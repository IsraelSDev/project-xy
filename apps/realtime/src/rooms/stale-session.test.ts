import type { AddressInfo } from 'node:net';
import { LOUNGE_ROOM, LoungeState, PROTOCOL_VERSION } from '@3dx/contracts';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTicketIssuer } from '../../test/tickets.ts';
import { createRealtimeServer } from '../server.ts';

// Arquivo próprio: precisa de um prazo de reconexão longo para provar que a saída é imediata.
describe('sessão antiga da mesma conta', () => {
  const tickets = createTicketIssuer();
  const server = createRealtimeServer({
    reconnectSeconds: 10,
    ticketGraceSeconds: 30,
    ticketPublicKey: tickets.publicKeyBase64,
  });
  let client: Client;

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const { port } = server.transport.server?.address() as AddressInfo;
    client = new Client(`http://127.0.0.1:${port}`);
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  const join = async (user: ReturnType<typeof tickets.newUser>) => {
    const room: Room<unknown, LoungeState> = await client.joinOrCreate<LoungeState>(
      LOUNGE_ROOM,
      { protocol: PROTOCOL_VERSION, ticket: await tickets.issue(user) },
      LoungeState,
    );
    room.reconnection.enabled = false;
    return room;
  };

  const waitFor = async (predicate: () => boolean, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('condição não atendida dentro do prazo');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };

  it('ao entrar de novo, a sessão que caiu sai na hora em vez de esperar o prazo', async () => {
    const user = tickets.newUser();
    const observer = await join(tickets.newUser());
    const first = await join(user);
    await waitFor(() => observer.state.players.has(first.sessionId));

    first.connection.close(1000);
    await waitFor(() => observer.state.players.get(first.sessionId)?.connected === false);

    const second = await join(user);

    await waitFor(() => !observer.state.players.has(first.sessionId), 1000);
    expect(observer.state.players.get(second.sessionId)?.userId).toBe(user.sub);

    await Promise.all([second.leave(), observer.leave()]);
  });
});
