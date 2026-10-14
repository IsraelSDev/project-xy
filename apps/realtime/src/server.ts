import { LOUNGE_ROOM, type HealthResponse } from '@3dx/contracts';
import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { LoungeRoom, type LoungeRoomOptions } from './rooms/lounge-room.ts';

const health = createEndpoint('/health', { method: 'GET' }, (): Promise<HealthResponse> =>
  Promise.resolve({ status: 'ok', service: 'realtime' }),
);

/**
 * Servidor Colyseus com a sala do lounge e `GET /health`.
 * As opções da sala definidas aqui prevalecem sobre as enviadas pelo cliente ao criar a sala.
 */
export function createRealtimeServer(roomOptions: LoungeRoomOptions) {
  return defineServer({
    rooms: { [LOUNGE_ROOM]: defineRoom(LoungeRoom, roomOptions) },
    routes: createRouter({ health }, { openapi: { disabled: true } }),
    transport: new WebSocketTransport(),
    greet: false,
  });
}
