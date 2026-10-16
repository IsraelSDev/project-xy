import { randomUUID } from 'node:crypto';
import {
  conversationKey,
  type ConversationMessage,
  type ConversationSummary,
} from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, unique, type TestApp, type TestUser } from '../../test/test-app.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('condição não atendida dentro do prazo');
    await sleep(25);
  }
}

describe('leitura das conversas pela administração', () => {
  let t: TestApp;
  let admin: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.createUser('ADMIN');
  });

  afterAll(async () => {
    await t.close();
  });

  const seedDirect = (a: string, b: string, text: string, sentAt = new Date()) =>
    t.prisma.messageLog.create({
      data: {
        id: randomUUID(),
        kind: 'DIRECT',
        senderId: a,
        recipientId: b,
        conversationKey: conversationKey(a, b),
        text,
        sentAt,
      },
    });

  const seedRoom = (roomId: string, roomTitle: string, senderId: string, text: string) =>
    t.prisma.messageLog.create({
      data: {
        id: randomUUID(),
        kind: 'ROOM',
        roomId,
        roomTitle,
        senderId,
        text,
        sentAt: new Date(),
      },
    });

  it('lista e lê uma conversa privada, com os nomes resolvidos', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    await seedDirect(ana.id, bia.id, 'primeira');
    await seedDirect(bia.id, ana.id, 'segunda');

    const list = (await (
      await t.request('/admin/conversations?kind=DIRECT', { cookie: admin.cookie })
    ).json()) as ConversationSummary[];
    const summary = list.find((entry) => entry.id === conversationKey(ana.id, bia.id));
    expect(summary).toMatchObject({ kind: 'DIRECT', messageCount: 2, lastText: 'segunda' });
    expect(summary?.participants.map((person) => person.id).sort()).toEqual(
      [ana.id, bia.id].sort(),
    );

    const messages = (await (
      await t.request(`/admin/conversations/direct/${ana.id}/${bia.id}`, { cookie: admin.cookie })
    ).json()) as ConversationMessage[];
    expect(messages.map((message) => message.text)).toEqual(['primeira', 'segunda']);
    expect(messages[0]?.sender.displayName).toBe(ana.displayName);
    expect(messages[1]?.recipient?.displayName).toBe(ana.displayName);
  });

  it('lista e lê o chat de uma sala', async () => {
    const ana = await t.createUser();
    const roomId = `sala-${unique()}`;
    await seedRoom(roomId, 'Praia', ana.id, 'oi sala');

    const list = (await (
      await t.request('/admin/conversations?kind=ROOM', { cookie: admin.cookie })
    ).json()) as ConversationSummary[];
    const summary = list.find((entry) => entry.id === roomId);
    expect(summary).toMatchObject({ kind: 'ROOM', title: 'Praia', messageCount: 1 });

    const messages = (await (
      await t.request(`/admin/conversations/room/${roomId}`, { cookie: admin.cookie })
    ).json()) as ConversationMessage[];
    expect(messages[0]).toMatchObject({ text: 'oi sala', sender: { id: ana.id } });
  });

  it('registra cada leitura na auditoria', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    await seedDirect(ana.id, bia.id, 'oi');

    const before = await t.prisma.moderationAction.count({
      where: { action: 'conversation.read' },
    });
    await t.request(`/admin/conversations/direct/${ana.id}/${bia.id}`, { cookie: admin.cookie });
    const after = await t.prisma.moderationAction.count({ where: { action: 'conversation.read' } });
    expect(after).toBe(before + 1);
    const audit = await t.prisma.moderationAction.findFirstOrThrow({
      where: { action: 'conversation.read' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toMatchObject({ actorId: admin.id });
  });

  it('só ADMIN lê: moderador e usuário recebem 403, sem sessão 401', async () => {
    const moderator = await t.createUser('MODERATOR');
    const user = await t.createUser();
    const path = '/admin/conversations?kind=DIRECT';

    expect((await t.request(path, { cookie: moderator.cookie })).status).toBe(403);
    expect((await t.request(path, { cookie: user.cookie })).status).toBe(403);
    expect((await t.request(path)).status).toBe(401);
  });

  it('recusa um tipo de conversa inválido', async () => {
    expect(
      (await t.request('/admin/conversations?kind=GROUP', { cookie: admin.cookie })).status,
    ).toBe(400);
  });
});

describe('retenção das conversas', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('apaga o que passou de 90 dias ao ler a lista', async () => {
    const admin = await t.createUser('ADMIN');
    const old = await t.prisma.messageLog.create({
      data: {
        id: randomUUID(),
        kind: 'DIRECT',
        senderId: randomUUID(),
        recipientId: randomUUID(),
        conversationKey: randomUUID(),
        text: 'antiga',
        sentAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      },
    });

    await t.request('/admin/conversations?kind=DIRECT', { cookie: admin.cookie });
    await waitFor(
      async () => (await t.prisma.messageLog.findUnique({ where: { id: old.id } })) === null,
    );
    expect(await t.prisma.messageLog.findUnique({ where: { id: old.id } })).toBeNull();
  });
});
