import { createPublicKey } from 'node:crypto';
import {
  AgeAssurance,
  RealtimeTicketClaims,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  type AvatarConfig,
  type Role,
} from '@3dx/contracts';
import { jwtVerify } from 'jose';

/** Quem está conectado, segundo a API (dados assinados; nada aqui vem do cliente sem prova). */
export interface Identity {
  userId: string;
  name: string;
  /** Papel da conta (para identificar a equipe e autorizar o anúncio). */
  role: Role;
  /** Garantia de idade da conta (só para uso interno da sala; nunca transmitido aos clientes). */
  ageAssurance: AgeAssurance;
  /** Ids que este usuário bloqueou. */
  blocked: ReadonlySet<string>;
  /** Ids dos amigos (mensagem privada só entre amigos). */
  friends: ReadonlySet<string>;
  avatar: AvatarConfig;
  /** Silenciado pela moderação até este instante (epoch ms), ou `null`. */
  mutedUntil: number | null;
  /** Validade do ticket (epoch ms): sem um ticket novo até aqui, a pessoa sai da sala. */
  expiresAt: number;
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
      // `exp` é obrigatório aqui: ticket sem validade daria acesso eterno à sala.
      if (payload.exp === undefined) return undefined;
      return {
        userId: claims.sub,
        name: claims.name,
        role: claims.role,
        ageAssurance: claims.ageAssurance,
        blocked: new Set(claims.blocked),
        friends: new Set(claims.friends),
        avatar: claims.avatar,
        mutedUntil: claims.mutedUntil,
        expiresAt: payload.exp * 1000,
      };
    } catch {
      return undefined;
    }
  };
}
