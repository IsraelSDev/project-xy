/**
 * Backup do Postgres local: `pg_dump` em formato custom (comprimido, restaurável com pg_restore),
 * salvo em backups/<banco>-<data>.dump. Uso: pnpm db:backup
 */
import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { composeExec, loadDbEnv, ROOT } from './db.ts';

const { user, database } = loadDbEnv();
const directory = new URL('backups/', ROOT);
mkdirSync(directory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = new URL(`${database}-${stamp}.dump`, directory);

const child = composeExec(['pg_dump', '-U', user, '-d', database, '-Fc'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
child.stdout?.pipe(createWriteStream(file));
child.on('close', (code) => {
  if (code !== 0) {
    console.error(`pg_dump falhou (código ${code}). O banco está no ar? (pnpm db:up)`);
    process.exit(1);
  }
  const size = Math.round(statSync(file).size / 1024);
  console.log(`Backup salvo: ${fileURLToPath(file)} (${size} KiB)`);
});
