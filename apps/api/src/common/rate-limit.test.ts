import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RATE_LIMIT, RateLimit, RateLimitGuard, SkipRateLimit } from './rate-limit.js';

class Routes {
  @RateLimit({ limit: 2, windowMs: 1000 })
  login(this: void): void {}

  free(this: void): void {}
}

@SkipRateLimit()
class Unlimited {
  metrics(this: void): void {}
}

/** Contexto HTTP mínimo: a classe e o método da rota, o IP e a resposta (para o Retry-After). */
function contextFor(target: object, handler: () => void, ip: string) {
  const headers: Record<string, string> = {};
  const context = {
    getClass: () => target,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ setHeader: (name: string, value: string) => (headers[name] = value) }),
    }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

const statusOf = (run: () => unknown) => {
  try {
    run();
    return 200;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : 500;
  }
};

describe('RateLimitGuard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('respeita o limite da rota por IP e libera na janela seguinte', () => {
    vi.useFakeTimers();
    const guard = new RateLimitGuard(new Reflector());
    const { context, headers } = contextFor(Routes, Routes.prototype.login, '1.1.1.1');
    const other = contextFor(Routes, Routes.prototype.login, '2.2.2.2').context;

    expect([1, 2, 3].map(() => statusOf(() => guard.canActivate(context)))).toEqual([
      200, 200, 429,
    ]);
    expect(headers['Retry-After']).toBe('1');
    // Outro IP tem a própria contagem.
    expect(statusOf(() => guard.canActivate(other))).toBe(200);

    vi.advanceTimersByTime(1000);
    expect(statusOf(() => guard.canActivate(context))).toBe(200);
  });

  it('usa o limite padrão sem decorador e nenhum com SkipRateLimit', () => {
    const guard = new RateLimitGuard(new Reflector());
    const free = contextFor(Routes, Routes.prototype.free, '3.3.3.3').context;
    const statuses = Array.from({ length: DEFAULT_RATE_LIMIT.limit + 1 }, () =>
      statusOf(() => guard.canActivate(free)),
    );
    expect(statuses.at(-2)).toBe(200);
    expect(statuses.at(-1)).toBe(429);

    const metrics = contextFor(Unlimited, Unlimited.prototype.metrics, '3.3.3.3').context;
    for (let index = 0; index < DEFAULT_RATE_LIMIT.limit + 5; index++) {
      expect(guard.canActivate(metrics)).toBe(true);
    }
  });
});
