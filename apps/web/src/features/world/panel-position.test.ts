import { describe, expect, it } from 'vitest';
import { PANEL_MARGIN, clampPanelPosition, parseStoredPosition } from './panel-position';

const viewport = { width: 1000, height: 800 };
const size = { width: 240, height: 200 };

describe('posição dos painéis', () => {
  it('mantém o painel inteiro dentro da janela', () => {
    expect(clampPanelPosition({ x: 100, y: 120 }, size, viewport)).toEqual({ x: 100, y: 120 });
    expect(clampPanelPosition({ x: -50, y: -20 }, size, viewport)).toEqual({
      x: PANEL_MARGIN,
      y: PANEL_MARGIN,
    });
    expect(clampPanelPosition({ x: 5000, y: 5000 }, size, viewport)).toEqual({
      x: viewport.width - size.width - PANEL_MARGIN,
      y: viewport.height - size.height - PANEL_MARGIN,
    });
  });

  it('em tela menor que o painel, encosta na margem', () => {
    expect(
      clampPanelPosition(
        { x: 400, y: 400 },
        { width: 900, height: 700 },
        { width: 800, height: 600 },
      ),
    ).toEqual({
      x: PANEL_MARGIN,
      y: PANEL_MARGIN,
    });
  });

  it('respeita o topo reservado (barra superior do app)', () => {
    expect(clampPanelPosition({ x: 100, y: 0 }, size, viewport, { y: 72 })).toEqual({
      x: 100,
      y: 72,
    });
  });
});

describe('posição salva', () => {
  it('lê um par de números', () => {
    expect(parseStoredPosition('{"x":12,"y":34}')).toEqual({ x: 12, y: 34 });
    expect(parseStoredPosition('{"x":-10.5,"y":0}')).toEqual({ x: -10.5, y: 0 });
  });

  it('ignora lixo e valores não finitos', () => {
    expect(parseStoredPosition(null)).toBeUndefined();
    expect(parseStoredPosition('')).toBeUndefined();
    expect(parseStoredPosition('nada')).toBeUndefined();
    expect(parseStoredPosition('{"x":"12","y":34}')).toBeUndefined();
    expect(parseStoredPosition('{"x":null,"y":34}')).toBeUndefined();
  });
});
