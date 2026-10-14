import { readPort, readRequired } from './config.ts';
import { createRealtimeServer } from './server.ts';

const port = readPort('REALTIME_PORT', 2567);
const server = createRealtimeServer({
  reconnectSeconds: 20,
  ticketPublicKey: readRequired('REALTIME_TICKET_PUBLIC_KEY'),
});

await server.listen(port);
console.log(`realtime ouvindo em http://localhost:${port} (health: /health)`);
