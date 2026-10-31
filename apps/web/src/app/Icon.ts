import { createElement } from 'react';

/** Ícones simples embutidos em SVG para não adicionar dependências de ícones. */
const ICON_PATHS: Record<string, string> = {
  // Cada forma é um irmão autocontido (`<path .../>`); nunca aninhar `<circle>`/`<path>` dentro de
  // um `<path>`, senão o SVG fica inválido e só o primeiro traço aparece.
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  profile:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><line x1="5.5" y1="17" x2="12.5" y2="17"/><line x1="15" y1="9" x2="19" y2="9"/><line x1="15" y1="13" x2="19" y2="13"/>',
  credit:
    '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.89"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  shop: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  friends:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  account:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  wardrobe:
    '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  logOut:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  admin:
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  // Roupa: usados como reserva quando a miniatura da peça ainda não foi gerada.
  shirt:
    '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  coat: '<path d="M6 3h3l3 3 3-3h3v18H6z"/><path d="M12 6v15"/>',
  pants: '<path d="M7 3h10v18h-4l-1-8-1 8H7z"/>',
  underwear: '<path d="M3 6h18l-1 5a8 8 0 0 1-8 7 8 8 0 0 1-8-7z"/>',
  dress: '<path d="M9 3h6l1 5 3 12H5L8 8z"/>',
  hat: '<path d="M4 17h16"/><path d="M7 17V9a5 5 0 0 1 10 0v8"/>',
  glasses:
    '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 12h6"/><path d="M3 10l2-2"/><path d="M21 10l-2-2"/>',
  mask: '<path d="M3 8c3-2 6-2 9-1 3-1 6-1 9 1 0 5-4 9-9 9S3 13 3 8z"/><path d="M8 11c1 0 2 1 2 2"/><path d="M16 11c-1 0-2 1-2 2"/>',
  shoe: '<path d="M3 17v-3h5l3 2h4l4 2a2 2 0 0 1-1 4H5a2 2 0 0 1-2-2z"/>',
  sock: '<path d="M8 3h6v9a4 4 0 0 0 4 4h1a3 3 0 0 1 0 6h-3a8 8 0 0 1-8-8z"/>',
  glove:
    '<path d="M8 13V5a2 2 0 0 1 4 0v6"/><path d="M12 11V4a2 2 0 0 1 4 0v7"/><path d="M16 11V6a2 2 0 0 1 4 0v9a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-3a2 2 0 0 1 4 0v3"/>',
  // Ações do painel da sala.
  sit: '<path d="M6 3v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3"/><path d="M6 11h12"/><path d="M8 15v6"/><path d="M16 15v6"/>',
  wave: '<path d="M8 13V5a2 2 0 0 1 4 0v6"/><path d="M12 11V4a2 2 0 0 1 4 0v7"/><path d="M16 11V6a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-3a2 2 0 0 1 4 0v3"/>',
  dance: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M9 18V5l12-2v13"/>',
  beer: '<path d="M5 8h10v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 11h2a3 3 0 0 1 0 6h-2"/><path d="M8 4v4"/><path d="M11 4v4"/>',
  hug: '<path d="M12 21s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 11c0 5.5-8 10-8 10z"/>',
  pin: '<path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  cake: '<path d="M4 21h16"/><path d="M5 21v-8h14v8"/><path d="M8 13V9"/><path d="M12 13V8"/><path d="M16 13V9"/>',
};

/** Monta o HTML de um ícone SVG. Não usa template literais para evitar conflito com .tsx. */
export function iconHtml(name: string, size: number, color?: string): string {
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
