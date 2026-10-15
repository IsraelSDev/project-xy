import { z } from 'zod';
import type { UserRef } from './safety.ts';

/** Limite de amizades (aceitas e pedidos enviados) por conta. */
export const MAX_FRIENDS = 500;

export const FriendRequest = z.strictObject({ userId: z.uuid() });
export type FriendRequest = z.infer<typeof FriendRequest>;

/** Do ponto de vista de quem consulta: amigo, pedido recebido ou pedido enviado. */
export const FRIEND_STATUSES = ['FRIEND', 'INCOMING', 'OUTGOING'] as const;
export type FriendStatus = (typeof FRIEND_STATUSES)[number];

export interface FriendEntry {
  user: UserRef;
  status: FriendStatus;
  /** Quando virou amizade (ou quando o pedido foi feito). */
  since: string;
}
