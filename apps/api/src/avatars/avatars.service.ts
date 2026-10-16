import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AvatarConfig,
  ACCESSORIES,
  BODY_TYPES,
  BOTTOMS,
  FREE_PART_IDS,
  HAIR_STYLES,
  PART_CATALOG,
  PART_SLOTS,
  parseAvatar,
  TOPS,
} from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/** Partes do avatar que aceitam valores do catálogo grátis ou itens premium comprados. */
const FREE_BY_KIND: Record<string, readonly string[]> = {
  body: BODY_TYPES.map((item) => item.id),
  hair: HAIR_STYLES.map((item) => item.id),
  top: TOPS.map((item) => item.id),
  bottom: BOTTOMS.map((item) => item.id),
  accessory: ACCESSORIES.map((item) => item.id),
};

/** Campos do avatar cujo valor precisa ser grátis ou comprado. */
const PAID_KINDS: readonly string[] = ['body', 'hair', 'top', 'bottom', 'accessory', ...PART_SLOTS];

/** Valor grátis: padrão do catálogo antigo, 'none' nas peças, ou peça grátis no slot dela. */
function isFree(kind: string, value: string): boolean {
  if (FREE_BY_KIND[kind]?.includes(value)) return true;
  if (!PART_SLOTS.includes(kind as never)) return false;
  if (value === 'none') return true;
  return (
    FREE_PART_IDS.includes(value as never) &&
    PART_CATALOG.some((part) => part.slot === kind && part.id === value)
  );
}

/** Aparência do próprio usuário. Itens premium só podem ser equipados se foram comprados. */
@Injectable()
export class AvatarsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<AvatarConfig> {
    const stored = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatar: true },
    });
    return parseAvatar(stored.avatar);
  }

  async save(userId: string, avatar: AvatarConfig): Promise<AvatarConfig> {
    for (const [kind, value] of Object.entries(avatar)) {
      if (PAID_KINDS.includes(kind) && !isFree(kind, value)) {
        const owned = await this.prisma.purchase.findFirst({
          where: { userId, status: 'COMPLETED', shopItem: { kind, value } },
        });
        if (!owned) {
          throw new ForbiddenException(`O item '${value}' de '${kind}' não foi comprado.`);
        }
      }
    }
    await this.prisma.user.update({ where: { id: userId }, data: { avatar } });
    return avatar;
  }
}
