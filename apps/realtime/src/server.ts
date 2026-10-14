import type { HealthResponse } from '@3dx/contracts';
import { createEndpoint, createRouter, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

const health = createEndpoint('/health', { method: 'GET' }, (): Promise<HealthResponse> =>
  Promise.resolve({ status: 'ok', service: 'realtime' }),
);

/** Servidor Colyseus sem salas ainda (Fase 2). Expõe só `GET /health` além do matchmaking padrão. */
export function createRealtimeServer() {
  return defineServer({
    rooms: {},
    routes: createRouter({ health }, { openapi: { disabled: true } }),
    transport: new WebSocketTransport(),
    greet: false,
  });
}
