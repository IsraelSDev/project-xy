/**
 * Completa o .env local com o que não deve ser digitado à mão:
 * - DATABASE_URL, montada a partir de POSTGRES_* (Docker Compose local);
 * - par de chaves Ed25519 dos tickets do realtime (a API assina, o realtime só verifica).
 * Não sobrescreve valores existentes nem imprime segredos. Uso: pnpm env:setup
 */
import { generateKeyPairSync } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const ENV_FILE = new URL('../.env', import.meta.url);

if (!existsSync(ENV_FILE)) {
  console.error('Arquivo .env não encontrado. Rode antes: cp .env.example .env');
  process.exit(1);
}

const env = parseEnv(readFileSync(ENV_FILE, 'utf8'));
const additions: Record<string, string> = {};

if (!env.DATABASE_URL) {
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT = '5432' } = env;
  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    console.error('Defina POSTGRES_USER, POSTGRES_PASSWORD e POSTGRES_DB no .env.');
    process.exit(1);
  }
  const credentials = `${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}`;
  additions.DATABASE_URL = `postgresql://${credentials}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}`;
}

if (!env.REALTIME_TICKET_PRIVATE_KEY || !env.REALTIME_TICKET_PUBLIC_KEY) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  additions.REALTIME_TICKET_PRIVATE_KEY = privateKey
    .export({ format: 'der', type: 'pkcs8' })
    .toString('base64');
  additions.REALTIME_TICKET_PUBLIC_KEY = publicKey
    .export({ format: 'der', type: 'spki' })
    .toString('base64');
}

const names = Object.keys(additions);
if (names.length === 0) {
  console.log('.env já está completo.');
} else {
  const lines = names.map((name) => `${name}=${additions[name]}`).join('\n');
  appendFileSync(ENV_FILE, `\n# Gerado por pnpm env:setup\n${lines}\n`);
  console.log(`Adicionado ao .env: ${names.join(', ')}`);
}
