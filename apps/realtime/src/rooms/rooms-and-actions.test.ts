import type { AddressInfo } from 'node:net';
import {
  ACTION_MESSAGE,
  INVITE_EVENT,
  LOUNGE_ROOM,
  LoungeState,
  MOVE_MESSAGE,
  PROTOCOL_VERSION,
  ROTATE_INVITE_MESSAGE,
  WAVE_DURATION_MS,
  type InviteEvent,
  type RoomSummary,
} from '@3dx/contracts';
import { SEATS } from '@3dx/game-core';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTicketIssuer, type TicketUser } from '../../test/tickets.ts';
import { createRealtimeServer } from '../server.ts';

type LoungeRoom = Room<unknown, LoungeState>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condição não atendida dentro do prazo');
    await sleep(20);
  }
}

describe('salas e interações', () => {
  const tickets = createTicketIssuer();
  const server = createRealtimeServer({
    reconnectSeconds: 1,
    ticketPublicKey: tickets.publicKeyBase64,
  });
  let client: Client;
  let baseUrl = '';
  const opened: LoungeRoom[] = [];

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const { port } = server.transport.server?.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    client = new Client(baseUrl);
  });

  afterEach(async () => {
    await Promise.all(
      opened
        .splice(0)
        .map((room) => Promise.race([room.leave().catch(() => undefined), sleep(300)])),
    );
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  const track = async (room: Promise<LoungeRoom>) => {
    const joined = await room;
    joined.reconnection.enabled = false;
    opened.push(joined);
    await waitFor(() => joined.state.players.has(joined.sessionId));
    return joined;
  };
  const base = async (user: TicketUser) => ({
    protocol: PROTOCOL_VERSION,
    ticket: await tickets.issue(user),
  });
  const createRoom = async (user: TicketUser, privacy: 'public' | 'private', title: string) => {
    const options = { ...(await base(user)), privacy, title };
    const room = client.create<LoungeState>(LOUNGE_ROOM, options, LoungeState);
    return room;
  };
  const listRooms = async () => (await (await fetch(`${baseUrl}/rooms`)).json()) as RoomSummary[];

  describe('salas', () => {
    it('sala pública criada com título aparece na lista', async () => {
      const room = await track(createRoom(tickets.newUser(), 'public', 'Pista de dança'));

      const list = await listRooms();

      expect(list).toContainEqual(
        expect.objectContaining({ roomId: room.roomId, title: 'Pista de dança', clients: 1 }),
      );
      expect(room.state.privacy).toBe('public');
    });

    it('sala privada: dono recebe o convite; ela não é listada nem cai no joinOrCreate', async () => {
      const owner = tickets.newUser();
      const pending = createRoom(owner, 'private', 'Só amigos');
      let invite = '';
      const room = await pending;
      room.onMessage(INVITE_EVENT, (event: InviteEvent) => (invite = event.code));
      await track(Promise.resolve(room));
      await waitFor(() => invite !== '');

      expect(room.state.ownerId).toBe(owner.sub);
      expect((await listRooms()).map((summary) => summary.roomId)).not.toContain(room.roomId);

      const stranger = await track(
        client.joinOrCreate<LoungeState>(LOUNGE_ROOM, await base(tickets.newUser()), LoungeState),
      );
      expect(stranger.roomId).not.toBe(room.roomId);
    });

    it('sala privada exige o convite atual; só o dono troca, e o antigo deixa de valer', async () => {
      const owner = tickets.newUser();
      const room = await createRoom(owner, 'private', 'Só amigos');
      let invite = '';
      room.onMessage(INVITE_EVENT, (event: InviteEvent) => (invite = event.code));
      await track(Promise.resolve(room));
      await waitFor(() => invite !== '');
      const joinWith = async (user: TicketUser, code?: string) =>
        client.joinById<LoungeState>(
          room.roomId,
          { ...(await base(user)), ...(code ? { invite: code } : {}) },
          LoungeState,
        );

      await expect(joinWith(tickets.newUser())).rejects.toThrow(/Convite/);
      const guest = await track(joinWith(tickets.newUser(), invite));
      expect(guest.roomId).toBe(room.roomId);

      // Convidado tentando trocar o convite: ignorado.
      const before = invite;
      guest.send(ROTATE_INVITE_MESSAGE);
      await sleep(150);
      room.send(ROTATE_INVITE_MESSAGE);
      await waitFor(() => invite !== before);

      await expect(joinWith(tickets.newUser(), before)).rejects.toThrow(/Convite/);
      await track(joinWith(tickets.newUser(), invite));
    });

    it('bloqueio entre dono e visitante impede a entrada, mesmo com convite', async () => {
      const blocked = tickets.newUser();
      const owner = { ...tickets.newUser(), blocked: [blocked.sub] };
      const room = await createRoom(owner, 'private', 'Sem você');
      let invite = '';
      room.onMessage(INVITE_EVENT, (event: InviteEvent) => (invite = event.code));
      await track(Promise.resolve(room));
      await waitFor(() => invite !== '');

      await expect(
        client.joinById<LoungeState>(
          room.roomId,
          { ...(await base(blocked)), invite },
          LoungeState,
        ),
      ).rejects.toThrow(/não pode entrar/);
    });
  });

  describe('interações', () => {
    const me = (room: LoungeRoom) => room.state.players.get(room.sessionId);

    /** Caminha do spawn até a frente do sofá sul (leste pelo corredor, depois norte). */
    const walkToSofa = async (room: LoungeRoom) => {
      room.send(MOVE_MESSAGE, { x: 1, z: 0 });
      await waitFor(() => (me(room)?.x ?? 0) >= 4.0, 4000);
      room.send(MOVE_MESSAGE, { x: 0, z: 1 });
      await sleep(900);
      room.send(MOVE_MESSAGE, { x: 0, z: 0 });
      await sleep(100);
    };

    it('longe de qualquer assento, pedir para sentar não faz nada', async () => {
      const room = await track(createRoom(tickets.newUser(), 'public', 'Teste sentar'));
      room.send(ACTION_MESSAGE, { type: 'sit' });
      await sleep(200);
      expect(me(room)?.action).toBe('');
    });

    it('senta no assento livre mais próximo e levanta ao andar', async () => {
      const room = await track(createRoom(tickets.newUser(), 'public', 'Sofá'));
      await walkToSofa(room);

      room.send(ACTION_MESSAGE, { type: 'sit' });
      await waitFor(() => me(room)?.action === 'sit');
      const seated = SEATS.find(
        (seat) =>
          Math.abs(seat.position.x - (me(room)?.x ?? 0)) < 1e-3 &&
          Math.abs(seat.position.z - (me(room)?.z ?? 0)) < 1e-3,
      );
      expect(seated).toBeDefined();

      // Gesto sentado é ignorado; andar levanta.
      room.send(ACTION_MESSAGE, { type: 'wave' });
      await sleep(150);
      expect(me(room)?.action).toBe('sit');
      room.send(MOVE_MESSAGE, { x: 0, z: -1 });
      await waitFor(() => me(room)?.action === '');
      room.send(MOVE_MESSAGE, { x: 0, z: 0 });
    });

    it('aceno acaba sozinho; dança dura até andar', async () => {
      const room = await track(createRoom(tickets.newUser(), 'public', 'Gestos'));

      room.send(ACTION_MESSAGE, { type: 'wave' });
      await waitFor(() => me(room)?.action === 'wave');
      await waitFor(() => me(room)?.action === '', WAVE_DURATION_MS + 1000);

      room.send(ACTION_MESSAGE, { type: 'dance' });
      await waitFor(() => me(room)?.action === 'dance');
      await sleep(WAVE_DURATION_MS + 200);
      expect(me(room)?.action).toBe('dance');
      room.send(MOVE_MESSAGE, { x: 1, z: 0 });
      await waitFor(() => me(room)?.action === '');
    }, 15_000);
  });
});
