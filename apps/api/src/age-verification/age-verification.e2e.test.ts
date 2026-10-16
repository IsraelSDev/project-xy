import type { AgeVerificationStatus } from '@3dx/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PASSWORD, unique, type TestApp } from '../../test/test-app.js';

describe('verificação de idade', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('reporta SELF_DECLARED para conta recém-criada', async () => {
    const user = await t.createUser();
    const me = await t.request('/age-verification/me', { cookie: user.cookie });
    expect(me.status).toBe(200);
    const data = (await me.json()) as AgeVerificationStatus;
    expect(data.ageAssurance).toBe('SELF_DECLARED');
    expect(data.ageVerifiedAt).toBeNull();
    expect(data.ageVerificationMethod).toBeNull();
  });

  it('exige sessão válida', async () => {
    expect((await t.request('/age-verification/me')).status).toBe(401);
    expect(
      (await t.request('/age-verification/request', { json: { method: 'documento' } })).status,
    ).toBe(401);
    expect(
      (
        await t.request('/age-verification/complete', {
          json: { reference: 'x', method: 'documento' },
        })
      ).status,
    ).toBe(401);
  });

  it('solicita referência, confirma e promove a VERIFIED com auditoria', async () => {
    const user = await t.createUser();

    const solicitacao = await t.request('/age-verification/request', {
      cookie: user.cookie,
      json: { method: 'documento' },
    });
    expect(solicitacao.status).toBe(201);
    const { reference } = (await solicitacao.json()) as { reference: string };

    const solicitada = await t.prisma.moderationAction.findFirst({
      where: { actorId: user.id, action: 'age.verification.requested' },
    });
    expect(solicitada).not.toBeNull();

    const confirmacao = await t.request('/age-verification/complete', {
      cookie: user.cookie,
      json: { reference, method: 'documento' },
    });
    expect(confirmacao.status).toBe(200);
    const data = (await confirmacao.json()) as AgeVerificationStatus;
    expect(data.ageAssurance).toBe('VERIFIED');
    expect(data.ageVerificationMethod).toBe('documento');
    expect(data.ageVerifiedAt).not.toBeNull();

    const verificada = await t.prisma.moderationAction.findFirst({
      where: { actorId: user.id, action: 'age.verified' },
    });
    expect(verificada).not.toBeNull();

    const me = await t.request('/age-verification/me', { cookie: user.cookie });
    const meData = (await me.json()) as AgeVerificationStatus;
    expect(meData.ageAssurance).toBe('VERIFIED');
  });

  it('recusa referência inválida, vencida ou com método divergente', async () => {
    const user = await t.createUser();

    const inexistente = await t.request('/age-verification/complete', {
      cookie: user.cookie,
      json: { reference: 'nao-existe', method: 'documento' },
    });
    expect(inexistente.status).toBe(404);

    const vencidaRef = `vencida-${unique()}`;
    await t.prisma.ageVerificationReference.create({
      data: {
        reference: vencidaRef,
        userId: user.id,
        method: 'selfie',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const vencida = await t.request('/age-verification/complete', {
      cookie: user.cookie,
      json: { reference: vencidaRef, method: 'selfie' },
    });
    expect(vencida.status).toBe(404);

    const solicitacao = await t.request('/age-verification/request', {
      cookie: user.cookie,
      json: { method: 'documento' },
    });
    const { reference } = (await solicitacao.json()) as { reference: string };
    const metodoErrado = await t.request('/age-verification/complete', {
      cookie: user.cookie,
      json: { reference, method: 'selfie' },
    });
    expect(metodoErrado.status).toBe(404);
  });

  it('não solicita verificação se já estiver verificada', async () => {
    const user = await t.createUser();
    const solicitacao = await t.request('/age-verification/request', {
      cookie: user.cookie,
      json: { method: 'selfie' },
    });
    const { reference } = (await solicitacao.json()) as { reference: string };
    await t.request('/age-verification/complete', {
      cookie: user.cookie,
      json: { reference, method: 'selfie' },
    });

    const novamente = await t.request('/age-verification/request', {
      cookie: user.cookie,
      json: { method: 'documento' },
    });
    expect(novamente.status).toBe(409);
  });

  it('cadastro continua aceitando idade só declarada', async () => {
    const tag = unique();
    const response = await t.request('/auth/register', {
      json: {
        email: `nova-${tag}@Example.com`,
        password: PASSWORD,
        displayName: `Nova ${tag}`,
        birthDate: '1995-03-10',
      },
    });
    expect(response.status).toBe(201);
    const user = (await response.json()) as { id: string; ageAssurance: string };
    expect(user.ageAssurance).toBe('SELF_DECLARED');
  });
});
