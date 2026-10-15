/**
 * Cor estável por pessoa (a mesma em toda tela), derivada do id. Tons claros o bastante para ler
 * sobre os painéis escuros.
 */
export function identityColor(id: string): string {
  // FNV-1a: ids parecidos (UUIDs) ainda caem em tons bem diferentes.
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `hsl(${hash % 360} 70% 68%)`;
}

/** Inicial para o avatar de texto. */
export const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?';
