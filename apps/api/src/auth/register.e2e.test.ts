import type { SessionUser } from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PASSWORD, unique, type TestApp } from '../../test/test-app.js';

const registration = (overrides: Record<string, unknown> = {}) => {
  const tag = unique();
  return {
    email: `Pessoa-${tag}@Example.com`,
    password: PASSWORD,
    displayName: `Pessoa ${tag}`,
    birthDate: '1995-03-10',
    acceptTerms: true,
    ...overrides,
  };
};

// Arquivo próprio e com exatamente 5 cadastros: é o limite por minuto da rota (por processo).
// Senha curta, nome inválido etc. estão nos testes do contrato (RegisterRequest).
describe('cadastro', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('cria a conta, guarda só o hash da senha e abre sessão em cookie httpOnly', async () => {
    const body = registration();
    const response = await t.request('/auth/register', { json: body });

    expect(response.status).toBe(201);
    const user = (await response.json()) as SessionUser;
    expect(user).toMatchObject({ email: body.email.toLowerCase(), role: 'USER' });
    expect(user).not.toHaveProperty('passwordHash');

    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const me = await t.request('/auth/me', { cookie: cookie.split(';')[0] });
    expect(((await me.json()) as SessionUser).id).toBe(user.id);

    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).not.toContain(PASSWORD);
    expect(stored.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(stored.ageAssurance).toBe('SELF_DECLARED');

    // Primeiro item do feed do perfil.
    const joined = await t.prisma.profileEvent.findMany({ where: { userId: user.id } });
    expect(joined.map((event) => event.kind)).toEqual(['JOINED']);
  });

  it.each([
    ['menor de 18 anos', { birthDate: '2015-01-01' }],
    ['tentativa de escolher o próprio papel', { role: 'ADMIN' }],
  ])('recusa %s', async (_, overrides) => {
    const response = await t.request('/auth/register', { json: registration(overrides) });
    expect(response.status).toBe(400);
  });

  it('recusa e-mail repetido e nome que só muda na caixa', async () => {
    const user = await t.createUser();

    const sameEmail = await t.request('/auth/register', {
      json: registration({ email: user.email.toUpperCase() }),
    });
    const sameName = await t.request('/auth/register', {
      json: registration({ displayName: user.displayName.toUpperCase() }),
    });

    expect(sameEmail.status).toBe(409);
    expect(sameName.status).toBe(409);
  });
});
