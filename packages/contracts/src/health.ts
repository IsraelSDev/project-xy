export type ServiceName = 'api' | 'realtime';

/** Corpo de `GET /health` da API e do servidor realtime. */
export interface HealthResponse {
  status: 'ok';
  service: ServiceName;
}
