import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MAX_FRIENDS, type FriendEntry, type FriendStatus } from '@3dx/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

/** Chave do par: uma linha por amizade, com o menor id em `userAId`. */
export const friendPair = (one: string, other: string) =>
  one < other ? { userAId: one, userBId: other } : { userAId: other, userBId: one };

const userRef = { select: { id: true, displayName: true } } as const;

/** Amizades e pedidos de `userId`, do ponto de vista dele. */
export async function friendEntriesOf(db: Db, userId: string): Promise<FriendEntry[]> {
  const rows = await db.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: { userA: userRef, userB: userRef },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({
    user: row.userAId === userId ? row.userB : row.userA,
    status:
      row.status === 'ACCEPTED' ? 'FRIEND' : row.requesterId === userId ? 'OUTGOING' : 'INCOMING',
    since: (row.acceptedAt ?? row.createdAt).toISOString(),
  }));
}

/** Desfaz amizade ou pedido entre duas pessoas (ex.: ao bloquear). */
export async function removeFriendship(db: Db, one: string, other: string): Promise<void> {
  await db.friendship.deleteMany({ where: friendPair(one, other) });
}

/** Erro do Prisma para chave duplicada (pedido simultâneo para o mesmo par). */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<FriendEntry[]> {
    return friendEntriesOf(this.prisma, userId);
  }

  /**
   * Pede amizade. Se a outra pessoa já tinha pedido, vira amizade na hora. Bloqueio em qualquer
   * sentido impede, sem dizer quem bloqueou.
   */
  async request(userId: string, targetId: string): Promise<Exclude<FriendStatus, 'INCOMING'>> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { deletedAt: true },
    });
    if (!target || target.deletedAt) throw new NotFoundException('Usuário não encontrado.');
    const blocked = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetId },
          { blockerId: targetId, blockedId: userId },
        ],
      },
    });
    if (blocked > 0) throw new ForbiddenException('Não é possível adicionar esta pessoa.');

    const existing = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: friendPair(userId, targetId) },
    });
    if (existing) return this.resolveExisting(userId, existing);

    const count = await this.prisma.friendship.count({
      where: {
        OR: [
          { userAId: userId, OR: [{ status: 'ACCEPTED' }, { requesterId: userId }] },
          { userBId: userId, OR: [{ status: 'ACCEPTED' }, { requesterId: userId }] },
        ],
      },
    });
    if (count >= MAX_FRIENDS) {
      throw new ConflictException(`Limite de ${MAX_FRIENDS} amizades e pedidos atingido.`);
    }

    try {
      await this.prisma.friendship.create({
        data: { ...friendPair(userId, targetId), requesterId: userId },
      });
      return 'OUTGOING';
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A outra pessoa pediu ao mesmo tempo: resolve como se o pedido dela tivesse chegado antes.
      const raced = await this.prisma.friendship.findUniqueOrThrow({
        where: { userAId_userBId: friendPair(userId, targetId) },
      });
      return this.resolveExisting(userId, raced);
    }
  }

  private async resolveExisting(
    userId: string,
    existing: { userAId: string; userBId: string; requesterId: string; status: string },
  ): Promise<'FRIEND'> {
    if (existing.status === 'ACCEPTED') throw new ConflictException('Vocês já são amigos.');
    if (existing.requesterId === userId) throw new ConflictException('Pedido já enviado.');
    await this.accept(userId, existing.requesterId);
    return 'FRIEND';
  }

  /** Aceita um pedido recebido. Só quem recebeu aceita. */
  async accept(userId: string, requesterId: string): Promise<void> {
    const { count } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.friendship.updateMany({
        where: { ...friendPair(userId, requesterId), requesterId, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      if (updated.count > 0) {
        // Feed dos dois perfis: só o fato, sem o nome da outra pessoa (privacidade da lista).
        await tx.profileEvent.createMany({
          data: [
            { userId, kind: 'FRIEND' },
            { userId: requesterId, kind: 'FRIEND' },
          ],
        });
      }
      return updated;
    });
    if (count === 0) throw new NotFoundException('Pedido de amizade não encontrado.');
  }

  /** Recusa, cancela ou desfaz: em qualquer caso a linha do par some. Idempotente. */
  remove(userId: string, otherId: string): Promise<void> {
    return removeFriendship(this.prisma, userId, otherId);
  }
}
