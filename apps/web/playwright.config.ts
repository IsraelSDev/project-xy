import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Testes de ponta a ponta no navegador contra a pilha local inteira (web, API, realtime e Postgres).
 * Pré-requisito: banco no ar (`pnpm db:up`). Servidores já rodando (`pnpm dev`) são reaproveitados.
 * Rodar: pnpm --filter @3dx/web e2e
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    launchOptions: {
      // WebGL por software no Chromium headless (o mundo 3D precisa de WebGL 2).
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: [
    {
      command: 'pnpm --filter @3dx/api dev',
      url: 'http://127.0.0.1:3000/health',
      cwd: repoRoot,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @3dx/realtime dev',
      url: 'http://127.0.0.1:2567/health',
      cwd: repoRoot,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @3dx/web dev',
      url: 'http://localhost:5173',
      cwd: repoRoot,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
