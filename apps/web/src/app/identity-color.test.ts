import { describe, expect, it } from 'vitest';
import { identityColor, initialOf } from './identity-color';

describe('identityColor', () => {
  it('é estável e espalha ids parecidos por tons diferentes', () => {
    const ids = [
      '0b9a2a52-5f3c-4c1e-9d3b-2f1f6c0e8a11',
      '0b9a2a52-5f3c-4c1e-9d3b-2f1f6c0e8a12',
      '0b9a2a52-5f3c-4c1e-9d3b-2f1f6c0e8a13',
      '0b9a2a52-5f3c-4c1e-9d3b-2f1f6c0e8a14',
    ];
    expect(identityColor(ids[0] ?? '')).toBe(identityColor(ids[0] ?? ''));
    const hues = ids.map((id) => Number(/hsl\((\d+)/.exec(identityColor(id))?.[1]));
    expect(new Set(hues).size).toBe(ids.length);
    expect(Math.max(...hues) - Math.min(...hues)).toBeGreaterThan(60);
  });

  it('inicial em maiúscula, com reserva para nome vazio', () => {
    expect(initialOf('  ana')).toBe('A');
    expect(initialOf('')).toBe('?');
  });
});
