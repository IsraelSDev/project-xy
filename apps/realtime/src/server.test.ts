import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealtimeServer } from './server.js';

describe('servidor realtime', () => {
  const server = createRealtimeServer();
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
