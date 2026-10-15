import type { IncomingMessage, ServerResponse } from 'node:http';
import helmetImport, { type HelmetOptions } from 'helmet';

type Helmet = (
  options?: Readonly<HelmetOptions>,
) => (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;

/**
 * O helmet publica tipos ESM (index.d.mts) e CJS (index.d.cts). Localmente o TypeScript resolve os
 * ESM e o import default é a função; o build da Vercel resolve os CJS e o mesmo import vira o objeto
 * do módulo, com a função em `.default` (TS2349). Em execução o default é sempre a função; a
 * normalização só existe para compilar nos dois casos.
 */
const exported: unknown = helmetImport;
export const helmet = (
  typeof exported === 'function' ? exported : (exported as { default: unknown }).default
) as Helmet;
