/**
 * Bot de teste manual: entra na sala e anda em quadrado por `--seconds` (padrão 20).
 * Uso: node scripts/bot.ts [url] [--seconds N]   (url padrão: http://localhost:5173/realtime)
 */
import { parseArgs } from 'node:util';
import { LOUNGE_ROOM, LoungeState, MOVE_MESSAGE, PROTOCOL_VERSION } from '@3dx/contracts';
import { Client } from '@colyseus/sdk';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { seconds: { type: 'string', default: '20' } },
});
const url = positionals[0] ?? 'http://localhost:5173/realtime';
const seconds = Number(values.seconds);

const room = await new Client(url).joinOrCreate<LoungeState>(
  LOUNGE_ROOM,
  { protocol: PROTOCOL_VERSION },
  LoungeState,
);
console.log(`bot ${room.sessionId} na sala ${room.roomId}`);

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
