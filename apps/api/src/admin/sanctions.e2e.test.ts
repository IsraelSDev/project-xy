import type { Role, SanctionSummary } from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PASSWORD, type TestApp, type TestUser } from '../../test/test-app.js';

const HOUR = 60 * 60_000;

describe('sanções da moderação', () => {
  let t: TestApp;
  let moderator: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    moderator = await t.createUser('MODERATOR');
  });

  afterAll(async () => {
    await t.close();
  });

  /** Alguém denuncia `targetRole`; devolve o denunciado e o id da denúncia. */
  async function reported(targetRole: Role = 'USER') {
    const reporter = await t.createUser();
    const target = await t.createUser(targetRole);
    const response = await t.request('/reports', {
      cookie: reporter.cookie,
      json: { reportedUserId: target.id, reason: 'HARASSMENT' },
    });
    const { id } = (await response.json()) as { id: string };
    return { target, reportId: id };
  }

  const review = (reportId: string, body: unknown) =>
    t.request(`/admin/reports/${reportId}/review`, { cookie: moderator.cookie, json: body });

  const login = (target: TestUser) =>
    t.request('/auth/login', { json: { email: target.email, password: PASSWORD } });

  it('suspensão derruba a sessão, barra o login e pode ser revogada', async () => {
    const { target, reportId } = await reported();
    const response = await review(reportId, {
      status: 'RESOLVED',
      note: 'assédio repetido',
      sanction: { type: 'SUSPEND', hours: 24 },
    });
    expect(response.status).toBe(200);

    expect((await t.request('/auth/me', { cookie: target.cookie })).status).toBe(401);
    const denied = await login(target);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { message: string }).message).toMatch(/suspensa .* até/);

    const active = (await (
      await t.request('/admin/sanctions', { cookie: moderator.cookie })
    ).json()) as SanctionSummary[];
    const sanction = active.find((entry) => entry.user.id === target.id);
    expect(sanction).toMatchObject({ type: 'SUSPEND', reportId, createdBy: { id: moderator.id } });
    const endsIn = new Date(sanction?.endsAt ?? 0).getTime() - Date.now();
    expect(endsIn).toBeGreaterThan(23 * HOUR);
    expect(endsIn).toBeLessThanOrEqual(24 * HOUR);

    const revoke = () =>
      t.request(`/admin/sanctions/${sanction?.id}/revoke`, { cookie: moderator.cookie, json: {} });
    expect((await revoke()).status).toBe(200);
    expect((await revoke()).status).toBe(409);
    expect((await login(target)).status).toBe(200);

    const audit = await t.prisma.moderationAction.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      'report.resolved',
      'sanction.suspend',
      'sanction.revoke',
    ]);
    expect(audit.every((entry) => entry.actorId === moderator.id)).toBe(true);
    expect(audit[1]?.note).toBe('assédio repetido');
  });

  it('suspensão permanente não tem prazo', async () => {
    const { target, reportId } = await reported();
    await review(reportId, { status: 'RESOLVED', sanction: { type: 'SUSPEND', hours: null } });

    const denied = await login(target);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { message: string }).message).toMatch(/permanentemente/);
  });

  it('silenciamento mantém o login e vai no ticket do realtime', async () => {
    const { target, reportId } = await reported();
    await review(reportId, { status: 'RESOLVED', sanction: { type: 'MUTE', hours: 2 } });

    expect((await t.request('/auth/me', { cookie: target.cookie })).status).toBe(200);
    const { ticket } = (await (
      await t.request('/auth/realtime-ticket', { cookie: target.cookie, json: {} })
    ).json()) as { ticket: string };
    const payload = JSON.parse(Buffer.from(ticket.split('.')[1] ?? '', 'base64url').toString()) as {
      mutedUntil: number | null;
    };
    const mutedFor = (payload.mutedUntil ?? 0) - Date.now();
    expect(mutedFor).toBeGreaterThan(HOUR);
    expect(mutedFor).toBeLessThanOrEqual(2 * HOUR);
  });

  it('ticket de quem não tem sanção não traz silenciamento', async () => {
    const user = await t.createUser();
    const { ticket } = (await (
      await t.request('/auth/realtime-ticket', { cookie: user.cookie, json: {} })
    ).json()) as { ticket: string };
    const payload = JSON.parse(Buffer.from(ticket.split('.')[1] ?? '', 'base64url').toString()) as {
      mutedUntil: number | null;
    };
    expect(payload.mutedUntil).toBeNull();
  });

  it('recusa sanção ao descartar e contra a equipe, sem mudar a denúncia', async () => {
    const { reportId } = await reported();
    const dismissed = await review(reportId, {
      status: 'DISMISSED',
      sanction: { type: 'MUTE', hours: 1 },
    });
    expect(dismissed.status).toBe(400);

    const staff = await reported('MODERATOR');
    const forbidden = await review(staff.reportId, {
      status: 'RESOLVED',
      sanction: { type: 'SUSPEND', hours: null },
    });
    expect(forbidden.status).toBe(403);
    // A transação desfez a revisão: a denúncia continua aberta e sem auditoria.
    const report = await t.prisma.report.findUniqueOrThrow({ where: { id: staff.reportId } });
    expect(report.status).toBe('OPEN');
    expect(await t.prisma.moderationAction.count({ where: { reportId: staff.reportId } })).toBe(0);
    expect((await t.request('/auth/me', { cookie: staff.target.cookie })).status).toBe(200);
  });

  it('só a moderação vê e revoga sanções', async () => {
    const user = await t.createUser();
    expect((await t.request('/admin/sanctions', { cookie: user.cookie })).status).toBe(403);
    const revoke = await t.request(`/admin/sanctions/${crypto.randomUUID()}/revoke`, {
      cookie: user.cookie,
      json: {},
    });
    expect(revoke.status).toBe(403);
  });
});
