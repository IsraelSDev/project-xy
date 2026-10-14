import { generateKeyPairSync } from 'node:crypto';
import { testDatabaseUrl } from './database';

// Cada processo de teste aponta para o banco de testes, nunca para o de desenvolvimento.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.WEB_ORIGIN = 'http://localhost:5173';

// Chaves próprias dos testes: não dependem do .env de quem roda.
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
process.env.REALTIME_TICKET_PRIVATE_KEY = privateKey
  .export({ format: 'der', type: 'pkcs8' })
  .toString('base64');
process.env.REALTIME_TICKET_PUBLIC_KEY = publicKey
  .export({ format: 'der', type: 'spki' })
  .toString('base64');
