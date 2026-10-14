/**
 * Bot de teste manual: entra na sala e anda em quadrado por `--seconds` (padrão 20), dizendo
 * "oi" no chat ao entrar. Sem `--email`, cria uma conta de bot na API local a cada execução.
 *
 * Uso: node scripts/bot.ts [--seconds N] [--email E --password S]
 *      [--web http://localhost:5173]   (a API e o realtime são acessados pelo proxy do Vite)
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  CHAT_MESSAGE,
  LOUNGE_ROOM,
  LoungeState,
  MOVE_MESSAGE,
  PROTOCOL_VERSION,
  type RealtimeTicketResponse,
} from '@3dx/contracts';
import { Client } from '@colyseus/sdk';

const { values } = parseArgs({
  options: {
    seconds: { type: 'string', default: '20' },
    web: { type: 'string', default: 'http://localhost:5173' },
    email: { type: 'string' },
    password: { type: 'string' },
  },
});
const seconds = Number(values.seconds);
const api = `${values.web}/api`;

async function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
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
const { ticket } = (await (
  await post('/auth/realtime-ticket', {}, cookie)
).json()) as RealtimeTicketResponse;

const room = await new Client(`${values.web}/realtime`).joinOrCreate<LoungeState>(
  LOUNGE_ROOM,
  { protocol: PROTOCOL_VERSION, ticket },
  LoungeState,
);
room.onMessage('*', () => undefined);
console.log(`bot ${room.sessionId} na sala ${room.roomId}`);
room.send(CHAT_MESSAGE, { text: 'oi! sou um bot de teste.' });

const directions = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
];
let step = 0;
const timer = setInterval(() => {
  room.send(MOVE_MESSAGE, directions[step++ % directions.length]);
  const me = room.state.players.get(room.sessionId);
  console.log(
    `posição (${me?.x.toFixed(2)}, ${me?.z.toFixed(2)}) · ${room.state.players.size} na sala`,
  );
}, 1000);

setTimeout(() => {
  clearInterval(timer);
  void room.leave().then(() => process.exit(0));
}, seconds * 1000);
