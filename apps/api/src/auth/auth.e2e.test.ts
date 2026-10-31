import { createPublicKey } from 'node:crypto';
import {
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  TICKET_TTL_SECONDS,
  type RealtimeTicketResponse,
} from '@3dx/contracts';
import { jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PASSWORD, unique, type TestApp } from '../../test/test-app.js';

const sessionCookie = (response: { headers: { get(name: string): string | null } }) =>
  response.headers.get('set-cookie') ?? '';

describe('autenticação', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('login: senha errada e e-mail inexistente têm a mesma resposta', async () => {
    const user = await t.createUser();

    const wrongPassword = await t.request('/auth/login', {
      json: { email: user.email, password: 'senha-errada-123' },
    });
    const unknownEmail = await t.request('/auth/login', {
      json: { email: `ninguem-${unique()}@example.com`, password: PASSWORD },
    });
    const ok = await t.request('/auth/login', { json: { email: user.email, password: PASSWORD } });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownEmail.json());
    expect(ok.status).toBe(200);
    expect(sessionCookie(ok)).toMatch(/^sid=/);
  });

  it('logout revoga a sessão no servidor (o cookie antigo deixa de valer)', async () => {
    const user = await t.createUser();

    const logout = await t.request('/auth/logout', { method: 'POST', cookie: user.cookie });
    const me = await t.request('/auth/me', { cookie: user.cookie });

    expect(logout.status).toBe(204);
    expect(me.status).toBe(401);
  });

  it('recusa requisição que altera estado vinda de outra origem (CSRF)', async () => {
    const user = await t.createUser();

    const response = await t.request('/auth/realtime-ticket', {
      method: 'POST',
      cookie: user.cookie,
      headers: { origin: 'https://site-malicioso.example' },
    });

    expect(response.status).toBe(403);
  });

  it('ticket do realtime: assinado pela API, curto e com os bloqueios do usuário', async () => {
    const user = await t.createUser();
    const other = await t.createUser();
    await t.prisma.block.create({ data: { blockerId: user.id, blockedId: other.id } });
    // A versão da foto do perfil viaja no ticket (a lista da sala usa como `?v=`).
    await t.prisma.profilePhoto.create({
      data: { userId: user.id, mime: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    });

    const response = await t.request('/auth/realtime-ticket', {
      method: 'POST',
      cookie: user.cookie,
    });
    expect(response.status).toBe(200);
    const { ticket } = (await response.json()) as RealtimeTicketResponse;

    const publicKey = createPublicKey({
      key: Buffer.from(process.env.REALTIME_TICKET_PUBLIC_KEY ?? '', 'base64'),
      format: 'der',
      type: 'spki',
    });
    const { payload } = await jwtVerify(ticket, publicKey, {
      issuer: TICKET_ISSUER,
      audience: TICKET_AUDIENCE,
    });
    expect(payload).toMatchObject({ sub: user.id, name: user.displayName, blocked: [other.id] });
    expect(typeof payload.photoUpdatedAt).toBe('string');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBeLessThanOrEqual(TICKET_TTL_SECONDS);
  });

  it('ticket exige sessão', async () => {
    const response = await t.request('/auth/realtime-ticket', { method: 'POST' });
    expect(response.status).toBe(401);
  });
});
