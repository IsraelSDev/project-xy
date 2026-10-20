import { startTransition, useCallback, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * `useState` para overlays animados pelo `<ViewTransition>`.
 *
 * Fechar passa por `startTransition` (o React só anima atualizações não urgentes, e é isso
 * que permite a saída suave). Abrir continua urgente: a entrada é feita pelo CSS do
 * componente e não precisa de um snapshot da página inteira.
 */
export function useOverlay<T>(initial: T): readonly [T, Dispatch<SetStateAction<T>>] {
  const [open, setOpen] = useState(initial);
  const update = useCallback<Dispatch<SetStateAction<T>>>((value) => {
    if (typeof value === 'function' || !isClosed(value)) setOpen(value);
    else startTransition(() => setOpen(value));
  }, []);
  return [open, update] as const;
}

/** Valores que fecham um overlay neste app: `false` (booleanos) e `undefined` (alvos). */
function isClosed(value: unknown): boolean {
  return value === false || value === undefined;
}
