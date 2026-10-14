import { readAllowedOrigins, readPort, readRequired } from './config.ts';
import { createRealtimeServer } from './server.ts';

// Plataformas de hospedagem (ex.: Render) definem a porta em PORT; localmente vale REALTIME_PORT.
const port = process.env.REALTIME_PORT ? readPort('REALTIME_PORT', 2567) : readPort('PORT', 2567);
const server = createRealtimeServer(
  {
    reconnectSeconds: 20,
    ticketGraceSeconds: 30,
    ticketPublicKey: readRequired('REALTIME_TICKET_PUBLIC_KEY'),
  },
  {
    metricsToken: process.env.METRICS_TOKEN || undefined,
    allowedOrigins: readAllowedOrigins(),
  },
);

await server.listen(port);
console.log(`realtime ouvindo em http://localhost:${port} (health: /health)`);
