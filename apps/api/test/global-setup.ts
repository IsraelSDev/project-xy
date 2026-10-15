import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import pg from 'pg';
import { API_DIR, testDatabaseUrl } from './database.js';

/**
 * Antes dos testes: garante que o banco `<db>_test` existe e está com todas as migrações.
 * Os testes nunca tocam no banco de desenvolvimento.
 */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const database = decodeURIComponent(url.pathname.slice(1));

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error('Postgres inacessível para os testes da API. Suba o banco: pnpm db:up', {
      cause: error,
    });
  }
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (rowCount === 0) await client.query(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);
  } finally {
    await client.end();
  }

  // CLI do Prisma pelo próprio Node: não depende do pnpm (nem de shell) para os testes rodarem.
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
