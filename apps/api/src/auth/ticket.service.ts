import { createPrivateKey, randomUUID, type KeyObject } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MAX_BLOCKS_IN_TICKET,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  TICKET_TTL_SECONDS,
  type RealtimeTicketResponse,
  type SessionUser,
} from '@3dx/contracts';
import { SignJWT } from 'jose';
import { readRequired } from '../config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Emite o ticket que o navegador apresenta ao entrar na sala. Assinado com Ed25519: só a API tem a
 * chave privada; o realtime confere com a pública e nunca acessa o banco.
 */
@Injectable()
export class TicketService {
  private readonly privateKey: KeyObject = createPrivateKey({
    key: Buffer.from(readRequired('REALTIME_TICKET_PRIVATE_KEY'), 'base64'),
    format: 'der',
    type: 'pkcs8',
  });

  constructor(private readonly prisma: PrismaService) {}

  async issue(user: SessionUser): Promise<RealtimeTicketResponse> {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: user.id },
      select: { blockedId: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_BLOCKS_IN_TICKET,
    });

    const expiresAt = new Date(Date.now() + TICKET_TTL_SECONDS * 1000);
    const ticket = await new SignJWT({
      name: user.displayName,
      blocked: blocks.map((block) => block.blockedId),
    })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(user.id)
      .setIssuer(TICKET_ISSUER)
      .setAudience(TICKET_AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.privateKey);

    return { ticket, expiresAt: expiresAt.toISOString() };
  }
}
