import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPort } from './config.ts';

describe('readPort', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('usa o fallback quando a variável não existe', () => {
    vi.stubEnv('TEST_PORT', undefined);
    expect(readPort('TEST_PORT', 2567)).toBe(2567);
  });

  it('lê a porta da variável', () => {
    vi.stubEnv('TEST_PORT', '4000');
    expect(readPort('TEST_PORT', 2567)).toBe(4000);
  });

  it.each(['abc', '-1', '70000', '3.5'])('rejeita valor inválido "%s"', (value) => {
    vi.stubEnv('TEST_PORT', value);
    expect(() => readPort('TEST_PORT', 2567)).toThrow(/TEST_PORT inválida/);
  });
});
