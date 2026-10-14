import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProcessMetrics, isMetricsAuthorized, logEvent } from './index.ts';

describe('createProcessMetrics', () => {
  it('mede memória, CPU e atraso do event loop do intervalo', async () => {
    const sample = createProcessMetrics('teste');
    const started = Date.now();
    while (Date.now() - started < 30) {
      // ocupa a CPU um pouco
    }
    await new Promise((resolve) => setTimeout(resolve, 20));

    const metrics = sample();

    expect(metrics.service).toBe('teste');
    expect(metrics.memory.rssMb).toBeGreaterThan(0);
    expect(metrics.cpuPercent).toBeGreaterThan(0);
    expect(metrics.eventLoopDelay.maxMs).toBeGreaterThanOrEqual(0);
  });
});

describe('isMetricsAuthorized', () => {
  it('exige o token configurado', () => {
    expect(isMetricsAuthorized('Bearer segredo-123', 'segredo-123')).toBe(true);
    expect(isMetricsAuthorized('Bearer errado', 'segredo-123')).toBe(false);
    expect(isMetricsAuthorized(undefined, 'segredo-123')).toBe(false);
  });

  it('sem token configurado, nada é autorizado (endpoint desligado)', () => {
    expect(isMetricsAuthorized('Bearer qualquer', undefined)).toBe(false);
  });
});

describe('logEvent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('escreve uma linha JSON com serviço e evento', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logEvent('realtime', 'player.joined', { roomId: 'r1' });

    const line = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({ service: 'realtime', event: 'player.joined', roomId: 'r1' });
    expect(typeof line.time).toBe('string');
  });
});
