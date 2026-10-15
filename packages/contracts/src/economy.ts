import { z } from 'zod';

export const TransactionType = z.enum(['CREDIT', 'PURCHASE', 'REFUND']);
export type TransactionType = z.infer<typeof TransactionType>;

export const PurchaseStatus = z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']);
export type PurchaseStatus = z.infer<typeof PurchaseStatus>;

export const ShopItem = z.strictObject({
  id: z.string().uuid(),
  kind: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
  value: z.string().min(1).max(32),
  price: z.number().int().min(0),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ShopItem = z.infer<typeof ShopItem>;

export const Wallet = z.strictObject({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  balance: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type Wallet = z.infer<typeof Wallet>;

export const Transaction = z.strictObject({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: TransactionType,
  amount: z.number().int(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof Transaction>;

export const Purchase = z.strictObject({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  shopItemId: z.string().uuid(),
  price: z.number().int(),
  status: PurchaseStatus,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type Purchase = z.infer<typeof Purchase>;

export const BuyRequest = z.strictObject({
  shopItemId: z.string().uuid(),
});
export type BuyRequest = z.infer<typeof BuyRequest>;

export type EconomyWalletResponse = Wallet;
export type EconomyShopResponse = ShopItem[];
export type EconomyTransactionResponse = Transaction[];
export type EconomyPurchaseResponse = Purchase[];
export type EconomyBuyResponse = Purchase;
