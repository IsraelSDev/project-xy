import type { AddressInfo } from 'node:net';
import {
  ACTION_MESSAGE,
  CHANGE_PASSWORD_MESSAGE,
  INVITE_MESSAGE,
  INVITE_REJECTED_EVENT,
  INVITED_EVENT,
  INTERACTION_REQUEST_MESSAGE,
  INTERACTION_RESPONSE_MESSAGE,
  INTERACTION_STARTED_EVENT,
  LOUNGE_ROOM,
  LoungeState,
  MOVE_MESSAGE,
  PROTOCOL_VERSION,
  WAVE_DURATION_MS,
  type InviteRejectedEvent,
  type InvitedEvent,
  type RoomSummary,
} from '@3dx/contracts';
import { HOME } from '@3dx/game-core';
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
    ticketGraceSeconds: 30,
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
  const createRoom = async (
    user: TicketUser,
    privacy: 'public' | 'private',
    title: string,
    password?: string,
    scene?: 'club' | 'home' | 'lounge' | 'beach' | 'private-room',
  ) => {
    const options = {
      ...(await base(user)),
      privacy,
      title,
      ...(scene ? { scene } : {}),
      ...(password ? { password } : {}),
    };
    const room = client.create<LoungeState>(LOUNGE_ROOM, options, LoungeState);
    return room;
  };
  const listRooms = async () => (await (await fetch(`${baseUrl}/rooms`)).json()) as RoomSummary[];

  describe('salas', () => {
    it('sala pública criada com título aparece na lista', async () => {
      const room = await track(createRoom(tickets.newUser(), 'public', 'Pista de dança'));

      const list = await listRooms();

      expect(list).toContainEqual(
        expect.objectContaining({
          roomId: room.roomId,
          title: 'Pista de dança',
          privacy: 'public',
          clients: 1,
        }),
      );
      expect(room.state.privacy).toBe('public');
    });

    it('sala privada sem senha é o quarto do dono e aparece com ownerId', async () => {
      const owner = tickets.newUser();
      const room = await track(createRoom(owner, 'private', 'Meu quarto', undefined, 'home'));

      expect(room.state.ownerId).toBe(owner.sub);
      expect(await listRooms()).toContainEqual(
        expect.objectContaining({
          roomId: room.roomId,
          privacy: 'private',
          ownerId: owner.sub,
          scene: 'home',
        }),
      );
    });

    it('sala privada aparece (com senha), exige a senha e não cai no joinOrCreate', async () => {
      const owner = tickets.newUser();
      const room = await track(createRoom(owner, 'private', 'Só amigos', 'segredo'));

      expect(room.state.ownerId).toBe(owner.sub);
      expect(await listRooms()).toContainEqual(
        expect.objectContaining({
          roomId: room.roomId,
          privacy: 'private',
          ownerId: owner.sub,
        }),
      );

      const joinWith = async (password?: string) =>
        client.joinById<LoungeState>(
          room.roomId,
          { ...(await base(tickets.newUser())), ...(password ? { password } : {}) },
          LoungeState,
        );

      await expect(joinWith()).rejects.toThrow(/Senha/);
      await expect(joinWith('errada')).rejects.toThrow(/Senha/);
      const guest = await track(joinWith('segredo'));
      expect(guest.roomId).toBe(room.roomId);

      // Fora do joinOrCreate: quem entra sem pedir a sala vai para uma sala pública.
      const stranger = await track(
        client.joinOrCreate<LoungeState>(LOUNGE_ROOM, await base(tickets.newUser()), LoungeState),
      );
      expect(stranger.roomId).not.toBe(room.roomId);
    });

    it('dono troca a senha; a antiga deixa de valer e a nova passa a valer', async () => {
      const room = await track(createRoom(tickets.newUser(), 'private', 'Só amigos', 'antiga'));
      const joinWith = async (password: string) =>
        client.joinById<LoungeState>(
          room.roomId,
          { ...(await base(tickets.newUser())), password },
          LoungeState,
        );

      await track(joinWith('antiga'));

      room.send(CHANGE_PASSWORD_MESSAGE, { password: 'nova' });
      await sleep(150);

      await expect(joinWith('antiga')).rejects.toThrow(/Senha/);
      const guest = await track(joinWith('nova'));
      expect(guest.roomId).toBe(room.roomId);
    });

    it('dono convida um amigo online e ele entra sem senha', async () => {
      const friend = tickets.newUser();
      const owner = { ...tickets.newUser(), friends: [friend.sub] };
      const friendRoom = await track(
        client.joinOrCreate<LoungeState>(LOUNGE_ROOM, await base(friend), LoungeState),
      );
      const room = await track(createRoom(owner, 'private', 'Só amigos', 'segredo'));

      let invited: InvitedEvent | undefined;
      friendRoom.onMessage(INVITED_EVENT, (event: InvitedEvent) => (invited = event));

      room.send(INVITE_MESSAGE, { to: friend.sub });
      await waitFor(() => invited !== undefined);
      expect(invited).toMatchObject({ roomId: room.roomId, title: 'Só amigos' });

      // O convite basta: o amigo entra sem senha.
      const guest = await track(
        client.joinById<LoungeState>(room.roomId, await base(friend), LoungeState),
      );
      expect(guest.roomId).toBe(room.roomId);
    });

    it('convite vale uma entrada só: depois só com a senha', async () => {
      const friend = tickets.newUser();
      const owner = { ...tickets.newUser(), friends: [friend.sub] };
      const friendRoom = await track(
        client.joinOrCreate<LoungeState>(LOUNGE_ROOM, await base(friend), LoungeState),
      );
      const room = await track(createRoom(owner, 'private', 'Só amigos', 'segredo'));

      let invited = false;
      friendRoom.onMessage(INVITED_EVENT, () => (invited = true));
      room.send(INVITE_MESSAGE, { to: friend.sub });
      await waitFor(() => invited);

      // Primeira entrada usa o convite (sem senha)…
      const guest = await track(
        client.joinById<LoungeState>(room.roomId, await base(friend), LoungeState),
      );
      expect(guest.roomId).toBe(room.roomId);
      await guest.leave();
      await sleep(150);

      // …e o convite acabou: de novo, sem a senha não entra.
      await expect(
        client.joinById<LoungeState>(room.roomId, await base(friend), LoungeState),
      ).rejects.toThrow(/Senha/);

      const again = await track(
        client.joinById<LoungeState>(
          room.roomId,
          { ...(await base(friend)), password: 'segredo' },
          LoungeState,
        ),
      );
      expect(again.roomId).toBe(room.roomId);
    });

    it('trocar a senha invalida convites pendentes', async () => {
      const friend = tickets.newUser();
      const owner = { ...tickets.newUser(), friends: [friend.sub] };
      const friendRoom = await track(
        client.joinOrCreate<LoungeState>(LOUNGE_ROOM, await base(friend), LoungeState),
      );
      const room = await track(createRoom(owner, 'private', 'Só amigos', 'segredo'));

      let invited = false;
      friendRoom.onMessage(INVITED_EVENT, () => (invited = true));
      room.send(INVITE_MESSAGE, { to: friend.sub });
      await waitFor(() => invited);

      room.send(CHANGE_PASSWORD_MESSAGE, { password: 'nova' });
      await sleep(150);

      // O convite pendente caiu junto com a troca: sem a senha nova, não entra.
      await expect(
        client.joinById<LoungeState>(room.roomId, await base(friend), LoungeState),
      ).rejects.toThrow(/Senha/);

      const guest = await track(
        client.joinById<LoungeState>(
          room.roomId,
          { ...(await base(friend)), password: 'nova' },
          LoungeState,
        ),
      );
      expect(guest.roomId).toBe(room.roomId);
    });

    it('convite só vale para amigo: estranho é recusado', async () => {
      const owner = tickets.newUser();
      const stranger = tickets.newUser();
      const room = await track(createRoom(owner, 'private', 'Só amigos', 'segredo'));

      let reason = '';
      room.onMessage(
        INVITE_REJECTED_EVENT,
        (event: InviteRejectedEvent) => (reason = event.reason),
      );

      room.send(INVITE_MESSAGE, { to: stranger.sub });
      await waitFor(() => reason !== '');
      expect(reason).toMatch(/amigos/);
    });

    it('bloqueio entre dono e visitante impede a entrada, mesmo com senha certa', async () => {
      const blocked = tickets.newUser();
      const owner = { ...tickets.newUser(), blocked: [blocked.sub] };
      const room = await track(createRoom(owner, 'private', 'Sem você', 'segredo'));

      await expect(
        client.joinById<LoungeState>(
          room.roomId,
          { ...(await base(blocked)), password: 'segredo' },
          LoungeState,
        ),
      ).rejects.toThrow(/não pode entrar/);
    });
  });

  describe('interações', () => {
    const me = (room: LoungeRoom) => room.state.players.get(room.sessionId);

    /** Caminha do spawn até a frente do sofá do quarto padrão. */
    const walkToSofa = async (room: LoungeRoom) => {
      room.send(MOVE_MESSAGE, { x: 0, z: -1 });
      await waitFor(() => (me(room)?.z ?? 0) <= 0.4, 5000);
      room.send(MOVE_MESSAGE, { x: 1, z: 0 });
      await waitFor(() => (me(room)?.x ?? 0) >= 1.1, 3000);
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
      // O cenário padrão agora é a balada; este teste usa os assentos do quarto.
      const room = await track(createRoom(tickets.newUser(), 'public', 'Sofá', undefined, 'home'));
      await walkToSofa(room);

      room.send(ACTION_MESSAGE, { type: 'sit' });
      await waitFor(() => me(room)?.action === 'sit');
      const seated = HOME.seats.find(
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

    it('pose dura como a dança e troca de pose direto', async () => {
      const room = await track(createRoom(tickets.newUser(), 'public', 'Poses'));

      room.send(ACTION_MESSAGE, { type: 'pose01' });
      await waitFor(() => me(room)?.action === 'pose01');
      await sleep(WAVE_DURATION_MS + 200);
      expect(me(room)?.action).toBe('pose01');

      room.send(ACTION_MESSAGE, { type: 'pair01' });
      await waitFor(() => me(room)?.action === 'pair01');

      room.send(ACTION_MESSAGE, { type: 'stand' });
      await waitFor(() => me(room)?.action === '');
    }, 15_000);

    it('interação a dois fixa os dois na âncora, troca as poses e encerra no stand', async () => {
      const actor = tickets.newUser();
      const partner = tickets.newUser();
      const roomA = await track(createRoom(actor, 'public', 'Dupla'));
      const roomB = await track(
        client.joinById<LoungeState>(roomA.roomId, await base(partner), LoungeState),
      );

      let started = false;
      roomB.onMessage(INTERACTION_STARTED_EVENT, () => (started = true));

      roomA.send(INTERACTION_REQUEST_MESSAGE, { to: partner.sub, type: 'hug' });
      roomB.send(INTERACTION_RESPONSE_MESSAGE, { from: actor.sub, accept: true });
      await waitFor(() => started && me(roomA)?.action === 'pair01');

      // Os dois recebem o par nativo e ficam a 0,25 m um do outro (a colocação autoral).
      expect(me(roomB)?.action).toBe('pair01');
      const gap = Math.hypot(
        (me(roomA)?.x ?? 0) - (me(roomB)?.x ?? 0),
        (me(roomA)?.z ?? 0) - (me(roomB)?.z ?? 0),
      );
      expect(gap).toBeCloseTo(0.25, 2);

      // Andar é ignorado (presa na âncora) e outro gesto não quebra a pose do par.
      const beforeX = me(roomA)?.x ?? 0;
      const beforeZ = me(roomA)?.z ?? 0;
      roomA.send(MOVE_MESSAGE, { x: 1, z: 0 });
      roomA.send(ACTION_MESSAGE, { type: 'dance' });
      await sleep(250);
      expect(me(roomA)?.x).toBeCloseTo(beforeX);
      expect(me(roomA)?.z).toBeCloseTo(beforeZ);
      expect(me(roomA)?.action).toBe('pair01');

      // Qualquer lado encerra com "levantar": os dois voltam ao normal.
      roomB.send(ACTION_MESSAGE, { type: 'stand' });
      await waitFor(() => me(roomA)?.action === '' && me(roomB)?.action === '');
    }, 15_000);

    it('abraço usa o clipe nativo pair01 nos dois lados', async () => {
      const actor = tickets.newUser();
      const partner = tickets.newUser();
      const roomA = await track(createRoom(actor, 'public', 'Abraço 3DX'));
      const roomB = await track(
        client.joinById<LoungeState>(roomA.roomId, await base(partner), LoungeState),
      );

      let started = false;
      roomB.onMessage(INTERACTION_STARTED_EVENT, () => (started = true));

      roomA.send(INTERACTION_REQUEST_MESSAGE, { to: partner.sub, type: 'hug' });
      roomB.send(INTERACTION_RESPONSE_MESSAGE, { from: actor.sub, accept: true });
      await waitFor(() => started && me(roomA)?.action === 'pair01');

      expect(me(roomB)?.action).toBe('pair01');
      const gap = Math.hypot(
        (me(roomA)?.x ?? 0) - (me(roomB)?.x ?? 0),
        (me(roomA)?.z ?? 0) - (me(roomB)?.z ?? 0),
      );
      expect(gap).toBeCloseTo(0.25, 2);
      const turn = Math.abs((me(roomA)?.heading ?? 0) - (me(roomB)?.heading ?? 0)) % (Math.PI * 2);
      expect(Math.min(turn, Math.PI * 2 - turn)).toBeCloseTo(Math.PI, 3);
    }, 15_000);

    it('cada nova interação toca o clipe de par próprio nos dois lados', async () => {
      const cases = [
        ['slow-dance-2', 'pair04'],
        ['slow-dance-behind', 'pair06'],
        ['kiss', 'pair07'],
        ['kiss-neck', 'pair08'],
        ['slow-dance-invert', 'pair09'],
      ] as const;

      for (const [type, action] of cases) {
        const actor = tickets.newUser();
        const partner = tickets.newUser();
        const roomA = await track(createRoom(actor, 'public', `Par ${action}`));
        const roomB = await track(
          client.joinById<LoungeState>(roomA.roomId, await base(partner), LoungeState),
        );

        roomA.send(INTERACTION_REQUEST_MESSAGE, { to: partner.sub, type });
        roomB.send(INTERACTION_RESPONSE_MESSAGE, { from: actor.sub, accept: true });
        await waitFor(() => me(roomA)?.action === action);
        expect(me(roomB)?.action).toBe(action);

        roomA.send(ACTION_MESSAGE, { type: 'stand' });
        await waitFor(() => me(roomA)?.action === '');
      }
    }, 45_000);
  });
});
