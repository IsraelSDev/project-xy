import { readPort } from './config.ts';
import { createRealtimeServer } from './server.ts';

const port = readPort('REALTIME_PORT', 2567);
const server = createRealtimeServer();

await server.listen(port);
console.log(`realtime ouvindo em http://localhost:${port} (health: /health)`);
