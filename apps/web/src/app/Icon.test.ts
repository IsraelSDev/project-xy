import { describe, expect, it } from 'vitest';
import { iconHtml } from './Icon';

/** Todos os ícones usados pelo app (ver `App.tsx` e os diálogos). */
const ICONS = [
  'user',
  'credit',
  'send',
  'shop',
  'friends',
  'account',
  'shield',
  'wardrobe',
  'chat',
  'logOut',
  'admin',
];

describe('iconHtml', () => {
  it.each(ICONS)('%s gera um SVG com formas autocontidas', (name) => {
    const html = iconHtml(name, 16);
    expect(html, `ícone ${name} existe`).toMatch(/^<svg[^>]*>/);
    expect(html.endsWith('</svg>')).toBe(true);

    const open = html.match(/^<svg[^>]*>/)?.[0] ?? '';
    const inner = html.slice(open.length, html.length - '</svg>'.length);
    // Só formas autocontidas (`<path .../>`, `<circle .../>`): nada de `<circle>` aninhado dentro de
    // `<path>`, que é SVG inválido e faz o ícone sair pela metade.
    expect(inner, `formas de ${name}`).toMatch(/^(<[a-z]+[^<>]*\/>)*$/);
  });

  it('nome desconhecido cai no texto', () => {
    expect(iconHtml('inexistente', 16)).toBe('<span>inexistente</span>');
  });
});
