import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SessionUser } from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service';

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

  /** Usuário dono de uma sessão válida, ou `undefined` (inexistente ou expirada). */
  async resolve(token: string): Promise<SessionUser | undefined> {
    const session = await this.prisma.session.findUnique({
      where: { id: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) return undefined;

    const { id, email, displayName, role } = session.user;
    return { id, email, displayName, role };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: hashToken(token) } });
  }
}
