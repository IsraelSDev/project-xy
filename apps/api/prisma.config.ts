import { defineConfig, env } from 'prisma/config';

// O CLI do Prisma não lê o .env da raiz do monorepo; em produção as variáveis vêm do ambiente.
try {
  process.loadEnvFile('../../.env');
} catch {
  // Sem .env: usa só o ambiente do processo.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
