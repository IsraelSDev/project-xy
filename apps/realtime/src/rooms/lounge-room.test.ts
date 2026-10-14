import type { AddressInfo } from 'node:net';
import { LOUNGE_ROOM, LoungeState, MOVE_MESSAGE, PROTOCOL_VERSION } from '@3dx/contracts';
import { DEFAULT_MOVEMENT, length } from '@3dx/game-core';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRealtimeServer } from '../server.ts';

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
  const server = createRealtimeServer({ reconnectSeconds: RECONNECT_SECONDS });
  let client: Client;
  const joined: LoungeRoom[] = [];

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

  const join = async (): Promise<LoungeRoom> => {
    const room = await client.joinOrCreate<LoungeState>(
      LOUNGE_ROOM,
      { protocol: PROTOCOL_VERSION },
      LoungeState,
    );
    // Os testes de queda controlam a reconexão manualmente.
    room.reconnection.enabled = false;
    joined.push(room);
    await waitFor(() => room.state.players.has(room.sessionId));
    return room;
  };

  /** Como `observer` enxerga o jogador `target` (estado replicado pelo servidor). */
  const seen = (observer: LoungeRoom, target: LoungeRoom) =>
    observer.state.players.get(target.sessionId);

  it('recusa cliente com versão de protocolo diferente', async () => {
    await expect(
      client.joinOrCreate<LoungeState>(
        LOUNGE_ROOM,
        { protocol: PROTOCOL_VERSION + 1 },
        LoungeState,
      ),
    ).rejects.toThrow(/incompatível/);
  });

  it('dois jogadores se veem, em pontos de entrada diferentes', async () => {
    const a = await join();
    const b = await join();

    await waitFor(() => a.state.players.size === 2 && b.state.players.size === 2);
    const pa = seen(b, a);
    const pb = seen(a, b);
    expect(pa?.name).toMatch(/^Visitante /);
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
