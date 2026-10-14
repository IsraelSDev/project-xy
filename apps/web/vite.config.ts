import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Lê o .env da raiz só para configurar o dev server; estas variáveis não vão para o bundle.
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = env.API_PORT || '3000';
  const realtimePort = env.REALTIME_PORT || '2567';

  return {
    plugins: [react()],
    envDir: repoRoot,
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
