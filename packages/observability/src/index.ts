import { timingSafeEqual } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Saúde do processo Node, no formato exposto em `GET /metrics`. */
export interface ProcessMetrics {
  service: string;
  uptimeSeconds: number;
  memory: { rssMb: number; heapUsedMb: number };
  /** Uso de CPU desde a amostra anterior, em % de um núcleo. */
  cpuPercent: number;
  /** Atraso do event loop desde a amostra anterior (ms): alto = servidor engasgando. */
  eventLoopDelay: { p50Ms: number; p99Ms: number; maxMs: number };
}

const megabytes = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const ms = (nanoseconds: number) => Math.round((nanoseconds / 1e6) * 100) / 100;

/**
 * Amostrador de métricas do processo. Cada chamada devolve os números do intervalo desde a chamada
 * anterior (CPU e event loop), sem dependência externa: só `process` e `perf_hooks`.
 */
export function createProcessMetrics(service: string): () => ProcessMetrics {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let lastCpu = process.cpuUsage();
  let lastTime = process.hrtime.bigint();

  return () => {
    const now = process.hrtime.bigint();
    const cpu = process.cpuUsage(lastCpu);
    const elapsedMicros = Number(now - lastTime) / 1000;
    lastCpu = process.cpuUsage();
    lastTime = now;

    const memory = process.memoryUsage();
    const metrics: ProcessMetrics = {
      service,
      uptimeSeconds: Math.round(process.uptime()),
      memory: { rssMb: megabytes(memory.rss), heapUsedMb: megabytes(memory.heapUsed) },
      cpuPercent:
        elapsedMicros > 0 ? Math.round(((cpu.user + cpu.system) / elapsedMicros) * 1000) / 10 : 0,
      eventLoopDelay: {
        p50Ms: ms(histogram.percentile(50)),
        p99Ms: ms(histogram.percentile(99)),
        maxMs: ms(histogram.max),
      },
    };
    histogram.reset();
    return metrics;
  };
}

/**
 * `GET /metrics` exige `Authorization: Bearer <METRICS_TOKEN>`. Sem token configurado, o endpoint
 * fica desligado: métricas revelam carga e uso, e não devem ficar abertas por padrão.
 */
export function isMetricsAuthorized(header: string | null | undefined, token: string | undefined) {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Log estruturado: uma linha JSON por evento (fácil de filtrar e de mandar para um coletor).
 * Nunca registre segredo, token, e-mail ou conteúdo de chat aqui.
 */
export function logEvent(service: string, event: string, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ time: new Date().toISOString(), service, event, ...fields }));
}
