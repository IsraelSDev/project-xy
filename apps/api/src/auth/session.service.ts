import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request } from 'express';
import type { SessionUser } from '@3dx/contracts';
import { isProduction } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { activeSanction } from './sanctions.js';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** httpOnly: o JavaScript da página não lê o token. Lax: o cookie não vai em POST de outro site. */
export const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction(),
  path: '/',
});

/** O banco guarda só o hash do token: quem lê o banco não consegue se passar por ninguém. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class SessionService {
  /** Sessão já resolvida por requisição: rate limit e SessionGuard consultam o banco uma vez só. */
  private readonly byRequest = new WeakMap<Request, Promise<SessionUser | undefined>>();

  constructor(private readonly prisma: PrismaService) {}

  /** Usuário da sessão do cookie desta requisição (ver `resolve`), consultado uma vez por requisição. */
  forRequest(request: Request): Promise<SessionUser | undefined> {
    let user = this.byRequest.get(request);
    if (!user) {
      const token: unknown = request.cookies?.[SESSION_COOKIE];
      user = typeof token === 'string' ? this.resolve(token) : Promise.resolve(undefined);
      this.byRequest.set(request, user);
    }
    return user;
  }

  /** Cria a sessão e devolve o token (vai só para o cookie httpOnly). */
  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const now = new Date();
    // Retenção: sessões vencidas não servem para nada; cada login novo apaga as de todo mundo
    // (índice em expiresAt). Sem tarefa agendada, que a hospedagem serverless não tem.
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
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
