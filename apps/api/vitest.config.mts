import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testes de integração usam o Postgres local (pnpm db:up) num banco separado: <db>_test.
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
