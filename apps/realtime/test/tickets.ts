import { generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto';
import { DEFAULT_AVATAR, TICKET_AUDIENCE, TICKET_ISSUER, type AvatarConfig } from '@3dx/contracts';
import { SignJWT } from 'jose';

export interface TicketUser {
  sub: string;
  name: string;
  blocked?: string[];
  avatar?: AvatarConfig;
}

/** Faz o papel da API nos testes: par de chaves próprio e emissão de tickets. */
export function createTicketIssuer() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const intruder = generateKeyPairSync('ed25519').privateKey;

  const sign = (user: TicketUser, key: KeyObject, issuedAt: number, expiresAt: number) =>
    new SignJWT({
      name: user.name,
      blocked: user.blocked ?? [],
      avatar: user.avatar ?? DEFAULT_AVATAR,
    })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(user.sub)
      .setIssuer(TICKET_ISSUER)
      .setAudience(TICKET_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(key);

  const now = () => Math.floor(Date.now() / 1000);

  return {
    publicKeyBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    newUser: (): TicketUser => ({ sub: randomUUID(), name: `Pessoa ${randomUUID().slice(0, 6)}` }),
    issue: (user: TicketUser) => sign(user, privateKey, now(), now() + 60),
    /** Assinado por outra chave: o realtime precisa recusar. */
    forge: (user: TicketUser) => sign(user, intruder, now(), now() + 60),
    expired: (user: TicketUser) => sign(user, privateKey, now() - 120, now() - 60),
  };
}
