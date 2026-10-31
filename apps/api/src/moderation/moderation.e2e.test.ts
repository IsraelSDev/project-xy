import type {
  BlockedUser,
  ModerationQueueSummary,
  PublicProfile,
  ReportSummary,
} from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/test-app.js';

describe('bloqueio, denúncia e moderação', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('bloqueia, lista e desbloqueia; repetir o bloqueio não é erro', async () => {
    const user = await t.createUser();
    const other = await t.createUser();

    const block = () => t.request('/blocks', { cookie: user.cookie, json: { userId: other.id } });
    expect((await block()).status).toBe(204);
    expect((await block()).status).toBe(204);

    const list = (await (
      await t.request('/blocks', { cookie: user.cookie })
    ).json()) as BlockedUser[];
    expect(list.map((entry) => entry.id)).toEqual([other.id]);

    const unblock = await t.request(`/blocks/${other.id}`, {
      method: 'DELETE',
      cookie: user.cookie,
    });
    expect(unblock.status).toBe(204);
    expect(await (await t.request('/blocks', { cookie: user.cookie })).json()).toEqual([]);
  });

  it('não bloqueia a si mesmo nem usuário inexistente', async () => {
    const user = await t.createUser();

    const self = await t.request('/blocks', { cookie: user.cookie, json: { userId: user.id } });
    const ghost = await t.request('/blocks', {
      cookie: user.cookie,
      json: { userId: '00000000-0000-4000-8000-000000000000' },
    });

    expect(self.status).toBe(400);
    expect(ghost.status).toBe(404);
  });

  it('denúncia: registrada para a moderação; não dá para denunciar a si mesmo', async () => {
    const user = await t.createUser();
    const other = await t.createUser();

    const created = await t.request('/reports', {
      cookie: user.cookie,
      json: { reportedUserId: other.id, reason: 'HARASSMENT', details: 'Mensagens ofensivas.' },
    });
    const self = await t.request('/reports', {
      cookie: user.cookie,
      json: { reportedUserId: user.id, reason: 'SPAM' },
    });

    expect(created.status).toBe(201);
    expect(self.status).toBe(400);
  });

  it('denúncia de perfil guarda a bio como prova', async () => {
    const reporter = await t.createUser();
    const reported = await t.createUser();
    const moderator = await t.createUser('MODERATOR');
    await t.prisma.user.update({
      where: { id: reported.id },
      data: { bio: 'texto que vai ser apagado depois' },
    });

    const created = await t.request('/reports', {
      cookie: reporter.cookie,
      json: { reportedUserId: reported.id, reason: 'INAPPROPRIATE_CONTENT', context: 'PROFILE' },
    });
    const { id } = (await created.json()) as { id: string };

    // A pessoa edita a bio antes da revisão; a denúncia mantém o texto do momento.
    await t.prisma.user.update({ where: { id: reported.id }, data: { bio: null } });

    const queue = (await (
      await t.request('/admin/reports', { cookie: moderator.cookie })
    ).json()) as ReportSummary[];
    expect(queue.find((report) => report.id === id)).toMatchObject({
      context: 'PROFILE',
      evidence: 'texto que vai ser apagado depois',
    });
  });

  it('fila de denúncias é restrita à moderação; revisão fica na auditoria e não repete', async () => {
    const reporter = await t.createUser();
    const reported = await t.createUser();
    const moderator = await t.createUser('MODERATOR');
    const { id } = (await (
      await t.request('/reports', {
        cookie: reporter.cookie,
        json: { reportedUserId: reported.id, reason: 'SPAM' },
      })
    ).json()) as { id: string };

    expect((await t.request('/admin/reports', { cookie: reporter.cookie })).status).toBe(403);
    expect((await t.request('/admin/reports')).status).toBe(401);

    const queue = (await (
      await t.request('/admin/reports', { cookie: moderator.cookie })
    ).json()) as ReportSummary[];
    expect(queue.find((report) => report.id === id)).toMatchObject({
      status: 'OPEN',
      reporter: { id: reporter.id },
      reported: { id: reported.id },
    });

    const review = () =>
      t.request(`/admin/reports/${id}/review`, {
        cookie: moderator.cookie,
        json: { status: 'RESOLVED', note: 'Advertência enviada.' },
      });
    const first = await review();
    const second = await review();

    expect(first.status).toBe(200);
    expect(((await first.json()) as ReportSummary).status).toBe('RESOLVED');
    expect(second.status).toBe(409);
    const audit = await t.prisma.moderationAction.findMany({ where: { reportId: id } });
    expect(audit).toEqual([
      expect.objectContaining({ actorId: moderator.id, action: 'report.resolved' }),
    ]);
  });

  it('fila: contagem só para a moderação e cai quando a denúncia é revisada', async () => {
    const reporter = await t.createUser();
    const reported = await t.createUser();
    const moderator = await t.createUser('MODERATOR');

    const queue = () =>
      t.request('/admin/queue', { cookie: moderator.cookie }).then((r) => r.json());
    expect((await t.request('/admin/queue', { cookie: reporter.cookie })).status).toBe(403);
    expect((await t.request('/admin/queue')).status).toBe(401);

    const before = (await queue()) as ModerationQueueSummary;
    const { id } = (await (
      await t.request('/reports', {
        cookie: reporter.cookie,
        json: { reportedUserId: reported.id, reason: 'SPAM' },
      })
    ).json()) as { id: string };

    const withTicket = (await queue()) as ModerationQueueSummary;
    expect(withTicket.reports).toBe(before.reports + 1);
    expect(withTicket.appeals).toBe(before.appeals);

    await t.request(`/admin/reports/${id}/review`, {
      cookie: moderator.cookie,
      json: { status: 'DISMISSED' },
    });
    expect(((await queue()) as ModerationQueueSummary).reports).toBe(before.reports);
  });

  it('perfil público não expõe e-mail nem data de nascimento', async () => {
    const user = await t.createUser();
    const other = await t.createUser();

    const profile = (await (
      await t.request(`/profiles/${other.id}`, { cookie: user.cookie })
    ).json()) as PublicProfile;

    expect(Object.keys(profile).sort()).toEqual([
      'bio',
      // Dia e mês do aniversário (sem ano, e só quando a pessoa escolhe mostrar), localização,
      // status e as opções do perfil são públicos; e-mail e data de nascimento completa, não.
      'birthday',
      'createdAt',
      'displayName',
      'id',
      'interests',
      'languages',
      'location',
      'lookingFor',
      'photoUpdatedAt',
      'pronouns',
      'role',
      'status',
      'verifiedAdult',
    ]);
  });
});
