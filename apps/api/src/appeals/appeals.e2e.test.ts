import type { AppealReceipt, AppealSummary } from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PASSWORD, type TestApp, type TestUser } from '../../test/test-app.js';

describe('contestação de sanções', () => {
  let t: TestApp;
  let moderator: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    moderator = await t.createUser('MODERATOR');
  });

  afterAll(async () => {
    await t.close();
  });

  const sanction = async (target: TestUser, type: 'MUTE' | 'SUSPEND') => {
    const response = await t.request('/admin/sanctions', {
      cookie: moderator.cookie,
      json: {
        userId: target.id,
        sanction: type === 'MUTE' ? { type, hours: 1 } : { type, hours: 168 },
        reason: 'flagrante na sala',
      },
    });
    expect(response.status).toBe(201);
  };

  const appeal = (
    target: TestUser,
    message = 'Foi um mal-entendido, peço revisão.',
    password = PASSWORD,
  ) => t.request('/appeals', { json: { email: target.email, password, message } });

  const login = (target: TestUser) =>
    t.request('/auth/login', { json: { email: target.email, password: PASSWORD } });

  const openAppeals = async () =>
    (await (
      await t.request('/admin/appeals', { cookie: moderator.cookie })
    ).json()) as AppealSummary[];

  it('suspenso contesta sem sessão; moderação aceita e a conta volta', async () => {
    const target = await t.createUser();
    await sanction(target, 'SUSPEND');

    const before = await login(target);
    expect(((await before.json()) as { message: string }).message).toMatch(/pode contestar/);

    const created = await appeal(target);
    expect(created.status).toBe(201);
    expect(((await created.json()) as AppealReceipt).sanction.type).toBe('SUSPEND');
    expect((await appeal(target)).status).toBe(409);

    const pending = await login(target);
    expect(pending.status).toBe(403);
    expect(((await pending.json()) as { message: string }).message).toMatch(/em análise/);

    const entry = (await openAppeals()).find((item) => item.user.id === target.id);
    expect(entry).toMatchObject({
      status: 'OPEN',
      message: 'Foi um mal-entendido, peço revisão.',
      sanction: { type: 'SUSPEND', reportReason: null, reason: 'flagrante na sala' },
    });

    const review = await t.request(`/admin/appeals/${entry?.id}/review`, {
      cookie: moderator.cookie,
      json: { decision: 'ACCEPTED' },
    });
    expect(review.status).toBe(200);
    expect((await login(target)).status).toBe(200);

    const actions = await t.prisma.moderationAction.findMany({
      where: { sanctionId: entry?.sanction.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((action) => action.action)).toEqual([
      'sanction.suspend',
      'appeal.created',
      'sanction.revoke',
      'appeal.accepted',
    ]);
  });

  it('contestação negada aparece no login, com a resposta', async () => {
    const target = await t.createUser();
    await sanction(target, 'SUSPEND');
    await appeal(target);
    const entry = (await openAppeals()).find((item) => item.user.id === target.id);

    const review = await t.request(`/admin/appeals/${entry?.id}/review`, {
      cookie: moderator.cookie,
      json: { decision: 'REJECTED', response: 'As mensagens no chat confirmam o assédio.' },
    });
    expect(review.status).toBe(200);
    const again = await t.request(`/admin/appeals/${entry?.id}/review`, {
      cookie: moderator.cookie,
      json: { decision: 'ACCEPTED' },
    });
    expect(again.status).toBe(409);

    const denied = await login(target);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { message: string }).message).toMatch(
      /negada pela moderação: As mensagens no chat confirmam o assédio\./,
    );
  });

  it('silenciado também contesta; sem sanção ou com senha errada, não', async () => {
    const muted = await t.createUser();
    await sanction(muted, 'MUTE');
    const created = await appeal(muted);
    expect(created.status).toBe(201);
    expect(((await created.json()) as AppealReceipt).sanction.type).toBe('MUTE');

    const clean = await t.createUser();
    expect((await appeal(clean)).status).toBe(409);
    expect(
      (await appeal(muted, 'Foi um mal-entendido, peço revisão.', 'senha-errada')).status,
    ).toBe(401);
    expect((await appeal(muted, 'curta')).status).toBe(400);
  });

  it('só a moderação vê e decide contestações', async () => {
    const user = await t.createUser();
    expect((await t.request('/admin/appeals', { cookie: user.cookie })).status).toBe(403);
  });
});
