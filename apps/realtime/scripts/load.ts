/**
 * Teste de carga local do realtime. Assina os tickets com a chave do .env (faz o papel da API, sem
 * criar contas), abre `--clients` conexões (padrão 48 = 3 salas cheias) e mede a latência de
 * comando: tempo entre enviar um movimento e receber o patch em que o próprio jogador já virou.
 * Amostra GET /metrics a cada 2 s (CPU, memória, atraso do event loop). Só para ambiente local.
 *
 * Uso: node --env-file=../../.env scripts/load.ts [--clients N] [--seconds N] [--url http://127.0.0.1:2567]
 */
import { createPrivateKey, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  DEFAULT_AVATAR,
  LOUNGE_ROOM,
  LoungeState,
  MOVE_MESSAGE,
  PROTOCOL_VERSION,
  REFRESH_TICKET_MESSAGE,
  TICKET_REFRESH_INTERVAL_MS,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
} from '@3dx/contracts';
import { Client, type Room } from '@colyseus/sdk';
import { SignJWT } from 'jose';

const { values } = parseArgs({
  options: {
    clients: { type: 'string', default: '48' },
    seconds: { type: 'string', default: '30' },
    url: { type: 'string', default: `http://127.0.0.1:${process.env.REALTIME_PORT ?? '2567'}` },
  },
});
const clients = Math.min(Math.max(Number(values.clients) || 1, 1), 500);
const seconds = Math.max(Number(values.seconds) || 30, 5);
const privateKeyBase64 = process.env.REALTIME_TICKET_PRIVATE_KEY;
if (!privateKeyBase64) {
  console.error('REALTIME_TICKET_PRIVATE_KEY ausente (pnpm env:setup e rode com --env-file).');
  process.exit(1);
}
const privateKey = createPrivateKey({
  key: Buffer.from(privateKeyBase64, 'base64'),
  format: 'der',
  type: 'pkcs8',
});

const issueTicket = (index: number, userId: string) =>
  new SignJWT({ name: `Carga ${index + 1}`, blocked: [], avatar: DEFAULT_AVATAR, mutedUntil: null })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(userId)
    .setIssuer(TICKET_ISSUER)
    .setAudience(TICKET_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(privateKey);

const latencies: number[] = [];
let timeouts = 0;
let joinFailures = 0;
const rooms = new Set<string>();
const metrics: { cpuPercent: number; rssMb: number; p99Ms: number }[] = [];
const deadline = Date.now() + seconds * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Envia uma direção oposta à atual e espera o patch em que o heading mudou. */
function probe(room: Room<unknown, LoungeState>): Promise<number | undefined> {
  const me = room.state.players.get(room.sessionId);
  if (!me) return Promise.resolve(undefined);
  const before = me.heading;
  const direction = { x: -Math.sin(before), z: -Math.cos(before) };
  return new Promise((resolve) => {
    const sentAt = performance.now();
    const finish = (latency: number | undefined) => {
      clearTimeout(timer);
      room.onStateChange.remove(onChange);
      resolve(latency);
    };
    const onChange = () => {
      const player = room.state.players.get(room.sessionId);
      if (player && player.heading !== before) finish(performance.now() - sentAt);
    };
    const timer = setTimeout(() => finish(undefined), 2000);
    room.onStateChange(onChange);
    room.send(MOVE_MESSAGE, direction);
  });
}

async function runClient(index: number): Promise<void> {
  let room: Room<unknown, LoungeState>;
  const userId = randomUUID();
  try {
    const client = new Client(values.url);
    room = await client.joinOrCreate<LoungeState>(
      LOUNGE_ROOM,
      { protocol: PROTOCOL_VERSION, ticket: await issueTicket(index, userId) },
      LoungeState,
    );
  } catch (error) {
    joinFailures++;
    console.error(`cliente ${index + 1}: falhou ao entrar (${String(error)})`);
    return;
  }
  rooms.add(room.roomId);
  room.onMessage('*', () => undefined);
  // O primeiro estado chega depois do join: sem ele não há heading para comparar.
  for (let wait = 0; wait < 40 && !room.state.players?.get(room.sessionId); wait++) await sleep(50);

  let refreshedAt = Date.now();
  while (Date.now() < deadline) {
    // Como o navegador: sem ticket novo, o realtime tira a sessão da sala.
    if (Date.now() - refreshedAt > TICKET_REFRESH_INTERVAL_MS) {
      room.send(REFRESH_TICKET_MESSAGE, { ticket: await issueTicket(index, userId) });
      refreshedAt = Date.now();
    }
    const latency = await probe(room);
    if (latency === undefined) timeouts++;
    else latencies.push(latency);
    room.send(MOVE_MESSAGE, { x: 0, z: 0 });
    await sleep(300 + Math.random() * 400);
  }
  await Promise.race([room.leave(), sleep(1000)]);
}

async function sampleMetrics(): Promise<void> {
  const token = process.env.METRICS_TOKEN;
  if (!token) return;
  while (Date.now() < deadline) {
    await sleep(2000);
    try {
      const response = await fetch(`${values.url}/metrics`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) continue;
      const sample = (await response.json()) as {
        cpuPercent: number;
        memory: { rssMb: number };
        eventLoopDelay: { p99Ms: number };
      };
      metrics.push({
        cpuPercent: sample.cpuPercent,
        rssMb: sample.memory.rssMb,
        p99Ms: sample.eventLoopDelay.p99Ms,
      });
    } catch {
      // Servidor ocupado ou fora do ar: a amostra perdida aparece na contagem final.
    }
  }
}

const percentile = (sorted: number[], p: number) =>
  sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
const fixed = (value: number) => value.toFixed(1);

console.log(`Carga: ${clients} clientes por ${seconds}s em ${values.url}`);
// Entradas escalonadas (20 ms) para não medir só o pico de conexões simultâneas.
const work = Array.from({ length: clients }, (_, index) =>
  sleep(index * 20).then(() => runClient(index)),
);
await Promise.all([...work, sampleMetrics()]);

const sorted = latencies.toSorted((a, b) => a - b);
console.log(`Salas: ${rooms.size}; falhas ao entrar: ${joinFailures}`);
console.log(
  `Latência de comando (ms): p50 ${fixed(percentile(sorted, 0.5))}, p95 ${fixed(percentile(sorted, 0.95))}, ` +
    `p99 ${fixed(percentile(sorted, 0.99))}, máx ${fixed(sorted.at(-1) ?? NaN)} ` +
    `(${sorted.length} amostras, ${timeouts} sem resposta em 2 s)`,
);
if (metrics.length > 0) {
  const max = (pick: (m: (typeof metrics)[number]) => number) => Math.max(...metrics.map(pick));
  console.log(
    `Servidor (máx em ${metrics.length} amostras): CPU ${fixed(max((m) => m.cpuPercent))}%, ` +
      `RSS ${fixed(max((m) => m.rssMb))} MB, atraso do event loop p99 ${fixed(max((m) => m.p99Ms))} ms`,
  );
} else {
  console.log('Sem métricas do servidor (defina METRICS_TOKEN no .env e reinicie o realtime).');
}
process.exit(joinFailures > 0 || timeouts > sorted.length / 100 ? 1 : 0);
