import { randomUUID } from 'node:crypto';
import type { SanctionSummary } from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, type TestUser } from '../../test/test-app.js';

const HOUR = 60 * 60_000;

describe('sanção direta (sem denúncia)', () => {
  let t: TestApp;
  let moderator: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    moderator = await t.createUser('MODERATOR');
  });

  afterAll(async () => {
    await t.close();
  });

  const sanction = (body: unknown, cookie = moderator.cookie) =>
    t.request('/admin/sanctions', { cookie, json: body });

  it('silencia com motivo, sem denúncia, e audita', async () => {
    const target = await t.createUser();
    const response = await sanction({
      userId: target.id,
      sanction: { type: 'MUTE', hours: 1 },
      reason: 'ofensas no chat do lounge',
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as SanctionSummary;
    expect(created).toMatchObject({
      type: 'MUTE',
      user: { id: target.id },
      createdBy: { id: moderator.id },
      reportId: null,
      reason: 'ofensas no chat do lounge',
    });

    const active = (await (
      await t.request('/admin/sanctions', { cookie: moderator.cookie })
    ).json()) as SanctionSummary[];
    expect(active.find((entry) => entry.id === created.id)?.reason).toBe(
      'ofensas no chat do lounge',
    );

    // O ticket do realtime já sai com o silenciamento.
    const { ticket } = (await (
      await t.request('/auth/realtime-ticket', { cookie: target.cookie, json: {} })
    ).json()) as { ticket: string };
    const { mutedUntil } = JSON.parse(
      Buffer.from(ticket.split('.')[1] ?? '', 'base64url').toString(),
    ) as { mutedUntil: number };
    expect(mutedUntil - Date.now()).toBeGreaterThan(HOUR - 60_000);

    const audit = await t.prisma.moderationAction.findFirstOrThrow({
      where: { sanctionId: created.id },
    });
    expect(audit).toMatchObject({
      actorId: moderator.id,
      reportId: null,
      action: 'sanction.mute',
      note: 'ofensas no chat do lounge',
    });
  });

  it('suspensão direta derruba a sessão na hora', async () => {
    const target = await t.createUser();
    const response = await sanction({
      userId: target.id,
      sanction: { type: 'SUSPEND', hours: null },
      reason: 'assédio repetido em várias salas',
    });
    expect(response.status).toBe(201);
    expect((await t.request('/auth/me', { cookie: target.cookie })).status).toBe(401);
  });

  it('exige motivo e recusa equipe, conta excluída e quem não modera', async () => {
    const target = await t.createUser();
    const valid = { userId: target.id, sanction: { type: 'MUTE', hours: 1 }, reason: 'flagrante' };

    expect((await sanction({ ...valid, reason: 'x' })).status).toBe(400);
    expect((await sanction({ ...valid, reason: undefined })).status).toBe(400);

    const staff = await t.createUser('ADMIN');
    expect((await sanction({ ...valid, userId: staff.id })).status).toBe(403);

    expect((await sanction({ ...valid, userId: randomUUID() })).status).toBe(404);
    const deleted = await t.createUser();
    await t.prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    expect((await sanction({ ...valid, userId: deleted.id })).status).toBe(404);

    const user = await t.createUser();
    expect((await sanction(valid, user.cookie)).status).toBe(403);

    // Nada foi aplicado ao alvo nas tentativas recusadas.
    expect(await t.prisma.sanction.count({ where: { userId: target.id } })).toBe(0);
  });
});
