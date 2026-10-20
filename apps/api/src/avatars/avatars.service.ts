import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AvatarConfig,
  ACCESSORIES,
  AVATAR_PARTS,
  BOTTOMS,
  HAIR_STYLES,
  PART_SLOTS,
  parseAvatar,
  partFitsModel,
  TOPS,
} from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/** Catálogos fixos do contrato: valores sempre aceitos. */
const FIXED_CATALOG: Record<string, readonly string[]> = {
  hair: HAIR_STYLES.map((item) => item.id),
  top: TOPS.map((item) => item.id),
  bottom: BOTTOMS.map((item) => item.id),
  accessory: ACCESSORIES.map((item) => item.id),
};

/** Campos do avatar cujo valor precisa existir no catálogo (fixo, biblioteca ou loja). */
const CHECKED_KINDS: readonly string[] = ['hair', 'top', 'bottom', 'accessory', ...PART_SLOTS];

/** Valor do catálogo fixo, ou peça da biblioteca no slot certo ('none' sempre vale nas peças). */
function isCatalogValue(kind: string, value: string): boolean {
  if (FIXED_CATALOG[kind]?.includes(value)) return true;
  if (!PART_SLOTS.includes(kind as never)) return false;
  if (value === 'none') return true;
  return AVATAR_PARTS.some((part) => part.slot === kind && part.id === value);
}

/**
 * Aparência do próprio usuário. Sem venda de roupas por ora: todo item do catálogo (fixo, da
 * biblioteca ou cadastrado na loja) pode ser equipado sem compra. A única checagem é existência
 * (recusa item inventado ou URL) e compatibilidade com o modelo/gênero.
 */
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
      // Campos que não são texto (ex.: `decals`, uma lista) não passam por catálogo aqui.
      if (typeof value !== 'string') continue;
      // Peça de roupa só vale no gênero/modelo a que pertence (o esqueleto é do gênero).
      const part = AVATAR_PARTS.find((item) => item.slot === kind && item.id === value);
      if (part && !partFitsModel(part, avatar.model)) {
        throw new ForbiddenException(`A peça '${value}' não serve no modelo '${avatar.model}'.`);
      }
      if (CHECKED_KINDS.includes(kind) && !isCatalogValue(kind, value)) {
        // Itens da loja são cadastrados no banco: aceita o que existe, sem exigir compra.
        const known = await this.prisma.shopItem.findFirst({
          where: { kind, value },
          select: { id: true },
        });
        if (!known) {
          throw new ForbiddenException(`O item '${value}' de '${kind}' não existe.`);
        }
      }
    }
    await this.prisma.user.update({ where: { id: userId }, data: { avatar } });
    return avatar;
  }
}
