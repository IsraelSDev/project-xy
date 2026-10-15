/** Lê uma porta TCP de `process.env`; usa `fallback` se ausente e falha na inicialização se inválida. */
export function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${name} inválida: "${raw}". Use um inteiro entre 0 e 65535.`);
  }
  return port;
}

/** Lê uma variável obrigatória; falha na inicialização com mensagem clara se faltar. */
export function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} não definida. Em desenvolvimento, rode: pnpm env:setup`);
  }
  return value;
}

/**
 * Origens do navegador que podem chamar o realtime (CORS do matchmaking e das rotas HTTP).
 * Vazio = http://localhost:5173. Várias: separadas por vírgula (mesma variável da API).
 */
export function readAllowedOrigins(): string[] {
  const raw = process.env.WEB_ORIGIN || 'http://localhost:5173';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of origins) {
    // O navegador manda a origem completa (esquema + host [+ porta]); sem isso nada casa.
    if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
      throw new Error(
        `WEB_ORIGIN inválida: "${origin}". Use a origem completa, ex.: https://site.vercel.app`,
      );
    }
  }
  return origins;
}
