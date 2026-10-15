import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
  loadEnv,
  type Plugin,
} from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Content-Security-Policy do build de produção (meta no index.html). Fica fora do dev server, que
 * injeta scripts inline para o hot reload. `frame-ancestors` e HSTS não valem em meta: vão como
 * cabeçalho no servidor que publicar o site (docs/operations/deploy.md).
 */
export function contentSecurityPolicy(realtimeUrl: string | undefined): string {
  const realtime = realtimeUrl ? new URL(realtimeUrl) : undefined;
  const realtimeSources = realtime ? [realtime.origin, realtime.origin.replace(/^http/, 'ws')] : [];
  return [
    "default-src 'self'",
    "script-src 'self'",
    // style="" do React (amostras de cor do editor de avatar).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${realtimeSources.join(' ')}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const cspPlugin = (realtimeUrl: string | undefined): Plugin => ({
  name: '3dx-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: contentSecurityPolicy(realtimeUrl),
      },
      injectTo: 'head-prepend',
    },
  ],
});

export default defineConfig(({ mode }) => {
  // Lê o .env da raiz só para configurar o dev server; estas variáveis não vão para o bundle.
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = env.API_PORT || '3000';
  const realtimePort = env.REALTIME_PORT || '2567';

  return {
    plugins: [react(), cspPlugin(env.VITE_REALTIME_URL || undefined)],
    envDir: repoRoot,
    // Pacotes do workspace pelo fonte .ts (export @3dx/source), no build, no dev e nos testes.
    resolve: { conditions: ['@3dx/source', ...defaultClientConditions] },
    ssr: { resolve: { conditions: ['@3dx/source', ...defaultServerConditions] } },
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        // HTTP (health, matchmaking) e WebSocket da sala.
        '/realtime': {
          target: `http://127.0.0.1:${realtimePort}`,
          ws: true,
          rewrite: (path) => path.replace(/^\/realtime/, ''),
        },
      },
    },
  };
});
