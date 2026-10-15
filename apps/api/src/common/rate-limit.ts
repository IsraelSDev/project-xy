import {
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/** Limite geral por IP e rota; rotas sensíveis (login, cadastro, denúncia) têm limites próprios. */
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 120, windowMs: 60_000 };

const RATE_LIMIT_KEY = '3dx:rate-limit';

/** Limite próprio da rota (ou do controller), no lugar do padrão. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/** Rota (ou controller) sem limite. */
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_KEY, null);

interface Window {
  count: number;
  resetAt: number;
}

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Limite de requisições por IP e rota, em janela fixa, guardado em memória. Com várias instâncias
 * cada uma conta separado (ver runbook). Substitui o @nestjs/throttler, que é CommonJS e carrega o
 * Nest 12 (só ESM) por require(), o que as Functions da Vercel não suportam.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();
  private nextSweep = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | null | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (options === null) return true;
    const { limit, windowMs } = options ?? DEFAULT_RATE_LIMIT;

    const http = context.switchToHttp();
    const now = Date.now();
    this.sweep(now);

    const ip = http.getRequest<Request>().ip ?? 'desconhecido';
    const key = `${context.getClass().name}.${context.getHandler().name}:${ip}`;
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count++;
    if (window.count <= limit) return true;

    const retryAfterSeconds = Math.ceil((window.resetAt - now) / 1000);
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpException(
      'Muitas tentativas. Aguarde um pouco e tente de novo.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Descarta janelas vencidas de tempos em tempos: a memória acompanha só o tráfego recente. */
  private sweep(now: number): void {
    if (now < this.nextSweep) return;
    this.nextSweep = now + SWEEP_INTERVAL_MS;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
