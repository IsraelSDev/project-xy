/**
 * Teste de restauração: restaura um backup num banco TEMPORÁRIO (<banco>_restore_check), compara a
 * contagem de linhas de cada tabela com o banco de origem e apaga o temporário. Nunca escreve no
 * banco principal. Uso: pnpm db:restore-check [arquivo.dump]   (padrão: o backup mais recente)
 */
import { createReadStream, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDbEnv, ROOT, rowCounts, run } from './db.ts';

const { user, database } = loadDbEnv();
const scratch = `${database}_restore_check`;

function latestBackup(): URL {
  const directory = new URL('backups/', ROOT);
  const dumps = readdirSync(directory)
    .filter((name) => name.endsWith('.dump'))
    .sort();
  const last = dumps.at(-1);
  if (!last) throw new Error('Nenhum backup em backups/. Rode antes: pnpm db:backup');
  return new URL(last, directory);
}

const file = process.argv[2]
  ? new URL(process.argv[2], `file://${process.cwd()}/`)
  : latestBackup();
console.log(`Restaurando ${fileURLToPath(file)} em ${scratch} (temporário)…`);

const psql = (sql: string) =>
  run(['psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]);

try {
  await psql(`DROP DATABASE IF EXISTS "${scratch}"`);
  await psql(`CREATE DATABASE "${scratch}"`);
  await run(
    ['pg_restore', '-U', user, '-d', scratch, '--no-owner', '--exit-on-error'],
    createReadStream(file),
  );

  const source = await rowCounts(user, database);
  const restored = await rowCounts(user, scratch);
  let mismatches = 0;
  for (const [table, count] of source) {
    const other = restored.get(table);
    const ok = other === count;
    if (!ok) mismatches++;
    console.log(
      `${ok ? 'ok ' : 'DIF'} ${table}: origem ${count}, restaurado ${other ?? 'ausente'}`,
    );
  }
  if (mismatches > 0) {
    console.error(
      `${mismatches} tabela(s) diferentes. Se o banco mudou depois do backup, isso é esperado; ` +
        'senão, o backup não é confiável.',
    );
    process.exitCode = 1;
  } else {
    console.log('Restauração conferida: todas as tabelas com a mesma contagem.');
  }
} finally {
  await psql(`DROP DATABASE IF EXISTS "${scratch}"`);
}
