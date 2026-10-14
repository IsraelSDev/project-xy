/** Utilitários dos scripts de banco: rodam comandos dentro do container do Postgres local. */
import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export const ROOT = new URL('..', import.meta.url);

export function loadDbEnv(): { user: string; database: string } {
  const file = new URL('.env', ROOT);
  if (!existsSync(file)) throw new Error('Arquivo .env não encontrado (cp .env.example .env).');
  const env = parseEnv(readFileSync(file, 'utf8'));
  if (!env.POSTGRES_USER || !env.POSTGRES_DB) {
    throw new Error('Defina POSTGRES_USER e POSTGRES_DB no .env.');
  }
  return { user: env.POSTGRES_USER, database: env.POSTGRES_DB };
}

/** `docker compose exec -T postgres <args>`: mesmo container de `pnpm db:up`. */
export function composeExec(args: string[], options: SpawnOptions = {}) {
  return spawn(
    'docker',
    [
      'compose',
      '--env-file',
      '.env',
      '-f',
      'infra/docker/compose.yaml',
      'exec',
      '-T',
      'postgres',
      ...args,
    ],
    { cwd: ROOT, ...options },
  );
}

/** Roda um comando no container e devolve a saída (texto). Falha se o código de saída não for 0. */
export function run(args: string[], input?: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = composeExec(args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    if (input && child.stdin) input.pipe(child.stdin);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${args[0]} terminou com código ${code}: ${stderr.trim()}`));
    });
  });
}

/** Contagem de linhas por tabela do schema public (para comparar origem e restauração). */
export async function rowCounts(user: string, database: string): Promise<Map<string, number>> {
  const tables = (
    await run([
      'psql',
      '-U',
      user,
      '-d',
      database,
      '-tAc',
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    ])
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const counts = new Map<string, number>();
  for (const table of tables) {
    const quoted = `"${table.replaceAll('"', '""')}"`;
    const output = await run([
      'psql',
      '-U',
      user,
      '-d',
      database,
      '-tAc',
      `SELECT count(*) FROM ${quoted}`,
    ]);
    counts.set(table, Number(output.trim()));
  }
  return counts;
}
