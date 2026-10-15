import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AvatarConfig,
  parseAvatar,
  type BuyRequest,
  type EconomyBuyResponse,
  type EconomyPurchaseResponse,
  type EconomyShopResponse,
  type EconomyTransactionResponse,
  type EconomyWalletResponse,
  type Purchase,
  type PurchaseStatus,
  type ShopItem,
  type Transaction,
  type TransactionType,
  type Wallet,
} from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/** Partes do avatar que aceitam itens premium (fora do catálogo grátis). */
const PREMIUM_KINDS = ['body', 'hair', 'top', 'bottom', 'accessory'];

function toWallet(wallet: {
  id: string;
  userId: string;
  balance: number;
  updatedAt: Date;
}): Wallet {
  return {
    id: wallet.id,
    userId: wallet.userId,
    balance: wallet.balance,
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

function toShopItem(item: {
  id: string;
  kind: string;
  name: string;
  value: string;
  price: number;
  active: boolean;
  createdAt: Date;
}): ShopItem {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    value: item.value,
    price: item.price,
    active: item.active,
    createdAt: item.createdAt.toISOString(),
  };
}

function toTransaction(txn: {
  id: string;
  userId: string;
  type: string;
  amount: number;
  reference: string | null;
  note: string | null;
  createdAt: Date;
}): Transaction {
  return {
    id: txn.id,
    userId: txn.userId,
    type: txn.type as TransactionType,
    amount: txn.amount,
    reference: txn.reference,
    note: txn.note,
    createdAt: txn.createdAt.toISOString(),
  };
}

function toPurchase(purchase: {
  id: string;
  userId: string;
  shopItemId: string;
  price: number;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  shopItem?: {
    id: string;
    kind: string;
    name: string;
    value: string;
    price: number;
    active: boolean;
    createdAt: Date;
  } | null;
}): Purchase {
  return {
    id: purchase.id,
    userId: purchase.userId,
    shopItemId: purchase.shopItemId,
    price: purchase.price,
    status: purchase.status as PurchaseStatus,
    createdAt: purchase.createdAt.toISOString(),
    completedAt: purchase.completedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class EconomyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Carteira do usuário, criando-a com saldo zero se ainda não existir. */
  async wallet(userId: string): Promise<EconomyWalletResponse> {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId, balance: 0 } });
    }
    return toWallet(wallet);
  }

  /** Catálogo de itens à venda. */
  async shop(): Promise<EconomyShopResponse> {
    const items = await this.prisma.shopItem.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { price: 'asc' }, { createdAt: 'asc' }],
    });
    return items.map(toShopItem);
  }

  /**
   * Compra um item: débita os créditos, registra a compra e a transação e equipa o item no
   * avatar do comprador. Tudo atômico.
   */
  async buy(userId: string, input: BuyRequest): Promise<EconomyBuyResponse> {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: input.shopItemId },
    });
    if (!item || !item.active) {
      throw new NotFoundException('Item não encontrado ou indisponível.');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < item.price) {
        throw new ForbiddenException('Créditos insuficientes.');
      }

      // Débito dos créditos.
      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: item.price } },
      });

      // Registro da compra.
      const purchase = await tx.purchase.create({
        data: {
          userId,
          shopItemId: item.id,
          price: item.price,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        include: { shopItem: true },
      });

      // Transação de débito.
      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'PURCHASE',
          amount: -item.price,
          reference: purchase.id,
          note: `Compra de ${item.name}`,
        },
      });

      // Equipa o item na parte correspondente do avatar.
      if (PREMIUM_KINDS.includes(item.kind)) {
        const stored = await tx.user.findUnique({
          where: { id: userId },
          select: { avatar: true },
        });
        const current = parseAvatar(stored?.avatar ?? null);
        const next = { ...current } as Record<string, string>;
        next[item.kind] = item.value;
        await tx.user.update({
          where: { id: userId },
          data: { avatar: next as AvatarConfig },
        });
      }

      return toPurchase(purchase);
    });
  }

  /** Histórico de compras do usuário. */
  async purchases(userId: string): Promise<EconomyPurchaseResponse> {
    const list = await this.prisma.purchase.findMany({
      where: { userId },
      include: { shopItem: true },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(toPurchase);
  }

  /** Extrato da carteira. */
  async transactions(userId: string): Promise<EconomyTransactionResponse> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return [];
    const list = await this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(toTransaction);
  }

  /**
   * Adiciona créditos (uso do administrador ou saldo inicial). Não é exposto por endpoint público.
   */
  async credit(userId: string, amount: number, note: string): Promise<Wallet> {
    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId, balance: amount } });
        await tx.transaction.create({
          data: { userId, walletId: wallet.id, type: 'CREDIT', amount, note },
        });
        return toWallet(wallet);
      }
      wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });
      await tx.transaction.create({
        data: { userId, walletId: wallet.id, type: 'CREDIT', amount, note },
      });
      return toWallet(wallet);
    });
  }
}
