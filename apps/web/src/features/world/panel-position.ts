/** Posição de um painel flutuante da tela (canto superior esquerdo, em px). */
export interface PanelPoint {
  x: number;
  y: number;
}

/** Distância mínima das bordas: o painel nunca some atrás da janela. */
export const PANEL_MARGIN = 8;

/** Mantém o painel inteiro dentro da janela (ou encostado na borda quando ele é maior). */
export function clampPanelPosition(
  point: PanelPoint,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  minimum: Partial<PanelPoint> = {},
): PanelPoint {
  const minX = minimum.x ?? PANEL_MARGIN;
  const minY = minimum.y ?? PANEL_MARGIN;
  const maxX = Math.max(minX, viewport.width - size.width - PANEL_MARGIN);
  const maxY = Math.max(minY, viewport.height - size.height - PANEL_MARGIN);
  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY),
  };
}

/** Lê a posição salva no `localStorage`; qualquer coisa inválida é ignorada. */
export function parseStoredPosition(raw: string | null): PanelPoint | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return undefined;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return undefined;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return undefined;
  }
}
