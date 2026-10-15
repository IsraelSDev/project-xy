/**
 * Bot de teste manual: entra na sala e anda em quadrado por `--seconds` (padrão 20), dizendo
 * "oi" no chat ao entrar. Sem `--email`, cria uma conta de bot na API local a cada execução.
 * `--count N` (até 15) abre N sessões da mesma conta, cada uma com um avatar diferente:
 * serve para medir desempenho com a sala cheia.
 *
 * `--room ID [--roomPassword SENHA]` entra numa sala específica (ex.: privada, com senha).
 *
 * Uso: node scripts/bot.ts [--seconds N] [--count N] [--room ID --roomPassword S]
 *      [--email E --password S]   (a API e o realtime são acessados pelo proxy do Vite)
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  CHAT_MESSAGE,
  LOUNGE_ROOM,
  LoungeState,
  MOVE_MESSAGE,
  PROTOCOL_VERSION,
  REFRESH_TICKET_MESSAGE,
  TICKET_REFRESH_INTERVAL_MS,
  ACCESSORIES,
  BOTTOMS,
  DEFAULT_AVATAR,
  HAIR_STYLES,
  PALETTE,
  TOPS,
  type RealtimeTicketResponse,
} from '@3dx/contracts';
import { Client, type Room } from '@colyseus/sdk';

const { values } = parseArgs({
  options: {
    seconds: { type: 'string', default: '20' },
    count: { type: 'string', default: '1' },
    room: { type: 'string' },
    roomPassword: { type: 'string' },
    web: { type: 'string', default: 'http://localhost:5173' },
    email: { type: 'string' },
    password: { type: 'string' },
  },
});
const seconds = Number(values.seconds);
const count = Math.min(Math.max(Number(values.count) || 1, 1), 15);
const api = `${values.web}/api`;

async function post(
  path: string,
  body: unknown,
  cookie?: string,
  method = 'POST',
): Promise<Response> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
  return response;
}

const tag = randomUUID().slice(0, 6);
const session = values.email
  ? await post('/auth/login', { email: values.email, password: values.password })
  : await post('/auth/register', {
      email: `bot-${tag}@example.test`,
      password: randomUUID(),
      displayName: `Bot ${tag}`,
      birthDate: '1990-01-01',
    });
const cookie = session.headers.getSetCookie()[0]?.split(';')[0] ?? '';
const pick = <T>(items: readonly T[], index: number): T => items[index % items.length] as T;
const directions = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
];

/**
 * Ticket com o avatar desta sessão. O avatar vai no ticket e a conta é uma só: salva o avatar
 * desta sessão logo antes de pedir o ticket (por isso as chamadas são sequenciais).
 */
async function ticketFor(index: number): Promise<string> {
  await post(
    '/avatar',
    {
      ...DEFAULT_AVATAR,
      hair: pick(HAIR_STYLES, index + 1).id,
      top: pick(TOPS, index).id,
      topColor: pick(PALETTE, index * 3).id,
      bottom: pick(BOTTOMS, index).id,
      bottomColor: pick(PALETTE, index * 7 + 2).id,
      accessory: pick(ACCESSORIES, index).id,
    },
    cookie,
    'PUT',
  );
  const response = await post('/auth/realtime-ticket', {}, cookie);
  return ((await response.json()) as RealtimeTicketResponse).ticket;
}

const rooms: Room<unknown, LoungeState>[] = [];

for (let index = 0; index < count; index++) {
  const ticket = await ticketFor(index);
  const client = new Client(`${values.web}/realtime`);
  const options = { protocol: PROTOCOL_VERSION, ticket };
  const room = values.room
    ? await client.joinById<LoungeState>(
        values.room,
        { ...options, ...(values.roomPassword ? { password: values.roomPassword } : {}) },
        LoungeState,
      )
    : await client.joinOrCreate<LoungeState>(LOUNGE_ROOM, options, LoungeState);
  rooms.push(room);
  room.onMessage('*', () => undefined);
  console.log(`bot ${index + 1}/${count}: ${room.sessionId} na sala ${room.roomId}`);
  if (index === 0) room.send(CHAT_MESSAGE, { text: 'oi! sou um bot de teste.' });

  let step = index;
  const timer = setInterval(() => {
    room.send(MOVE_MESSAGE, directions[step++ % directions.length]);
  }, 1000);
  setTimeout(() => {
    clearInterval(timer);
    void room.leave();
  }, seconds * 1000);
}

// Sem ticket novo, o realtime tira a sessão da sala quando o ticket vence. Cada renovação gasta
// um ticket e um avatar salvo, limitados a 30 por minuto: com muitas sessões, renova mais devagar.
const refresh = setInterval(
  () => {
    void (async () => {
      for (const [index, room] of rooms.entries()) {
        room.send(REFRESH_TICKET_MESSAGE, { ticket: await ticketFor(index) });
      }
    })().catch((error: unknown) => console.error(`falha ao renovar ticket: ${String(error)}`));
  },
  Math.max(TICKET_REFRESH_INTERVAL_MS, count * 2500),
);

setTimeout(
  () => {
    clearInterval(refresh);
    process.exit(0);
  },
  seconds * 1000 + 1000,
);
