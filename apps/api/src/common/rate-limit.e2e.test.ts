import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, unique, type TestApp } from '../../test/test-app.js';

describe('rate limit compartilhado', () => {
  // Duas instâncias da API com o mesmo escopo: como duas Functions da Vercel no mesmo banco.
  const scope = `compartilhado-${unique()}:`;
  let first: TestApp;
  let second: TestApp;

  beforeAll(async () => {
    first = await createTestApp({ rateLimitScope: scope });
    second = await createTestApp({ rateLimitScope: scope });
  });

  afterAll(async () => {
    await Promise.all([first.close(), second.close()]);
  });

  const login = (app: TestApp) =>
    app.request('/auth/login', {
      json: { email: `ninguem-${unique()}@example.com`, password: 'senha-qualquer' },
    });

  it('instâncias diferentes somam o mesmo contador (login: 10 por minuto por IP)', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login(attempt % 2 === 0 ? first : second)).status).toBe(401);
    }
    const blocked = await login(second);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  });

  it('rotas autenticadas contam por usuário, não por IP (ticket: 30 por minuto)', async () => {
    const busy = await first.createUser();
    const neighbor = await first.createUser();
    const ticket = (cookie: string) => first.request('/auth/realtime-ticket', { cookie, json: {} });

    const statuses: number[] = [];
    for (let index = 0; index < 31; index++) statuses.push((await ticket(busy.cookie)).status);
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);

    // Mesmo IP (127.0.0.1), outra conta: tem a própria cota.
    expect((await ticket(neighbor.cookie)).status).toBe(200);
  });
});
