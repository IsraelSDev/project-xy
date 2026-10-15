import { defineConfig } from 'prisma/config';

// O CLI do Prisma não lê o .env da raiz do monorepo; em produção as variáveis vêm do ambiente.
try {
  process.loadEnvFile('../../.env');
} catch {
  // Sem .env: usa só o ambiente do processo.
}

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` (postinstall) não conecta no banco: sem DATABASE_URL ele precisa funcionar,
  // porque a instalação roda em lugares sem o banco (ex.: build do web na Vercel). Os comandos que
  // conectam (migrate, db) falham com erro claro do próprio Prisma quando a URL falta.
  ...(url ? { datasource: { url } } : {}),
});
