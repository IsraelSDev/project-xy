import type { AddressInfo } from 'node:net';
import {
  LOUNGE_ROOM,
  LoungeState,
  PROTOCOL_VERSION,
  USER_NOTIFY,
  type UserNotifyEvent,
} from '@3dx/contracts';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTicketIssuer } from '../../test/tickets.ts';
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

async function enter(client: Client, ticket: string): Promise<LoungeRoom> {
  const room = await client.create<LoungeState>(
    LOUNGE_ROOM,
    { protocol: PROTOCOL_VERSION, ticket },
    LoungeState,
  );
  room.reconnection.enabled = false;
  await waitFor(() => room.state.players.has(room.sessionId));
  return room;
}

describe('avisos por push (POST /notify)', () => {
  const tickets = createTicketIssuer();
  const user = tickets.newUser();
  const roomOptions = {
    reconnectSeconds: 1,
    ticketGraceSeconds: 30,
    ticketPublicKey: tickets.publicKeyBase64,
  };
  const serverOptions = { notifySecret: 'segredo-teste' };
  const server = createRealtimeServer(roomOptions, serverOptions);
  let baseUrl = '';

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const { port } = server.transport.server?.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  it('entrega o evento ao usuário conectado quando o segredo bate', async () => {
    const client = new Client(baseUrl);
    const joined = await enter(client, await tickets.issue(user));
    const recebido = new Promise<UserNotifyEvent>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('não recebeu o aviso a tempo')), 3000);
      joined.onMessage(USER_NOTIFY, (event: UserNotifyEvent) => {
        clearTimeout(timer);
        resolve(event);
      });
    });

    const resposta = await fetch(`${baseUrl}/notify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-notify-secret': 'segredo-teste',
      },
      body: JSON.stringify({ users: [user.sub], kind: 'friends' }),
    });
    expect(resposta.status).toBe(204);
    const evento = await recebido;
    expect(evento.kind).toBe('friends');
    await joined.leave().catch(() => undefined);
  });

  it('recusa sem segredo e com segredo errado', async () => {
    const client = new Client(baseUrl);
    const joined = await enter(client, await tickets.issue(user));

    const sem = await fetch(`${baseUrl}/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ users: [user.sub], kind: 'friends' }),
    });
    expect(sem.status).toBe(404);

    const errado = await fetch(`${baseUrl}/notify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-notify-secret': 'outro',
      },
      body: JSON.stringify({ users: [user.sub], kind: 'friends' }),
    });
    expect(errado.status).toBe(404);

    // nenhum aviso é entregue
    const recebido = new Promise<unknown>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), 1000);
      joined.onMessage(USER_NOTIFY, () => {
        clearTimeout(timer);
        resolve('entregou');
      });
    });
    expect(await recebido).toBeUndefined();
    await joined.leave().catch(() => undefined);
  });
});
