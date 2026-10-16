import { createElement } from 'react';

/** Ícones simples embutidos em SVG para não adicionar dependências de ícones. */
const ICON_PATHS: Record<string, string> = {
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"><circle cx="12" cy="7" r="4"/></path>',
  credit:
    '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.89"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  shop: '<circle cx="1" cy="12" r="3"/><circle cx="12" cy="12" r="3"/><circle cx="23" cy="12" r="3"/><path d="M1 12h23M12 2v20"/>',
  friends:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  account:
    '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  logOut:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
};

/** Monta o HTML de um ícone SVG. Não usa template literais para evitar conflito com .tsx. */
export function iconHtml(name: string, size: number, color: string): string {
  const d = ICON_PATHS[name];
  if (!d) return `<span>${name}</span>`;
  const stroke = color ?? 'currentColor';
  return (
    '<svg width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="' +
    stroke +
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    d +
    '</svg>'
  );
}

/** Componente de ícone. Renderiza o SVG como HTML interno para não depender de biblioteca de ícones. */
export function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const html = iconHtml(name, size, color);
  return createElement('span', {
    className: 'icon',
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      marginRight: '0.4rem',
      color,
    },
    dangerouslySetInnerHTML: { __html: html },
    'aria-hidden': 'true',
  });
}
