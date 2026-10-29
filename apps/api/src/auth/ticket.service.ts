import { createPrivateKey, randomUUID, type KeyObject } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MAX_BLOCKS_IN_TICKET,
  MAX_FRIENDS,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  TICKET_TTL_SECONDS,
  parseAvatar,
  type RealtimeTicketResponse,
  type SessionUser,
} from '@3dx/contracts';
import { SignJWT } from 'jose';
import { readRequired } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { activeSanction } from './sanctions.js';

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
    const { avatar, profilePhoto } = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { avatar: true, profilePhoto: { select: { updatedAt: true } } },
    });
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: user.id },
      select: { blockedId: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_BLOCKS_IN_TICKET,
    });

    const friendships = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userAId: user.id }, { userBId: user.id }] },
      select: { userAId: true, userBId: true },
      orderBy: { acceptedAt: 'desc' },
      take: MAX_FRIENDS,
    });

    const now = new Date();
    const mute = await this.prisma.sanction.findFirst({
      where: { userId: user.id, ...activeSanction('MUTE', now) },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });

    const expiresAt = new Date(now.getTime() + TICKET_TTL_SECONDS * 1000);
    const ticket = await new SignJWT({
      name: user.displayName,
      role: user.role,
      ageAssurance: user.ageAssurance,
      blocked: blocks.map((block) => block.blockedId),
      avatar: parseAvatar(avatar),
      photoUpdatedAt: profilePhoto?.updatedAt.toISOString() ?? null,
      mutedUntil: mute?.endsAt?.getTime() ?? null,
      friends: friendships.map((pair) => (pair.userAId === user.id ? pair.userBId : pair.userAId)),
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
