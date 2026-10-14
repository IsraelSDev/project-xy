import { resolve } from 'node:path';

/** Os testes rodam a partir de apps/api (pnpm --filter / pnpm -r). */
export const API_DIR = process.cwd();

/** URL do banco de testes: o mesmo servidor do DATABASE_URL, com o nome do banco + `_test`. */
export function testDatabaseUrl(): string {
  try {
    process.loadEnvFile(resolve(API_DIR, '../../.env'));
  } catch {
    // Sem .env: o ambiente do processo precisa ter DATABASE_URL.
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL não definida. Rode pnpm env:setup e suba o banco com pnpm db:up.',
    );
  }
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
  return url.toString();
}
