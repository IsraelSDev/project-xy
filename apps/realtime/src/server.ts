import { timingSafeEqual } from 'node:crypto';
import {
  LOUNGE_ROOM,
  NOTIFY_HEADER,
  ROOM_SCENES,
  type HealthResponse,
  type RoomScene,
  type RoomSummary,
  type UserNotifyKind,
} from '@3dx/contracts';
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
    .map((room): RoomSummary => {
      const meta = room.metadata as { title?: unknown; scene?: unknown } | undefined;
      return {
        roomId: room.roomId,
        title: typeof meta?.title === 'string' ? meta.title : DEFAULT_ROOM_TITLE,
        privacy: room.private ? 'private' : 'public',
        scene:
          typeof meta?.scene === 'string' && ROOM_SCENES.includes(meta.scene as RoomScene)
            ? (meta.scene as RoomScene)
            : 'lounge',
        clients: room.clients,
        maxClients: room.maxClients,
      };
    })
    .sort((a, b) => b.clients - a.clients);
});

export interface RealtimeServerOptions {
  /** Token de `GET /metrics`; sem ele, o endpoint responde 404. */
  metricsToken?: string;
  /**
   * Segredo compartilhado da rota interna `POST /notify` (chamada pela API). Sem ele, a rota
   * responde 404 e nada é avisado por push — o cliente volta a depender do polling.
   */
  notifySecret?: string;
  /**
   * Origens do navegador aceitas no CORS. Sem a lista, vale o padrão do Colyseus (reflete qualquer
   * origem). A entrada exige ticket de qualquer forma; a lista só impede outros sites de usarem o
   * servidor pelo navegador de quem os visita.
   */
  allowedOrigins?: string[];
}

/** Compara o segredo da rota interna em tempo constante. */
function isNotifyAuthorized(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Publica o aviso nos canais de presença dos usuários. Qualquer sala local serve de ponte: o canal
 * de presença vale para o processo todo, então a sala onde o usuário está recebe e entrega. Sem
 * sala local (ninguém conectado neste processo), não há a quem avisar.
 */
async function notifyUsers(users: string[], kind: UserNotifyKind): Promise<void> {
  const listed = await matchMaker.query({ name: LOUNGE_ROOM });
  for (const room of listed) {
    const local = matchMaker.getLocalRoomById(room.roomId) as LoungeRoom | undefined;
    if (local) {
      local.notifyUsers(users, kind);
      return;
    }
  }
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
  _rawOptions: RealtimeServerOptions = {},
) {
  const { metricsToken, notifySecret, allowedOrigins } = _rawOptions;
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

  // Rota interna (API -> realtime): avisa usuários que os dados deles mudaram em outro serviço.
  const notify = createEndpoint(
    '/notify',
    { method: 'POST', requireHeaders: true },
    async (ctx) => {
      if (!notifySecret || !isNotifyAuthorized(ctx.headers.get(NOTIFY_HEADER), notifySecret)) {
        return new Response(null, { status: 404 });
      }
      const body = ctx.body as { users?: unknown; kind?: unknown } | undefined;
      const { users, kind } = body ?? {};
      if (
        !Array.isArray(users) ||
        users.length === 0 ||
        users.length > 2048 ||
        !users.every((userId) => typeof userId === 'string') ||
        (kind !== 'friends' && kind !== 'queue')
      ) {
        return new Response(null, { status: 400 });
      }
      await notifyUsers(users, kind);
      return new Response(null, { status: 204 });
    },
  );

  return defineServer({
    rooms: { [LOUNGE_ROOM]: defineRoom(LoungeRoom, roomOptions) },
    routes: createRouter({ health, rooms, metrics, notify }, { openapi: { disabled: true } }),
    transport: new WebSocketTransport(),
    greet: false,
  });
}
