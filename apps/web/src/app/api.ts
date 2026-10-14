/** Erro de uma chamada à API, com a mensagem pronta para mostrar ao usuário. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ErrorBody {
  message?: unknown;
  issues?: { message?: unknown }[];
}

/** Extrai a mensagem dos formatos de erro do Nest (`message` texto, ou objeto com `issues`). */
function messageOf(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null) {
    const { message, issues } = body as ErrorBody;
    const firstIssue = issues?.[0]?.message;
    if (typeof message === 'string' && typeof firstIssue === 'string') {
      return `${message} ${firstIssue}`;
    }
    if (typeof message === 'string') return message;
  }
  if (status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  if (status >= 500) return 'Servidor indisponível. Tente de novo em instantes.';
  return 'Não foi possível concluir a operação.';
}

/**
 * Chamada à API pelo proxy `/api` (mesma origem: o cookie de sessão vai junto e não há CORS).
 * Corpo sempre JSON: a API recusa outros formatos, o que também protege contra CSRF.
 */
export async function api<T>(
  path: string,
  options: { method?: string; json?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? (options.json === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: options.json === undefined ? {} : { 'content-type': 'application/json' },
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(response.status, messageOf(body, response.status));
  return body as T;
}
