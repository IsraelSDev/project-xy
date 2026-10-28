import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/generated/**',
      '**/prisma/seed.ts',
      // Vault do Obsidian (config + plugin empacotado), não é fonte do projeto.
      '.obsidian/**',
      // Rascunhos de verificação local, fora de qualquer tsconfig.
      'apps/web/.tmp-check.mjs',
      'apps/realtime/probe-pair.mjs',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['apps/api/**/*.ts', 'apps/realtime/**/*.ts', 'packages/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Arquivos JS de configuração ficam fora dos tsconfig; lint sem informação de tipos.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Estes testes leem o chunk JSON do GLB (schema sem tipos no projeto) e por isso usam `any`
  // nos acessos. TODO: tipar o subconjunto do glTF usado por eles e remover a exceção.
  {
    files: [
      'apps/web/src/game/rendering/club.test.ts',
      'apps/web/src/game/rendering/club7.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
