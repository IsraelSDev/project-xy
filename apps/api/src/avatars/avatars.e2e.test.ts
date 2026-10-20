import { createPublicKey } from 'node:crypto';
import { DEFAULT_AVATAR, type AvatarConfig, type RealtimeTicketResponse } from '@3dx/contracts';
import { decodeJwt, jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/test-app.js';

const CUSTOM: AvatarConfig = {
  ...DEFAULT_AVATAR,
  hair: '3dx_m_hair_15',
  hairColor: 'blonde',
  top: '3dx_m_top_shirt',
  topColor: 'red',
  accessory: 'glasses',
};

describe('avatar', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('conta nova começa com o avatar padrão', async () => {
    const user = await t.createUser();
    const response = await t.request('/avatar', { cookie: user.cookie });
    expect(await response.json()).toEqual(DEFAULT_AVATAR);
  });

  it('salva e recupera a configuração', async () => {
    const user = await t.createUser();

    const saved = await t.request('/avatar', { method: 'PUT', cookie: user.cookie, json: CUSTOM });
    const loaded = await t.request('/avatar', { cookie: user.cookie });

    expect(saved.status).toBe(200);
    expect(await loaded.json()).toEqual(CUSTOM);
  });

  it.each([
    ['item fora do catálogo', { ...CUSTOM, hair: 'qualquer' }, 403],
    ['URL de modelo externo', { ...CUSTOM, top: 'https://exemplo.test/x.glb' }, 403],
    ['campo extra', { ...CUSTOM, modelUrl: '/x.glb' }, 400],
  ])('recusa %s sem alterar o que estava salvo', async (_, body, expectedStatus) => {
    const user = await t.createUser();
    await t.request('/avatar', { method: 'PUT', cookie: user.cookie, json: CUSTOM });

    const response = await t.request('/avatar', { method: 'PUT', cookie: user.cookie, json: body });

    expect(response.status).toBe(expectedStatus);
    expect(await (await t.request('/avatar', { cookie: user.cookie })).json()).toEqual(CUSTOM);
  });

  it('exige sessão', async () => {
    expect((await t.request('/avatar')).status).toBe(401);
  });

  it('o ticket do realtime leva o avatar salvo', async () => {
    const user = await t.createUser();
    await t.request('/avatar', { method: 'PUT', cookie: user.cookie, json: CUSTOM });

    const { ticket } = (await (
      await t.request('/auth/realtime-ticket', { method: 'POST', cookie: user.cookie })
    ).json()) as RealtimeTicketResponse;

    const publicKey = createPublicKey({
      key: Buffer.from(process.env.REALTIME_TICKET_PUBLIC_KEY ?? '', 'base64'),
      format: 'der',
      type: 'spki',
    });
    await jwtVerify(ticket, publicKey);
    expect(decodeJwt(ticket).avatar).toEqual(CUSTOM);
  });

  it('valor corrompido no banco vira o avatar padrão, sem erro', async () => {
    const user = await t.createUser();
    await t.prisma.user.update({ where: { id: user.id }, data: { avatar: { hair: 'x' } } });

    const response = await t.request('/avatar', { cookie: user.cookie });

    expect(await response.json()).toEqual(DEFAULT_AVATAR);
  });
});
