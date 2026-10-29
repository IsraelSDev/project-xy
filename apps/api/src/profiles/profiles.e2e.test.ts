import type { NameChangeSummary, PublicProfile } from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  createTestApp,
  unique,
  type TestApp,
  type TestUser,
} from '../../test/test-app.js';

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

  it('troca o nome, respeita unicidade e o intervalo de um dia', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();
    const rename = (user: TestUser, displayName: string) =>
      t.request('/profiles/me', { cookie: user.cookie, method: 'PATCH', json: { displayName } });
    // Nome novo a cada execução: o banco de teste é compartilhado entre rodadas.
    const fresh = `Renomeada ${unique()}`;

    const renamed = await rename(ana, fresh);
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as PublicProfile).displayName).toBe(fresh);

    // A sessão (e o perfil público) passam a mostrar o nome novo.
    const me = (await (await t.request('/auth/me', { cookie: ana.cookie })).json()) as {
      displayName: string;
    };
    expect(me.displayName).toBe(fresh);
    expect(((await (await profileOf(bia, ana)).json()) as PublicProfile).displayName).toBe(fresh);

    // Trocar de novo no mesmo dia é recusado.
    expect((await rename(ana, 'Ana de Novo')).status).toBe(429);

    // Liberando o intervalo: nome de outra conta (caixa diferente) dá conflito.
    await t.prisma.user.update({ where: { id: ana.id }, data: { displayNameChangedAt: null } });
    expect((await rename(ana, bia.displayName.toUpperCase())).status).toBe(409);

    // E o contrato continua valendo na troca.
    expect((await rename(bia, 'ab')).status).toBe(400);
  });

  it('a moderação vê o histórico de nomes e ele some com a conta', async () => {
    const ana = await t.createUser();
    const moderator = await t.createUser('MODERATOR');
    const original = ana.displayName;

    await t.request('/profiles/me', {
      cookie: ana.cookie,
      method: 'PATCH',
      json: { displayName: `Nova ${unique()}` },
    });
    // Salvar só a bio não cria histórico.
    await saveBio(ana, 'só a bio mudou');

    const names = (cookie?: string) =>
      t.request(`/admin/users/${ana.id}/names`, cookie ? { cookie } : {});

    expect((await names(ana.cookie)).status).toBe(403);
    expect((await names()).status).toBe(401);
    const list = (await (await names(moderator.cookie)).json()) as NameChangeSummary[];
    expect(list.map((change) => change.previousName)).toEqual([original]);
    expect(typeof list[0]?.changedAt).toBe('string');

    // Exclusão da conta apaga o histórico (dado pessoal), mesmo com o registro anonimizado vivo.
    const deleted = await t.request('/account/delete', {
      cookie: ana.cookie,
      json: { password: PASSWORD },
    });
    expect(deleted.status).toBe(204);
    expect(await (await names(moderator.cookie)).json()).toEqual([]);
  });

  it('filtra link e contato fora da plataforma na bio', async () => {
    const ana = await t.createUser();

    expect((await saveBio(ana, 'meu site: https://exemplo.com')).status).toBe(400);
    expect((await saveBio(ana, 'chama no whatsapp')).status).toBe(400);
    expect((await saveBio(ana, 'Gosto de música, dança e conversar.')).status).toBe(200);
  });

  it('bloqueio esconde o perfil dos dois lados', async () => {
    const ana = await t.createUser();
    const bia = await t.createUser();

    const blocked = await t.request('/blocks', { cookie: ana.cookie, json: { userId: bia.id } });
    expect(blocked.status).toBe(204);

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

  describe('foto', () => {
    // PNG 1x1 transparente (68 bytes): assinatura válida e minúscula para o teste.
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = (user: TestUser, data: Buffer, mime = 'image/png') =>
      t.request('/profiles/me/photo', {
        cookie: user.cookie,
        json: { mime, data: data.toString('base64') },
      });
    const photoOf = (viewer: TestUser, target: TestUser) =>
      t.request(`/profiles/${target.id}/photo`, { cookie: viewer.cookie });
    const removePhoto = (user: TestUser) =>
      t.request('/profiles/me/photo', { cookie: user.cookie, method: 'DELETE' });

    it('envia, serve e apaga a foto do próprio perfil', async () => {
      const ana = await t.createUser();
      const bia = await t.createUser();

      expect(
        ((await (await t.request('/profiles/me', { cookie: bia.cookie })).json()) as PublicProfile)
          .photoUpdatedAt,
      ).toBeNull();

      const sent = await upload(bia, PNG);
      expect([200, 201]).toContain(sent.status);
      const after = (await sent.json()) as PublicProfile;
      expect(typeof after.photoUpdatedAt).toBe('string');

      const image = await photoOf(ana, bia);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await image.arrayBuffer()).equals(PNG)).toBe(true);

      const removed = await removePhoto(bia);
      expect(((await removed.json()) as PublicProfile).photoUpdatedAt).toBeNull();
      expect((await photoOf(ana, bia)).status).toBe(404);
    });

    it('recusa imagem acima do limite e bytes que não são o formato declarado', async () => {
      const ana = await t.createUser();

      const big = await upload(ana, Buffer.alloc(300 * 1024, 0xff));
      expect(big.status).toBe(400);

      const lying = await upload(ana, PNG, 'image/jpeg');
      expect(lying.status).toBe(400);
    });

    it('bloqueio também esconde a foto', async () => {
      const ana = await t.createUser();
      const bia = await t.createUser();
      await upload(bia, PNG);
      await t.request('/blocks', { cookie: ana.cookie, json: { userId: bia.id } });

      expect((await photoOf(ana, bia)).status).toBe(404);
    });
  });
});
