import { ViewTransition, type ReactNode } from 'react';

/**
 * Troca de tela inteira (abertura, entrada e mundo): crossfade com deslocamento curto.
 *
 * A animação só acontece porque as mudanças que montam/desmontam a tela passam por
 * `startTransition` (ver `useSession`). As classes estão no app.css.
 */
export function ScreenTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="screen-enter" exit="screen-exit" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Overlays (diálogos, painéis e vestiário): a entrada continua no CSS; a saída é
 * animada pelo React, porque CSS sozinho não anima um elemento que desmonta.
 *
 * Quem abre/fecha precisa usar `startTransition` (ver `useOverlay`).
 */
export function OverlayTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="overlay-exit" default="none">
      {children}
    </ViewTransition>
  );
}
