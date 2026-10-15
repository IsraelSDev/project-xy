import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@3dx/contracts';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/password.js';
import { SESSION_COOKIE, SessionService } from '../src/auth/session.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'senha-bem-longa';

export interface TestUser {
  id: string;
  email: string;
  displayName: string;
  /** Cabeçalho `Cookie` com uma sessão válida deste usuário. */
  cookie: string;
}

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
  prisma: PrismaService;
  /** Cria usuário direto no banco (sem passar pelo limite de cadastro) e uma sessão para ele. */
  createUser(role?: Role): Promise<TestUser>;
  request(
    path: string,
    init?: RequestInit & { cookie?: string; json?: unknown },
  ): Promise<Response>;
  close(): Promise<void>;
}

/** Dados únicos por chamada: os testes rodam em paralelo no mesmo banco sem colidir. */
export const unique = () => randomUUID().slice(0, 8);

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  const prisma = app.get(PrismaService);
  const sessions = app.get(SessionService);
  const passwordHash = await hashPassword(PASSWORD);

  return {
    app,
    baseUrl,
    prisma,
    async createUser(role = 'USER') {
      const tag = unique();
      const user = await prisma.user.create({
        data: {
          email: `user-${tag}@example.com`,
          passwordHash,
          displayName: `User ${tag}`,
          displayNameKey: `user ${tag}`,
          birthDate: new Date('1990-01-01T00:00:00Z'),
          role,
        },
      });
      const { token } = await sessions.create(user.id);
      return { ...user, cookie: `${SESSION_COOKIE}=${token}` };
    },
    request(path, { cookie, json, headers, ...init } = {}) {
      return fetch(`${baseUrl}${path}`, {
        ...init,
        method: init.method ?? (json === undefined ? 'GET' : 'POST'),
        headers: {
          origin: ORIGIN,
          ...(json === undefined ? {} : { 'content-type': 'application/json' }),
          ...(cookie ? { cookie } : {}),
          ...(headers as Record<string, string> | undefined),
        },
        body: json === undefined ? undefined : JSON.stringify(json),
      });
    },
    close: () => app.close(),
  };
}
