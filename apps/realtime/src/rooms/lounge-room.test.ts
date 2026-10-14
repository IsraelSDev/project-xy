import type { AddressInfo } from 'node:net';
import {
  CHAT_EVENT,
  CHAT_MESSAGE,
  CHAT_REJECTED_EVENT,
  LOUNGE_ROOM,
  LoungeState,
  MOVE_MESSAGE,
  PROTOCOL_VERSION,
  REFRESH_TICKET_MESSAGE,
  type ChatEvent,
  type ChatRejectedEvent,
} from '@3dx/contracts';
import { DEFAULT_MOVEMENT, length } from '@3dx/game-core';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTicketIssuer, type TicketUser } from '../../test/tickets.ts';
import { createRealtimeServer } from '../server.ts';
import { CHAT_BURST } from './lounge-room.ts';

type LoungeRoom = Room<unknown, LoungeState>;

/** Curto para o teste de queda não esperar os 20 s de produção. */
const RECONNECT_SECONDS = 0.5;

/** Espera até `predicate` ser verdadeiro, consultando a cada 20 ms. */
async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condição não atendida dentro do prazo');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('LoungeRoom', () => {
  const tickets = createTicketIssuer();
  const server = createRealtimeServer({
    reconnectSeconds: RECONNECT_SECONDS,
    ticketPublicKey: tickets.publicKeyBase64,
  });
  let client: Client;
  const joined: LoungeRoom[] = [];
  const chatOf = new Map<LoungeRoom, ChatEvent[]>();
  const rejectionsOf = new Map<LoungeRoom, ChatRejectedEvent[]>();

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const { port } = server.transport.server?.address() as AddressInfo;
    client = new Client(`http://127.0.0.1:${port}`);
  });

  afterEach(async () => {
    // `leave()` de uma conexão já derrubada não resolve; a limpeza não pode travar o teste.
    await Promise.all(
      joined
        .splice(0)
        .map((room) => Promise.race([room.leave().catch(() => undefined), sleep(300)])),
    );
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  const enter = (options: Record<string, unknown>) =>
    client.joinOrCreate<LoungeState>(LOUNGE_ROOM, options, LoungeState);

  const join = async (user: TicketUser = tickets.newUser()): Promise<LoungeRoom> => {
    const room = await enter({ protocol: PROTOCOL_VERSION, ticket: await tickets.issue(user) });
    // Os testes de queda controlam a reconexão manualmente.
    room.reconnection.enabled = false;
    const chat: ChatEvent[] = [];
    const rejections: ChatRejectedEvent[] = [];
    room.onMessage(CHAT_EVENT, (event: ChatEvent) => chat.push(event));
    room.onMessage(CHAT_REJECTED_EVENT, (event: ChatRejectedEvent) => rejections.push(event));
    chatOf.set(room, chat);
    rejectionsOf.set(room, rejections);
    joined.push(room);
    await waitFor(() => room.state.players.has(room.sessionId));
    return room;
  };

  /** Como `observer` enxerga o jogador `target` (estado replicado pelo servidor). */
  const seen = (observer: LoungeRoom, target: LoungeRoom) =>
    observer.state.players.get(target.sessionId);

  const textsSeenBy = (room: LoungeRoom) => (chatOf.get(room) ?? []).map((event) => event.text);

  describe('entrada', () => {
    it('recusa cliente com versão de protocolo diferente', async () => {
      const ticket = await tickets.issue(tickets.newUser());
      await expect(enter({ protocol: PROTOCOL_VERSION + 1, ticket })).rejects.toThrow(
        /incompatível/,
      );
    });

    it.each([
      ['sem ticket', () => Promise.resolve(undefined)],
      ['com ticket assinado por outra chave', () => tickets.forge(tickets.newUser())],
      ['com ticket expirado', () => tickets.expired(tickets.newUser())],
    ])('recusa entrada %s', async (_, makeTicket) => {
      const ticket = await makeTicket();
      await expect(
        enter({ protocol: PROTOCOL_VERSION, ...(ticket ? { ticket } : {}) }),
      ).rejects.toThrow();
    });

    it('nome e id vêm do ticket; o cliente não escolhe o próprio nome', async () => {
      const user = tickets.newUser();
      await expect(
        enter({ protocol: PROTOCOL_VERSION, ticket: await tickets.issue(user), name: 'Admin' }),
      ).rejects.toThrow();

      const a = await join(user);
      expect(seen(a, a)).toMatchObject({ userId: user.sub, name: user.name });
    });
  });

  describe('movimento e presença', () => {
    it('dois jogadores se veem, em pontos de entrada diferentes', async () => {
      const a = await join();
      const b = await join();

      await waitFor(() => a.state.players.size === 2 && b.state.players.size === 2);
      const pa = seen(b, a);
      const pb = seen(a, b);
      expect(
        length({ x: (pa?.x ?? 0) - (pb?.x ?? 0), z: (pa?.z ?? 0) - (pb?.z ?? 0) }),
      ).toBeGreaterThan(0.85);
    });

    it('o servidor calcula o movimento e replica para os outros, sem passar da velocidade', async () => {
      const a = await join();
      const b = await join();
      await waitFor(() => seen(b, a) !== undefined);
      const startZ = seen(b, a)?.z ?? 0;

      const startedAt = Date.now();
      a.send(MOVE_MESSAGE, { x: 0, z: 1 });
      await sleep(500);
      a.send(MOVE_MESSAGE, { x: 0, z: 0 });
      const elapsed = (Date.now() - startedAt) / 1000;
      await sleep(150);

      const moved = (seen(b, a)?.z ?? 0) - startZ;
      expect(moved).toBeGreaterThan(0.3);
      // Folga de um tick de simulação além do tempo medido.
      expect(moved).toBeLessThanOrEqual(DEFAULT_MOVEMENT.speed * (elapsed + 0.1));
    });

    it.each([
      ['posição enviada pelo cliente', MOVE_MESSAGE, { x: 0, z: 1, position: { x: 8, z: 6 } }],
      ['direção fora do intervalo', MOVE_MESSAGE, { x: 0, z: 50 }],
      ['tipo de mensagem desconhecido', 'teleport', { x: 8, z: 6 }],
    ])('rejeita %s: derruba a conexão e não move o avatar', async (_, type, payload) => {
      const a = await join();
      const b = await join();
      await waitFor(() => seen(b, a) !== undefined);
      const before = { x: seen(b, a)?.x, z: seen(b, a)?.z };

      a.send(type, payload);

      await waitFor(() => seen(b, a)?.connected === false);
      await sleep(150);
      expect({ x: seen(b, a)?.x, z: seen(b, a)?.z }).toEqual(before);
    });

    it('derruba quem envia mensagens demais por segundo', async () => {
      const a = await join();
      const b = await join();
      await waitFor(() => seen(b, a) !== undefined);

      for (let index = 0; index < 60; index++) a.send(MOVE_MESSAGE, { x: 0, z: 0 });

      await waitFor(() => seen(b, a)?.connected === false);
    });

    it('quem sai por vontade própria some da sala na hora', async () => {
      const a = await join();
      const b = await join();
      await waitFor(() => b.state.players.size === 2);

      await a.leave();

      await waitFor(() => b.state.players.size === 1, 1000);
    });

    it('queda sem reconexão: fica como desconectado e sai depois do prazo', async () => {
      const a = await join();
      const b = await join();
      await waitFor(() => seen(b, a) !== undefined);

      a.connection.close(1000);

      await waitFor(() => seen(b, a)?.connected === false);
      await waitFor(() => seen(b, a) === undefined, RECONNECT_SECONDS * 1000 + 2000);
    });

    it('queda com reconexão dentro do prazo: mesmo jogador volta a ficar conectado', async () => {
      const a = await join();
      const b = await join();
      await waitFor(() => seen(b, a) !== undefined);

      a.connection.close(1000);
      await waitFor(() => seen(b, a)?.connected === false);

      const back = await client.reconnect<LoungeState>(a.reconnectionToken, LoungeState);
      joined.push(back);

      expect(back.sessionId).toBe(a.sessionId);
      await waitFor(() => seen(b, a)?.connected === true);
    });
  });

  describe('chat', () => {
    it('entrega a todos, com nome e id do remetente vindos do ticket e texto limpo', async () => {
      const user = tickets.newUser();
      const a = await join(user);
      const b = await join();

      a.send(CHAT_MESSAGE, { text: '  olá​, sala!  ' });

      await waitFor(() => textsSeenBy(b).length === 1 && textsSeenBy(a).length === 1);
      expect(chatOf.get(b)?.[0]).toMatchObject({
        userId: user.sub,
        name: user.name,
        text: 'olá, sala!',
      });
    });

    it('limita a frequência: o excedente é recusado só para quem enviou', async () => {
      const a = await join();
      const b = await join();

      for (let index = 0; index <= CHAT_BURST; index++) {
        a.send(CHAT_MESSAGE, { text: `mensagem ${index}` });
      }

      await waitFor(() => (rejectionsOf.get(a)?.length ?? 0) === 1);
      await sleep(150);
      expect(textsSeenBy(b)).toHaveLength(CHAT_BURST);
    });

    it('mensagem longa demais derruba a conexão (cliente adulterado)', async () => {
      const a = await join();
      const b = await join();
      await waitFor(() => seen(b, a) !== undefined);

      a.send(CHAT_MESSAGE, { text: 'x'.repeat(1000) });

      await waitFor(() => seen(b, a)?.connected === false);
      expect(textsSeenBy(b)).toEqual([]);
    });

    it('bloqueio vale nos dois sentidos e só para o par envolvido', async () => {
      const blockerUser = tickets.newUser();
      const blockedUser = tickets.newUser();
      const blocker = await join({ ...blockerUser, blocked: [blockedUser.sub] });
      const blocked = await join(blockedUser);
      const bystander = await join();

      blocked.send(CHAT_MESSAGE, { text: 'do bloqueado' });
      blocker.send(CHAT_MESSAGE, { text: 'de quem bloqueou' });

      await waitFor(() => textsSeenBy(bystander).length === 2);
      await sleep(150);
      expect(textsSeenBy(blocker)).toEqual(['de quem bloqueou']);
      expect(textsSeenBy(blocked)).toEqual(['do bloqueado']);
    });

    it('bloqueio feito durante a sessão passa a valer com o ticket novo', async () => {
      const userA = tickets.newUser();
      const userB = tickets.newUser();
      const a = await join(userA);
      const b = await join(userB);

      a.send(REFRESH_TICKET_MESSAGE, {
        ticket: await tickets.issue({ ...userA, blocked: [userB.sub] }),
      });
      await sleep(100);
      b.send(CHAT_MESSAGE, { text: 'depois do bloqueio' });

      await waitFor(() => textsSeenBy(b).length === 1);
      await sleep(150);
      expect(textsSeenBy(a)).toEqual([]);
    });

    it('ignora ticket de outro usuário no refresh (não troca a identidade)', async () => {
      const userA = tickets.newUser();
      const a = await join(userA);
      const c = await join();

      a.send(REFRESH_TICKET_MESSAGE, { ticket: await tickets.issue(tickets.newUser()) });
      await sleep(100);
      c.send(CHAT_MESSAGE, { text: 'oi' });

      await waitFor(() => textsSeenBy(a).length === 1);
      expect(seen(c, a)?.name).toBe(userA.name);
    });
  });
});
