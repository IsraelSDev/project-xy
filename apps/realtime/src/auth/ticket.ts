import { createPublicKey } from 'node:crypto';
import { RealtimeTicketClaims, TICKET_AUDIENCE, TICKET_ISSUER } from '@3dx/contracts';
import { jwtVerify } from 'jose';

/** Quem está conectado, segundo a API (dados assinados; nada aqui vem do cliente sem prova). */
export interface Identity {
  userId: string;
  name: string;
  /** Ids que este usuário bloqueou. */
  blocked: ReadonlySet<string>;
}

export type TicketVerifier = (ticket: string) => Promise<Identity | undefined>;

/**
 * Confere tickets emitidos pela API: assinatura Ed25519 com a chave pública, emissor, audiência,
 * validade e formato das claims. Ticket inválido ou expirado vira `undefined`.
 */
export function createTicketVerifier(publicKeyBase64: string): TicketVerifier {
  const publicKey = createPublicKey({
    key: Buffer.from(publicKeyBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });

  return async (ticket) => {
    try {
      const { payload } = await jwtVerify(ticket, publicKey, {
        issuer: TICKET_ISSUER,
        audience: TICKET_AUDIENCE,
        algorithms: ['EdDSA'],
      });
      const claims = RealtimeTicketClaims.parse(payload);
      return { userId: claims.sub, name: claims.name, blocked: new Set(claims.blocked) };
    } catch {
      return undefined;
    }
  };
}
