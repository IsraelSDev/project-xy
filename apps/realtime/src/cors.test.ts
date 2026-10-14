import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTicketIssuer } from '../test/tickets.ts';
import { createRealtimeServer } from './server.ts';

// Arquivo próprio: a regra de CORS altera o matchmaker, que é global no processo.
describe('CORS com lista de origens', () => {
  const allowed = 'http://localhost:5173';
  const server = createRealtimeServer(
    {
      reconnectSeconds: 1,
      ticketGraceSeconds: 30,
      ticketPublicKey: createTicketIssuer().publicKeyBase64,
    },
    { allowedOrigins: [allowed, 'https://app.example.test'] },
  );
  let baseUrl = '';

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const { port } = server.transport.server?.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  const allowOrigin = async (path: string, origin: string, method = 'GET') =>
    (await fetch(`${baseUrl}${path}`, { method, headers: { origin } })).headers.get(
      'access-control-allow-origin',
    );

  it('libera as origens da lista', async () => {
    expect(await allowOrigin('/rooms', 'https://app.example.test')).toBe(
      'https://app.example.test',
    );
    expect(await allowOrigin('/matchmake/joinOrCreate/lounge', allowed, 'OPTIONS')).toBe(allowed);
  });

  it('não libera outra origem', async () => {
    expect(await allowOrigin('/rooms', 'https://evil.example')).toBe(allowed);
    expect(
      await allowOrigin('/matchmake/joinOrCreate/lounge', 'https://evil.example', 'OPTIONS'),
    ).toBe(allowed);
  });
});
