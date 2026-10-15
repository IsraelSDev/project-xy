import { readAllowedOrigins, readPort, readRequired } from './config.ts';
import { createPgMessageLog } from './rooms/message-log-pg.ts';
import { createRealtimeServer } from './server.ts';

// Plataformas de hospedagem (ex.: Render) definem a porta em PORT; localmente vale REALTIME_PORT.
const port = process.env.REALTIME_PORT ? readPort('REALTIME_PORT', 2567) : readPort('PORT', 2567);
// As conversas vão para o mesmo banco da API; sem DATABASE_URL, nada é guardado (ex.: alvo de
// desenvolvimento sem banco). A administração lê pela API (ADR 0015).
const messageLog = process.env.DATABASE_URL
  ? createPgMessageLog(process.env.DATABASE_URL)
  : undefined;
const server = createRealtimeServer(
  {
    reconnectSeconds: 20,
    ticketGraceSeconds: 30,
    ticketPublicKey: readRequired('REALTIME_TICKET_PUBLIC_KEY'),
    ...(messageLog ? { messageLog } : {}),
  },
  {
    metricsToken: process.env.METRICS_TOKEN || undefined,
    notifySecret: process.env.NOTIFY_SECRET || undefined,
    allowedOrigins: readAllowedOrigins(),
  },
);

await server.listen(port);
console.log(`realtime ouvindo em http://localhost:${port} (health: /health)`);
