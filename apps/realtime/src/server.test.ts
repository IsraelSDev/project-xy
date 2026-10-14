import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTicketIssuer } from '../test/tickets.ts';
import { createRealtimeServer } from './server.ts';

describe('servidor realtime', () => {
  const server = createRealtimeServer({
    reconnectSeconds: 1,
    ticketGraceSeconds: 30,
    ticketPublicKey: createTicketIssuer().publicKeyBase64,
  });
  let baseUrl = '';

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const { port } = server.transport.server?.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  it('GET /health responde ok', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'realtime' });
  });

  it('rota desconhecida responde 404', async () => {
    const response = await fetch(`${baseUrl}/nao-existe`);

    expect(response.status).toBe(404);
  });
});

describe('GET /metrics', () => {
  const server = createRealtimeServer(
    {
      reconnectSeconds: 1,
      ticketGraceSeconds: 30,
      ticketPublicKey: createTicketIssuer().publicKeyBase64,
    },
    { metricsToken: 'token-de-teste-123' },
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

  it('sem o token responde 404 (não revela que existe)', async () => {
    expect((await fetch(`${baseUrl}/metrics`)).status).toBe(404);
    const wrong = await fetch(`${baseUrl}/metrics`, { headers: { authorization: 'Bearer x' } });
    expect(wrong.status).toBe(404);
  });

  it('com o token devolve processo e salas', async () => {
    const response = await fetch(`${baseUrl}/metrics`, {
      headers: { authorization: 'Bearer token-de-teste-123' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      service: 'realtime',
      memory: { rssMb: expect.any(Number) as number },
      rooms: { total: expect.any(Number) as number, clients: expect.any(Number) as number },
    });
  });
});
