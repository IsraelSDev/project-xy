import type { PublicProfile } from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, type TestUser } from '../../test/test-app.js';

describe('perfis', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const profileOf = async (viewer: TestUser, target: TestUser | string) => {
    const id = typeof target === 'string' ? target : target.id;
    return t.request(`/profiles/${id}`, { cookie: viewer.cookie });
  };
  const saveBio = (user: TestUser, bio: string | null) =>
    t.request('/profiles/me', { cookie: user.cookie, method: 'PATCH', json: { bio } });

  it('o perfil público traz nome, bio, papel e selo de idade', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();

    const empty = await profileOf(ana, bia);
    expect(empty.status).toBe(200);
    const before = (await empty.json()) as PublicProfile;
    expect(before.id).toBe(bia.id);
    expect(before.displayName).toBe(bia.displayName);
    expect(typeof before.createdAt).toBe('string');
    expect(before.bio).toBeNull();
    expect(before.role).toBe('USER');
    expect(before.verifiedAdult).toBe(false);

    const saved = await saveBio(bia, '  gosto de dançar e de música  ');
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as PublicProfile).bio).toBe('gosto de dançar e de música');

    const seen = (await (await profileOf(ana, bia)).json()) as PublicProfile;
    expect(seen.bio).toBe('gosto de dançar e de música');
  });

  it('só o dono edita a própria bio, e vazio apaga', async () => {
    const ana = await t.createUser();
    const mine = await t.request('/profiles/me', { cookie: ana.cookie });
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as PublicProfile).id).toBe(ana.id);

    const cleared = await saveBio(ana, '   ');
    expect(((await cleared.json()) as PublicProfile).bio).toBeNull();
  });

  it('recusa bio acima do limite e campo desconhecido', async () => {
    const ana = await t.createUser();
    const tooLong = await saveBio(ana, 'x'.repeat(301));
    expect(tooLong.status).toBe(400);

    const extra = await t.request('/profiles/me', {
      cookie: ana.cookie,
      method: 'PATCH',
      json: { bio: 'oi', role: 'ADMIN' },
    });
    expect(extra.status).toBe(400);
    expect(
      ((await (await t.request('/profiles/me', { cookie: ana.cookie })).json()) as PublicProfile)
        .bio,
    ).toBeNull();
  });

  it('bloqueio esconde o perfil dos dois lados', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();

    const blocked = await t.request('/blocks', { cookie: ana.cookie, json: { userId: bia.id } });
    expect([200, 201]).toContain(blocked.status);

    expect((await profileOf(ana, bia)).status).toBe(404);
    expect((await profileOf(bia, ana)).status).toBe(404);
  });

  it('conta excluída não tem perfil e a rota exige sessão', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    await t.prisma.user.update({ where: { id: bia.id }, data: { deletedAt: new Date() } });

    expect((await profileOf(ana, bia)).status).toBe(404);
    expect((await t.request(`/profiles/${ana.id}`)).status).toBe(401);

    const invalid = await profileOf(ana, 'nao-e-uuid');
    expect(invalid.status).toBe(400);
  });
});
