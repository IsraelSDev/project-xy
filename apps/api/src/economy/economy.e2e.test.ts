import {
  DEFAULT_AVATAR,
  type Purchase,
  type ShopItem,
  type TransferResponse,
  type Wallet,
} from '@3dx/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PASSWORD, unique, type TestApp } from '../../test/test-app.js';

describe('economia e loja', () => {
  let t: TestApp;
  let itemTopId: string;
  let itemHairId: string;
  let itemInactiveId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.prisma.shopItem.deleteMany();
    itemTopId = (
      await t.prisma.shopItem.create({
        data: {
          kind: 'top',
          name: 'Jaqueta de couro',
          value: 'leather-jacket',
          price: 50,
          active: true,
        },
      })
    ).id;
    itemHairId = (
      await t.prisma.shopItem.create({
        data: {
          kind: 'hair',
          name: 'Moicano',
          value: 'mohawk',
          price: 200,
          active: true,
        },
      })
    ).id;
    itemInactiveId = (
      await t.prisma.shopItem.create({
        data: {
          kind: 'accessory',
          name: 'Item inativo',
          value: 'inativo',
          price: 10,
          active: false,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await t.close();
  });

  it('cadastro cria carteira com saldo inicial', async () => {
    const tag = unique();
    const register = await t.request('/auth/register', {
      json: {
        email: `Eco-${tag}@Example.com`,
        password: PASSWORD,
        displayName: `Eco ${tag}`,
        birthDate: '1990-01-01',
        acceptTerms: true,
      },
    });
    expect(register.status).toBe(201);
    const cookie = (register.headers.get('set-cookie') ?? '').split(';')[0];

    const response = await t.request('/economy/wallet', { cookie });
    expect(response.status).toBe(200);
    const wallet = (await response.json()) as Wallet;
    expect(wallet.balance).toBe(100);
  });

  it('usuario criado pelo helper começa com carteira zerada', async () => {
    const user = await t.createUser();
    const response = await t.request('/economy/wallet', { cookie: user.cookie });
    expect(response.status).toBe(200);
    const wallet = (await response.json()) as Wallet;
    expect(wallet.balance).toBe(0);
  });

  it('loja lista apenas itens ativos', async () => {
    const user = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: user.id, balance: 100 } });
    const response = await t.request('/economy/shop', { cookie: user.cookie });
    expect(response.status).toBe(200);
    const shop = (await response.json()) as ShopItem[];
    expect(shop.map((item) => item.id)).toContain(itemTopId);
    expect(shop.map((item) => item.id)).toContain(itemHairId);
    expect(shop.map((item) => item.id)).not.toContain(itemInactiveId);
  });

  it('compra com saldo suficiente debita, equipa e registra transacao', async () => {
    const user = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: user.id, balance: 100 } });

    const buy = await t.request('/economy/buy', {
      cookie: user.cookie,
      json: { shopItemId: itemTopId },
    });
    expect(buy.status).toBe(201);
    const purchase = (await buy.json()) as Purchase;
    expect(purchase.status).toBe('COMPLETED');
    expect(purchase.price).toBe(50);
    expect(purchase.shopItemId).toBe(itemTopId);

    const wallet = (await (
      await t.request('/economy/wallet', { cookie: user.cookie })
    ).json()) as Wallet;
    expect(wallet.balance).toBe(50);

    const avatar = (await (await t.request('/avatar', { cookie: user.cookie })).json()) as {
      top: string;
    };
    expect(avatar.top).toBe('leather-jacket');

    const transactions = (await (
      await t.request('/economy/transactions', { cookie: user.cookie })
    ).json()) as { type: string; amount: number }[];
    expect(transactions.some((tx) => tx.type === 'PURCHASE' && tx.amount === -50)).toBe(true);
  });

  it('compra sem saldo suficiente e recusada', async () => {
    const user = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: user.id, balance: 100 } });
    // Moicano custa 200 > saldo 100.
    const buy = await t.request('/economy/buy', {
      cookie: user.cookie,
      json: { shopItemId: itemHairId },
    });
    expect(buy.status).toBe(403);
  });

  it('compra item inexistente ou inativo e recusada', async () => {
    const user = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: user.id, balance: 1000 } });

    const inexistente = await t.request('/economy/buy', {
      cookie: user.cookie,
      json: { shopItemId: randomUUID() },
    });
    expect(inexistente.status).toBe(404);
    const inativo = await t.request('/economy/buy', {
      cookie: user.cookie,
      json: { shopItemId: itemInactiveId },
    });
    expect(inativo.status).toBe(404);
  });

  it('historico de compras', async () => {
    const user = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: user.id, balance: 100 } });
    await t.request('/economy/buy', {
      cookie: user.cookie,
      json: { shopItemId: itemTopId },
    });

    const response = await t.request('/economy/purchases', { cookie: user.cookie });
    expect(response.status).toBe(200);
    const list = (await response.json()) as Purchase[];
    expect(list.some((p) => p.shopItemId === itemTopId)).toBe(true);
    expect(list.every((p) => p.status === 'COMPLETED')).toBe(true);
  });

  it('avatar com item da loja e aceito mesmo sem compra (sem venda de roupas)', async () => {
    const user = await t.createUser();
    const response = await t.request('/avatar', {
      cookie: user.cookie,
      method: 'PUT',
      json: { ...DEFAULT_AVATAR, top: 'leather-jacket' },
    });
    expect(response.status).toBe(200);
  });

  it('avatar com item premium comprado e aceito', async () => {
    const user = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: user.id, balance: 100 } });
    await t.request('/economy/buy', {
      cookie: user.cookie,
      json: { shopItemId: itemTopId },
    });

    const response = await t.request('/avatar', {
      cookie: user.cookie,
      method: 'PUT',
      json: { ...DEFAULT_AVATAR, top: 'leather-jacket' },
    });
    expect(response.status).toBe(200);
  });

  it('transfere creditos para outro usuario', async () => {
    const remetente = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: remetente.id, balance: 100 } });

    const destinatario = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: destinatario.id, balance: 10 } });

    const transfer = await t.request('/economy/transfer', {
      cookie: remetente.cookie,
      json: { targetUserId: destinatario.id, amount: 30, note: 'presente' },
    });
    expect(transfer.status).toBe(201);
    const data = (await transfer.json()) as TransferResponse;
    expect(data.transferId).toBeDefined();
    expect(data.fromWallet.balance).toBe(70);
    expect(data.toWallet.balance).toBe(40);

    // Extrato do remetente: debito de 30 com counterpartyId do destinatario.
    const txRemetente = (await (
      await t.request('/economy/transactions', { cookie: remetente.cookie })
    ).json()) as { type: string; amount: number; counterpartyId: string | null }[];
    const debito = txRemetente.find((tx) => tx.type === 'TRANSFER' && tx.amount === -30);
    expect(debito).toBeDefined();
    expect(debito!.counterpartyId).toBe(destinatario.id);

    // Extrato do destinatario: credito de 30 com counterpartyId do remetente.
    const txDestinatario = (await (
      await t.request('/economy/transactions', { cookie: destinatario.cookie })
    ).json()) as { type: string; amount: number; counterpartyId: string | null }[];
    const credito = txDestinatario.find((tx) => tx.type === 'TRANSFER' && tx.amount === 30);
    expect(credito).toBeDefined();
    expect(credito!.counterpartyId).toBe(remetente.id);
  });

  it('nao transfere para si mesmo', async () => {
    const user = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: user.id, balance: 100 } });

    const transfer = await t.request('/economy/transfer', {
      cookie: user.cookie,
      json: { targetUserId: user.id, amount: 10 },
    });
    expect(transfer.status).toBe(403);
  });

  it('nao transfere sem saldo suficiente', async () => {
    const remetente = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: remetente.id, balance: 5 } });

    const destinatario = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: destinatario.id, balance: 10 } });

    const transfer = await t.request('/economy/transfer', {
      cookie: remetente.cookie,
      json: { targetUserId: destinatario.id, amount: 50 },
    });
    expect(transfer.status).toBe(403);
  });

  it('nao transfere para usuario inexistente', async () => {
    const remetente = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: remetente.id, balance: 100 } });

    const transfer = await t.request('/economy/transfer', {
      cookie: remetente.cookie,
      json: { targetUserId: randomUUID(), amount: 10 },
    });
    expect(transfer.status).toBe(404);
  });

  it('nao transfere para usuario sem carteira', async () => {
    const remetente = await t.createUser();
    await t.prisma.wallet.create({ data: { userId: remetente.id, balance: 100 } });

    const destinatario = await t.createUser();
    // destinatario sem carteira criada

    const transfer = await t.request('/economy/transfer', {
      cookie: remetente.cookie,
      json: { targetUserId: destinatario.id, amount: 10 },
    });
    expect(transfer.status).toBe(201);
  });
});
