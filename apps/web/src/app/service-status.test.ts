import { describe, expect, it } from 'vitest';
import { checkHealth } from './service-status';

const respondWith =
  (response: Response): typeof fetch =>
  () =>
    Promise.resolve(response);

describe('checkHealth', () => {
  it('retorna ok quando o serviço responde o contrato esperado', async () => {
    const fetchFn = respondWith(Response.json({ status: 'ok', service: 'api' }));

    await expect(checkHealth('/api/health', 'api', undefined, fetchFn)).resolves.toEqual({
      state: 'ok',
    });
  });

  it('retorna erro com o status HTTP quando a resposta não é 2xx', async () => {
    const fetchFn = respondWith(new Response(null, { status: 503 }));

    await expect(checkHealth('/api/health', 'api', undefined, fetchFn)).resolves.toEqual({
      state: 'error',
      message: 'HTTP 503',
    });
  });

  it('retorna erro quando o corpo é de outro serviço', async () => {
    const fetchFn = respondWith(Response.json({ status: 'ok', service: 'realtime' }));

    await expect(checkHealth('/api/health', 'api', undefined, fetchFn)).resolves.toEqual({
      state: 'error',
      message: 'resposta inesperada',
    });
  });

  it('retorna erro em falha de rede, sem rejeitar', async () => {
    const fetchFn: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    await expect(checkHealth('/api/health', 'api', undefined, fetchFn)).resolves.toEqual({
      state: 'error',
      message: 'Failed to fetch',
    });
  });
});
