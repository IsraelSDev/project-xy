import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/test-app.js';

// Arquivo próprio: o limite é por processo (memória), e os outros testes também fazem login.
describe('limite de tentativas de login', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('bloqueia com 429 depois de 10 tentativas por minuto', async () => {
    const attempt = () =>
      t.request('/auth/login', {
        json: { email: 'alguem@example.com', password: 'tentativa-errada' },
      });

    const statuses: number[] = [];
    for (let index = 0; index < 11; index++) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
