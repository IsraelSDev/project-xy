import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Pacotes do workspace pelo fonte .ts (export @3dx/source), como o Node com --conditions.
  // As demais são as condições padrão do Vite para Node (o vite não é dependência direta aqui).
  ssr: { resolve: { conditions: ['@3dx/source', 'module', 'node', 'development|production'] } },
});
