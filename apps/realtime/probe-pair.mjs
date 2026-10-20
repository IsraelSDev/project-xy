import { readFileSync } from 'node:fs';
import { createPrivateKey, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { Client } from '@colyseus/sdk';
import {
  DEFAULT_AVATAR,
  LOUNGE_ROOM,
  LoungeState,
  PROTOCOL_VERSION,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
} from '@3dx/contracts';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const privateKey = createPrivateKey({
  key: Buffer.from(env.REALTIME_TICKET_PRIVATE_KEY, 'base64'),
  format: 'der',
  type: 'pkcs8',
});

const sign = (name, model) =>
  new SignJWT({
    name,
    role: 'USER',
    ageAssurance: 'SELF_DECLARED',
    blocked: [],
    avatar: { ...DEFAULT_AVATAR, model },
    mutedUntil: null,
    friends: [],
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(randomUUID())
    .setIssuer(TICKET_ISSUER)
    .setAudience(TICKET_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .sign(privateKey);

const roomId = process.argv[2];
if (!roomId) throw new Error('usage: probe-pair.mjs <roomId>');

const client = new Client('ws://localhost:2567');
const room = await client.joinById(
  roomId,
  { protocol: PROTOCOL_VERSION, ticket: await sign('debug-probe', '3dx-male') },
  LoungeState,
);
console.log('joined', room.roomId, room.sessionId);

let latest;
room.onStateChange((state) => {
  latest = state;
});

await new Promise((resolve) => setTimeout(resolve, 800));

const players = [...(latest?.players ?? new Map()).entries()];
console.log(
  JSON.stringify(
    players.map(([sessionId, player]) => ({
      sessionId,
      userId: player.userId,
      name: player.name,
      avatar: player.avatar,
      x: player.x,
      z: player.z,
      heading: player.heading,
      action: player.action,
    })),
    null,
    2,
  ),
);
for (let i = 0; i < players.length; i++) {
  for (let j = i + 1; j < players.length; j++) {
    const a = players[i][1];
    const b = players[j][1];
    console.log(
      'distance',
      players[i][0],
      players[j][0],
      Math.hypot(a.x - b.x, a.z - b.z).toFixed(4),
    );
  }
}

await room.leave();
