import { describe, expect, it } from 'vitest';
import { talkJaw } from './avatars';

describe('talkJaw', () => {
  it('fica entre fechada (0) e a abertura máxima (~0,16 rad)', () => {
    for (let seconds = 0; seconds < 3; seconds += 0.013) {
      const angle = talkJaw(seconds);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThanOrEqual(0.16 + 1e-9);
    }
  });

  it('abre e volta a fechar ao longo da conversa', () => {
    const samples = Array.from({ length: 300 }, (_, i) => talkJaw(i / 150));
    expect(Math.max(...samples)).toBeGreaterThan(0.05);
    expect(Math.min(...samples)).toBeLessThan(0.001);
  });
});
