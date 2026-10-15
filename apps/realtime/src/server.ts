import { LOUNGE_ROOM, type HealthResponse, type RoomSummary } from '@3dx/contracts';
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { createProcessMetrics, isMetricsAuthorized } from '@3dx/observability';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_ROOM_TITLE, LoungeRoom, type LoungeRoomOptions } from './rooms/lounge-room.ts';

const health = createEndpoint('/health', { method: 'GET' }, (): Promise<HealthResponse> =>
  Promise.resolve({ status: 'ok', service: 'realtime' }),
);

/** Salas abertas: as privadas aparecem na lista (com senha), mas não caem no joinOrCreate. */
const rooms = createEndpoint('/rooms', { method: 'GET' }, async (): Promise<RoomSummary[]> => {
  const listed = await matchMaker.query({ name: LOUNGE_ROOM });
  return listed
    .filter((room) => !room.unlisted)
    .map((room): RoomSummary => ({
      roomId: room.roomId,
      title:
        typeof (room.metadata as { title?: unknown } | undefined)?.title === 'string'
          ? (room.metadata as { title: string }).title
          : DEFAULT_ROOM_TITLE,
      privacy: room.private ? 'private' : 'public',
      clients: room.clients,
      maxClients: room.maxClients,
    }))
    .sort((a, b) => b.clients - a.clients);
});

export interface RealtimeServerOptions {
  /** Token de `GET /metrics`; sem ele, o endpoint responde 404. */
  metricsToken?: string;
  /**
   * Origens do navegador aceitas no CORS. Sem a lista, vale o padrão do Colyseus (reflete qualquer
   * origem). A entrada exige ticket de qualquer forma; a lista só impede outros sites de usarem o
   * servidor pelo navegador de quem os visita.
   */
  allowedOrigins?: string[];
}

/** O matchmaker é global no processo: a regra de CORS vale para todas as rotas HTTP do Colyseus. */
function restrictCors(allowedOrigins: string[]): void {
  const allowed = new Set(allowedOrigins);
  const fallback = allowedOrigins[0] ?? 'null';
  matchMaker.controller.getCorsHeaders = (headers: Headers) => {
    const origin = headers.get('origin');
    return {
      // Origem fora da lista recebe outra origem permitida: o navegador bloqueia a resposta.
      'Access-Control-Allow-Origin': origin && allowed.has(origin) ? origin : fallback,
      Vary: 'Origin',
    };
  };
}

/**
 * Servidor Colyseus com a sala do lounge, `GET /health`, `GET /rooms` e `GET /metrics`.
 * As opções da sala definidas aqui prevalecem sobre as enviadas pelo cliente ao criar a sala.
 */
export function createRealtimeServer(
  roomOptions: LoungeRoomOptions,
  { metricsToken, allowedOrigins }: RealtimeServerOptions = {},
) {
  if (allowedOrigins) restrictCors(allowedOrigins);
  const sample = createProcessMetrics('realtime');
  const metrics = createEndpoint(
    '/metrics',
    { method: 'GET', requireHeaders: true },
    async (ctx) => {
      if (!isMetricsAuthorized(ctx.headers.get('authorization'), metricsToken)) {
        return new Response(null, { status: 404 });
      }
      const all = await matchMaker.query({ name: LOUNGE_ROOM });
      return {
        ...sample(),
        rooms: {
          total: all.length,
          private: all.filter((room) => room.private).length,
          clients: all.reduce((total, room) => total + room.clients, 0),
        },
      };
    },
  );

  return defineServer({
    rooms: { [LOUNGE_ROOM]: defineRoom(LoungeRoom, roomOptions) },
    routes: createRouter({ health, rooms, metrics }, { openapi: { disabled: true } }),
    transport: new WebSocketTransport(),
    greet: false,
  });
}
