/** Lê uma porta TCP de `process.env`; usa `fallback` se ausente e falha na inicialização se inválida. */
export function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${name} inválida: "${raw}". Use um inteiro entre 0 e 65535.`);
  }
  return port;
}
