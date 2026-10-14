import type { HealthResponse, ServiceName } from '@3dx/contracts';

export type ServiceStatus =
  { state: 'checking' } | { state: 'ok' } | { state: 'error'; message: string };

const TIMEOUT_MS = 5000;

/** Consulta o health check de um serviço e traduz o resultado para a UI. Nunca rejeita. */
export async function checkHealth(
  url: string,
  service: ServiceName,
  signal?: AbortSignal,
  fetchFn: typeof fetch = fetch,
): Promise<ServiceStatus> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetchFn(url, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) return { state: 'error', message: `HTTP ${response.status}` };

    const body: unknown = await response.json();
    if (!isHealthResponse(body, service)) return { state: 'error', message: 'resposta inesperada' };

    return { state: 'ok' };
  } catch (error) {
    if (timeout.aborted) {
      return { state: 'error', message: `sem resposta em ${TIMEOUT_MS / 1000}s` };
    }
    return { state: 'error', message: error instanceof Error ? error.message : 'falha de rede' };
  }
}

function isHealthResponse(body: unknown, service: ServiceName): body is HealthResponse {
  if (typeof body !== 'object' || body === null) return false;
  const record = body as Record<string, unknown>;
  return record.status === 'ok' && record.service === service;
}
