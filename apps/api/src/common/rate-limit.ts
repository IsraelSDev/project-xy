import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { SessionService } from '../auth/session.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /**
   * Quem é contado. Padrão: o usuário logado (por conta, não por IP: várias pessoas atrás do mesmo
   * IP não dividem o limite) ou o IP sem sessão. `ip`: sempre o IP, para rotas em que a sessão não
   * deve contar (login e cadastro: trocar o cookie não pode zerar o limite).
   */
  by?: 'ip';
}

/** Limite geral; rotas sensíveis (login, cadastro, denúncia, ticket) têm limites próprios. */
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 120, windowMs: 60_000 };

const RATE_LIMIT_KEY = '3dx:rate-limit';

/** Limite próprio da rota (ou do controller), no lugar do padrão. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/** Rota (ou controller) sem limite. */
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_KEY, null);

/**
 * Prefixo das chaves. Vazio em produção; os testes usam um por app para os arquivos de teste, que
 * rodam em paralelo no mesmo banco, não dividirem contadores.
 */
export const RATE_LIMIT_SCOPE = Symbol('RATE_LIMIT_SCOPE');

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Limite de requisições por rota e por usuário (ou IP), em janela fixa. O contador fica no
 * Postgres: vale para todas as instâncias da API (na Vercel cada instância tem sua memória).
 * Um upsert atômico por requisição; linhas vencidas são apagadas de tempos em tempos.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private nextSweep = 0;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(RATE_LIMIT_SCOPE) private readonly scope: string,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | null | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (options === null) return true;
    const { limit, windowMs, by } = options ?? DEFAULT_RATE_LIMIT;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const ip = `ip:${request.ip ?? 'desconhecido'}`;
    const user = by === 'ip' ? undefined : await this.sessions.forRequest(request);
    const key = `${this.scope}${context.getClass().name}.${context.getHandler().name}:${
      user ? `u:${user.id}` : ip
    }`;

    const now = new Date();
    this.sweep(now);
    const resetAt = new Date(now.getTime() + windowMs);
    // Janela vencida recomeça em 1; senão soma. O ON CONFLICT trava a linha: contagem exata mesmo
    // com requisições simultâneas em instâncias diferentes.
    const [bucket] = await this.prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
                       ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
                         ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    if (!bucket || bucket.count <= limit) return true;

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000),
    );
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpException(
      'Muitas tentativas. Aguarde um pouco e tente de novo.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Apaga contadores vencidos no máximo uma vez por minuto por instância, sem segurar a resposta. */
  private sweep(now: Date): void {
    if (now.getTime() < this.nextSweep) return;
    this.nextSweep = now.getTime() + SWEEP_INTERVAL_MS;
    this.prisma.rateLimitBucket
      .deleteMany({ where: { resetAt: { lt: now } } })
      .catch(() => undefined);
  }
}
