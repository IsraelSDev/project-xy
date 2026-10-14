/**
 * Bot de teste manual: entra na sala e anda em quadrado por `--seconds` (padrão 20), dizendo
 * "oi" no chat ao entrar. Sem `--email`, cria uma conta de bot na API local a cada execução.
 * `--count N` (até 15) abre N sessões da mesma conta, cada uma com um avatar diferente:
 * serve para medir desempenho com a sala cheia.
 *
 * Uso: node scripts/bot.ts [--seconds N] [--count N] [--email E --password S]
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
  ACCESSORIES,
  BOTTOMS,
  DEFAULT_AVATAR,
  HAIR_STYLES,
  PALETTE,
  TOPS,
  type RealtimeTicketResponse,
} from '@3dx/contracts';
import { Client } from '@colyseus/sdk';

const { values } = parseArgs({
  options: {
    seconds: { type: 'string', default: '20' },
    count: { type: 'string', default: '1' },
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

for (let index = 0; index < count; index++) {
  // O avatar vai no ticket: salva um diferente antes de pedir cada ticket.
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
  const { ticket } = (await (
    await post('/auth/realtime-ticket', {}, cookie)
  ).json()) as RealtimeTicketResponse;
  const room = await new Client(`${values.web}/realtime`).joinOrCreate<LoungeState>(
    LOUNGE_ROOM,
    { protocol: PROTOCOL_VERSION, ticket },
    LoungeState,
  );
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

setTimeout(() => process.exit(0), seconds * 1000 + 1000);
