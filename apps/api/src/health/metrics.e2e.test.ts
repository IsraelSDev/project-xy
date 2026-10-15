import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/test-app.js';

describe('GET /metrics e cabeçalhos de segurança', () => {
  let t: TestApp;

  beforeAll(async () => {
    process.env.METRICS_TOKEN = 'token-de-teste-123';
    t = await createTestApp();
  });

  afterAll(async () => {
    delete process.env.METRICS_TOKEN;
    await t.close();
  });

  it('sem o token responde 404', async () => {
    expect((await t.request('/metrics')).status).toBe(404);
    expect(
      (await t.request('/metrics', { headers: { authorization: 'Bearer errado' } })).status,
    ).toBe(404);
  });

  it('com o token traz processo e latência do banco', async () => {
    const response = await t.request('/metrics', {
      headers: { authorization: 'Bearer token-de-teste-123' },
    });
    expect(await response.json()).toMatchObject({
      service: 'api',
      database: { ok: true, latencyMs: expect.any(Number) as number },
    });
  });

  it('respostas saem com cabeçalhos de segurança e sem identificar o framework', async () => {
    const response = await t.request('/health');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('x-powered-by')).toBeNull();
  });
});
