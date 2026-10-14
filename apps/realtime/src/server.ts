import { LOUNGE_ROOM, type HealthResponse, type RoomSummary } from '@3dx/contracts';
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_ROOM_TITLE, LoungeRoom, type LoungeRoomOptions } from './rooms/lounge-room.ts';

const health = createEndpoint('/health', { method: 'GET' }, (): Promise<HealthResponse> =>
  Promise.resolve({ status: 'ok', service: 'realtime' }),
);

/** Salas públicas (privadas nunca aparecem: só entra quem tem o id e o convite). */
const rooms = createEndpoint('/rooms', { method: 'GET' }, async (): Promise<RoomSummary[]> => {
  const listed = await matchMaker.query({ name: LOUNGE_ROOM, private: false });
  return listed
    .filter((room) => !room.unlisted)
    .map((room) => ({
      roomId: room.roomId,
      title:
        typeof (room.metadata as { title?: unknown } | undefined)?.title === 'string'
          ? (room.metadata as { title: string }).title
          : DEFAULT_ROOM_TITLE,
      clients: room.clients,
      maxClients: room.maxClients,
    }))
    .sort((a, b) => b.clients - a.clients);
});

/**
 * Servidor Colyseus com a sala do lounge, `GET /health` e `GET /rooms`.
 * As opções da sala definidas aqui prevalecem sobre as enviadas pelo cliente ao criar a sala.
 */
export function createRealtimeServer(roomOptions: LoungeRoomOptions) {
  return defineServer({
    rooms: { [LOUNGE_ROOM]: defineRoom(LoungeRoom, roomOptions) },
    routes: createRouter({ health, rooms }, { openapi: { disabled: true } }),
    transport: new WebSocketTransport(),
    greet: false,
  });
}
