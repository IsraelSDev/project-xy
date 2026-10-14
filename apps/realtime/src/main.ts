import { readPort } from './config.js';
import { createRealtimeServer } from './server.js';

const port = readPort('REALTIME_PORT', 2567);
const server = createRealtimeServer();

await server.listen(port);
console.log(`realtime ouvindo em http://localhost:${port} (health: /health)`);
