import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Pacotes do workspace pelo fonte .ts (export @3dx/source), sem precisar do build deles.
  // As demais são as condições padrão do Vite para Node (o vite não é dependência direta aqui).
  ssr: { resolve: { conditions: ['@3dx/source', 'module', 'node', 'development|production'] } },
  test: {
    // Testes de integração usam o Postgres local (pnpm db:up) num banco separado: <db>_test.
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
