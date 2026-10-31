import { describe, expect, it } from 'vitest';
import { pairStartClock } from './avatars';

describe('relógio do clipe de par', () => {
  it('desconta o tempo que já passou desde o início no servidor', () => {
    // O servidor avisou há 400 ms; o clipe tem que começar 400 ms atrás no relógio local.
    expect(pairStartClock(10_000, 1_700_000_000_400, 1_700_000_000_000)).toBe(9_600);
  });

  it('evento que chega antes do início não anda para o futuro', () => {
    expect(pairStartClock(10_000, 1_700_000_000_000, 1_700_000_000_250)).toBe(10_000);
  });

  it('limita a divergência de relógio a 2 s', () => {
    // Relógio do navegador 10 min à frente do servidor: começa do zero, não numa fase absurda.
    expect(pairStartClock(10_000, 1_700_000_600_000, 1_700_000_000_000)).toBe(8_000);
  });
});
