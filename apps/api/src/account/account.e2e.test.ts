import { createHash, randomUUID } from 'node:crypto';
import { conversationKey, DELETED_ACCOUNT_NAME, type AccountExport } from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PASSWORD, unique, type TestApp } from '../../test/test-app.js';

describe('conta: exportar e excluir', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const remove = (cookie: string, password: string) =>
    t.request('/account/delete', { cookie, json: { password } });

  it('exporta os dados da própria conta, sem senha e sem quem a denunciou', async () => {
    const user = await t.createUser();
    const other = await t.createUser();
    await t.request('/blocks', { cookie: user.cookie, json: { userId: other.id } });
    await t.request('/reports', {
      cookie: user.cookie,
      json: { reportedUserId: other.id, reason: 'SPAM', details: 'propaganda' },
    });
    await t.request('/reports', {
      cookie: other.cookie,
      json: { reportedUserId: user.id, reason: 'HARASSMENT' },
    });
    await t.prisma.messageLog.create({
      data: {
        id: randomUUID(),
        kind: 'DIRECT',
        senderId: user.id,
        recipientId: other.id,
        conversationKey: conversationKey(user.id, other.id),
        text: 'combinado',
        sentAt: new Date(),
      },
    });

    const response = await t.request('/account/export', { cookie: user.cookie });
    expect(response.status).toBe(200);
    const data = (await response.json()) as AccountExport;

    expect(data.account).toMatchObject({
      id: user.id,
      email: user.email,
      birthDate: '1990-01-01',
      role: 'USER',
    });
    expect(data.blocks.map((block) => block.user.id)).toEqual([other.id]);
    expect(data.reportsMade).toHaveLength(1);
    expect(data.reportsMade[0]).toMatchObject({ reason: 'SPAM', details: 'propaganda' });
    expect(data.messages.map((message) => message.text)).toContain('combinado');
    expect(data.messages[0]?.from.id).toBe(user.id);
    expect(data.sessions.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain('scrypt');
    expect(JSON.stringify(data)).not.toContain(other.email);
  });

  it('senha errada não exclui', async () => {
    const user = await t.createUser();
    expect((await remove(user.cookie, 'senha-errada')).status).toBe(403);
    expect((await t.request('/auth/me', { cookie: user.cookie })).status).toBe(200);
  });

  it('exclui anonimizando e mantém denúncias e auditoria', async () => {
    const user = await t.createUser();
    const other = await t.createUser();
    await t.request('/blocks', { cookie: user.cookie, json: { userId: other.id } });
    await t.request('/blocks', { cookie: other.cookie, json: { userId: user.id } });
    await t.request('/reports', {
      cookie: other.cookie,
      json: { reportedUserId: user.id, reason: 'HARASSMENT' },
    });
    await t.prisma.messageLog.create({
      data: {
        id: randomUUID(),
        kind: 'DIRECT',
        senderId: user.id,
        recipientId: other.id,
        conversationKey: conversationKey(user.id, other.id),
        text: 'some com a conta',
        sentAt: new Date(),
      },
    });

    const response = await remove(user.cookie, PASSWORD);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toMatch(/^sid=;/);

    // Sessão e login acabaram.
    expect((await t.request('/auth/me', { cookie: user.cookie })).status).toBe(401);
    const login = await t.request('/auth/login', {
      json: { email: user.email, password: PASSWORD },
    });
    expect(login.status).toBe(401);

    // Registro anônimo: nada pessoal sobra.
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({
      displayName: DELETED_ACCOUNT_NAME,
      birthDate: null,
      avatar: null,
      role: 'USER',
    });
    expect(row.email).not.toBe(user.email);
    expect(row.email).toMatch(/\.invalid$/);
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await t.prisma.block.count({
        where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      }),
    ).toBe(0);
    // Mensagens do chat/MP são dado pessoal: somem com a conta (ADR 0015).
    expect(
      await t.prisma.messageLog.count({
        where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
      }),
    ).toBe(0);

    // Denúncia e auditoria continuam ligadas ao registro anônimo.
    expect(await t.prisma.report.count({ where: { reportedId: user.id } })).toBe(1);
    const audit = await t.prisma.moderationAction.findMany({
      where: { actorId: user.id, action: 'account.deleted' },
    });
    expect(audit).toHaveLength(1);

    // Para os outros, a conta não existe mais.
    expect((await t.request(`/profiles/${user.id}`, { cookie: other.cookie })).status).toBe(404);
    const block = await t.request('/blocks', { cookie: other.cookie, json: { userId: user.id } });
    expect(block.status).toBe(404);

    // E-mail e nome ficam livres para um cadastro novo.
    const again = await t.request('/auth/register', {
      json: {
        email: user.email,
        password: PASSWORD,
        displayName: user.displayName,
        birthDate: '1990-01-01',
      },
    });
    expect(again.status).toBe(201);
  });

  it('login novo apaga as sessões vencidas', async () => {
    const user = await t.createUser();
    const stale = createHash('sha256').update(`vencida-${unique()}`).digest('hex');
    await t.prisma.session.create({
      data: { id: stale, userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });

    const login = await t.request('/auth/login', {
      json: { email: user.email, password: PASSWORD },
    });
    expect(login.status).toBe(200);
    expect(await t.prisma.session.findUnique({ where: { id: stale } })).toBeNull();
  });
});
