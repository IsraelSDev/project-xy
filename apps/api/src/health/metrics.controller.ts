import { Controller, Get, Headers, NotFoundException } from '@nestjs/common';
import { createProcessMetrics, isMetricsAuthorized, type ProcessMetrics } from '@3dx/observability';
import { SkipRateLimit } from '../common/rate-limit.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface ApiMetrics extends ProcessMetrics {
  database: { ok: boolean; latencyMs: number };
}

/**
 * Métricas para monitoramento: processo e latência do banco. Exige `Authorization: Bearer
 * <METRICS_TOKEN>`; sem token configurado (ou com token errado) responde 404.
 */
@Controller('metrics')
@SkipRateLimit()
export class MetricsController {
  private readonly sample = createProcessMetrics('api');

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async metrics(@Headers('authorization') authorization?: string): Promise<ApiMetrics> {
    if (!isMetricsAuthorized(authorization, process.env.METRICS_TOKEN || undefined)) {
      throw new NotFoundException();
    }

    const started = performance.now();
    let ok = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      ok = false;
    }
    const latencyMs = Math.round((performance.now() - started) * 100) / 100;
    return { ...this.sample(), database: { ok, latencyMs } };
  }
}
