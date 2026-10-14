/**
 * Endereço do servidor realtime. Sem `VITE_REALTIME_URL`, usa `/realtime` na mesma origem,
 * que o dev server do Vite repassa para o processo local.
 */
export const REALTIME_URL =
  import.meta.env.VITE_REALTIME_URL || `${window.location.origin}/realtime`;
