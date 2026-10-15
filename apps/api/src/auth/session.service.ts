import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SessionUser } from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { activeSanction } from './sanctions.js';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** O banco guarda só o hash do token: quem lê o banco não consegue se passar por ninguém. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria a sessão e devolve o token (vai só para o cookie httpOnly). */
  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
    return { token, expiresAt };
  }

  /** Usuário dono de uma sessão válida, ou `undefined` (inexistente, expirada ou conta suspensa). */
  async resolve(token: string): Promise<SessionUser | undefined> {
    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { id: hashToken(token) },
      include: {
        user: {
          include: {
            // A suspensão apaga as sessões; conferir aqui também cobre um login concorrente.
            sanctions: { where: activeSanction('SUSPEND', now), select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (!session || session.expiresAt <= now || session.user.sanctions.length > 0) {
      return undefined;
    }

    const { id, email, displayName, role } = session.user;
    return { id, email, displayName, role };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: hashToken(token) } });
  }
}
