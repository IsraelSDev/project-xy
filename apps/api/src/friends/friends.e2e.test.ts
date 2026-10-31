import { randomUUID } from 'node:crypto';
import type {
  AccountExport,
  FriendEntry,
  FriendSuggestion,
  ProfileActivityItem,
} from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PASSWORD, type TestApp, type TestUser } from '../../test/test-app.js';

describe('amigos', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const request = (from: TestUser, to: string) =>
    t.request('/friends/requests', { cookie: from.cookie, json: { userId: to } });
  const accept = (by: TestUser, requester: TestUser) =>
    t.request(`/friends/${requester.id}/accept`, { cookie: by.cookie, method: 'POST' });
  const remove = (by: TestUser, other: TestUser) =>
    t.request(`/friends/${other.id}`, { cookie: by.cookie, method: 'DELETE' });
  const list = async (user: TestUser) =>
    (await (await t.request('/friends', { cookie: user.cookie })).json()) as FriendEntry[];
  const statusOf = async (user: TestUser, other: TestUser) =>
    (await list(user)).find((entry) => entry.user.id === other.id)?.status;

  it('pede, só quem recebeu aceita, e os dois veem a amizade', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();

    const sent = await request(ana, bia.id);
    expect(sent.status).toBe(201);
    expect(await sent.json()).toEqual({ status: 'OUTGOING' });
    expect((await request(ana, bia.id)).status).toBe(409);
    expect(await statusOf(ana, bia)).toBe('OUTGOING');
    expect(await statusOf(bia, ana)).toBe('INCOMING');

    // Quem pediu não aceita o próprio pedido.
    expect((await accept(ana, bia)).status).toBe(404);
    expect((await accept(bia, ana)).status).toBe(204);
    expect(await statusOf(ana, bia)).toBe('FRIEND');
    expect(await statusOf(bia, ana)).toBe('FRIEND');
    expect((await request(bia, ana.id)).status).toBe(409);

    // Desfazer some dos dois lados.
    expect((await remove(bia, ana)).status).toBe(204);
    expect(await statusOf(ana, bia)).toBeUndefined();
  });

  it('amizade aceita entra no feed dos dois perfis (sem o nome)', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    await request(ana, bia.id);
    await accept(bia, ana);

    const events = await t.prisma.profileEvent.findMany({
      where: { userId: { in: [ana.id, bia.id] }, kind: 'FRIEND' },
      select: { userId: true },
    });
    expect(events.map((event) => event.userId).sort()).toEqual([ana.id, bia.id].sort());

    // O feed do perfil mostra o fato; o vínculo com a outra pessoa não fica no evento.
    const feed = (await (
      await t.request(`/profiles/${bia.id}/activity`, { cookie: ana.cookie })
    ).json()) as ProfileActivityItem[];
    expect(feed.map((item) => item.kind)).toContain('FRIEND');
  });

  it('sugere amigos em comum e some ao pedir ou bloquear', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    const caio = await t.createUser();
    const dudu = await t.createUser();
    const befriend = async (one: TestUser, other: TestUser) => {
      await request(one, other.id);
      await accept(other, one);
    };
    await befriend(ana, bia);
    await befriend(ana, caio);
    await befriend(ana, dudu);

    const suggestions = async (user: TestUser) =>
      (await (
        await t.request('/friends/suggestions', { cookie: user.cookie })
      ).json()) as FriendSuggestion[];

    const forBia = await suggestions(bia);
    expect(forBia.find((idea) => idea.user.id === caio.id)?.mutualFriends).toBe(1);
    expect(forBia.map((idea) => idea.user.id)).not.toContain(ana.id);

    // Pedido já tira da sugestão (qualquer vínculo conta).
    await request(bia, caio.id);
    expect((await suggestions(bia)).map((idea) => idea.user.id)).not.toContain(caio.id);

    // Bloqueio nos dois sentidos também.
    await t.request('/blocks', { cookie: bia.cookie, json: { userId: dudu.id } });
    expect((await suggestions(bia)).map((idea) => idea.user.id)).not.toContain(dudu.id);

    expect((await t.request('/friends/suggestions')).status).toBe(401);
  });

  it('pedido de volta vira amizade na hora; recusar apaga o pedido', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    await request(ana, bia.id);
    const back = await request(bia, ana.id);
    expect(await back.json()).toEqual({ status: 'FRIEND' });
    expect(await statusOf(ana, bia)).toBe('FRIEND');

    const caio = await t.createUser();
    await request(caio, ana.id);
    expect((await remove(ana, caio)).status).toBe(204);
    expect(await statusOf(caio, ana)).toBeUndefined();
  });

  it('bloqueio desfaz a amizade e impede pedidos nos dois sentidos', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    await request(ana, bia.id);
    await accept(bia, ana);

    await t.request('/blocks', { cookie: bia.cookie, json: { userId: ana.id } });
    expect(await statusOf(ana, bia)).toBeUndefined();
    expect((await request(ana, bia.id)).status).toBe(403);
    expect((await request(bia, ana.id)).status).toBe(403);
  });

  it('o ticket do realtime leva só os amigos com amizade aceita', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    const caio = await t.createUser();
    await request(ana, bia.id);
    await accept(bia, ana);
    await request(ana, caio.id);

    const { ticket } = (await (
      await t.request('/auth/realtime-ticket', { cookie: ana.cookie, json: {} })
    ).json()) as { ticket: string };
    const { friends } = JSON.parse(
      Buffer.from(ticket.split('.')[1] ?? '', 'base64url').toString(),
    ) as { friends: string[] };
    expect(friends).toEqual([bia.id]);
  });

  it('recusa a si mesmo, conta inexistente e conta excluída', async () => {
    const ana = await t.createUser();
    expect((await request(ana, ana.id)).status).toBe(400);
    expect((await request(ana, randomUUID())).status).toBe(404);

    const gone = await t.createUser();
    await t.request('/account/delete', { cookie: gone.cookie, json: { password: PASSWORD } });
    expect((await request(ana, gone.id)).status).toBe(404);
  });

  it('exclusão de conta apaga amizades e a exportação lista as amizades', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    await request(ana, bia.id);
    await accept(bia, ana);

    const data = (await (
      await t.request('/account/export', { cookie: ana.cookie })
    ).json()) as AccountExport;
    expect(data.friends.map((entry) => [entry.user.id, entry.status])).toEqual([
      [bia.id, 'FRIEND'],
    ]);

    await t.request('/account/delete', { cookie: bia.cookie, json: { password: PASSWORD } });
    expect(await list(ana)).toEqual([]);
  });
});
