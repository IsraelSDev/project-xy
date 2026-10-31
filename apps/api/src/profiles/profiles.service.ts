import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DISPLAY_NAME_COOLDOWN_MS,
  nameSearchKey,
  type ProfileActivityItem,
  type ProfileEventKind,
  type PublicProfile,
  type UpdateProfileRequest,
} from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { bioProblem, locationProblem } from './bio-policy.js';

/** Campos do banco que viram `PublicProfile`. */
const PROFILE_SELECT = {
  id: true,
  displayName: true,
  createdAt: true,
  bio: true,
  location: true,
  birthDate: true,
  showBirthday: true,
  role: true,
  ageAssurance: true,
  profilePhoto: { select: { updatedAt: true } },
} as const;

type ProfileRow = {
  id: string;
  displayName: string;
  createdAt: Date;
  bio: string | null;
  location: string | null;
  birthDate: Date | null;
  showBirthday: boolean;
  role: PublicProfile['role'];
  ageAssurance: 'SELF_DECLARED' | 'VERIFIED';
  profilePhoto: { updatedAt: Date } | null;
};

/** Violação de chave única do Prisma (aqui: `displayNameKey`). */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

/**
 * Perfil público dos membros. A única regra de visibilidade é o bloqueio: quem bloqueou (ou foi
 * bloqueado) não vê o perfil do outro — mesma decisão do chat e das amizades.
 */
@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(viewerId: string, targetId: string): Promise<PublicProfile> {
    await this.assertVisible(viewerId, targetId);
    const user = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('Perfil não encontrado.');
    // O próprio perfil sempre vê o aniversário (para editar); os outros, só se a pessoa mostrar.
    return this.toProfile(user, viewerId === targetId);
  }

  /**
   * Salva a bio/localização/aniversário visível e/ou troca o nome de exibição. A troca de nome
   * respeita o intervalo mínimo e a unicidade (caixa-insensível via `displayNameKey`).
   */
  async update(userId: string, input: UpdateProfileRequest): Promise<PublicProfile> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        displayName: true,
        displayNameChangedAt: true,
        bio: true,
        location: true,
        showBirthday: true,
      },
    });

    const data: {
      bio?: string | null;
      location?: string | null;
      showBirthday?: boolean;
      displayName?: string;
      displayNameKey?: string;
      searchKey?: string;
      displayNameChangedAt?: Date;
    } = {};
    /** Eventos do feed do perfil que esta edição gera. */
    const events: ProfileEventKind[] = [];

    if (input.bio !== undefined) {
      if (input.bio) {
        const problem = bioProblem(input.bio);
        if (problem) throw new BadRequestException(problem);
      }
      const nextBio = input.bio === '' ? null : input.bio;
      data.bio = nextBio;
      if (nextBio !== current.bio) events.push('BIO');
    }

    if (input.location !== undefined) {
      if (input.location) {
        const problem = locationProblem(input.location);
        if (problem) throw new BadRequestException(problem);
      }
      data.location = input.location === '' ? null : input.location;
    }

    if (input.showBirthday !== undefined) {
      data.showBirthday = input.showBirthday;
    }

    /** Nome atual, quando a troca de nome foi pedida (vira o histórico da moderação). */
    let previousName: string | undefined;

    if (input.displayName !== undefined) {
      // Enviar o mesmo nome não conta como troca (nem gasta o intervalo mínimo).
      if (input.displayName !== current.displayName) {
        const wait = (current.displayNameChangedAt?.getTime() ?? 0) + DISPLAY_NAME_COOLDOWN_MS;
        if (wait > Date.now()) {
          const hours = Math.ceil((wait - Date.now()) / (60 * 60_000));
          throw new HttpException(
            `Você trocou o nome há pouco. Tente de novo em ${hours} h.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        previousName = current.displayName;
        data.displayName = input.displayName;
        data.displayNameKey = input.displayName.toLowerCase();
        data.searchKey = nameSearchKey(input.displayName);
        data.displayNameChangedAt = new Date();
        events.push('NAME');
      }
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: userId },
          data,
          select: PROFILE_SELECT,
        });
        // Histórico para a moderação: só quando o nome realmente mudou.
        if (previousName !== undefined) {
          await tx.nameChange.create({ data: { userId, previousName } });
        }
        if (events.length > 0) {
          await tx.profileEvent.createMany({
            data: events.map((kind) => ({ userId, kind })),
          });
        }
        return updated;
      });
      return this.toProfile(user, true);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Esse nome já está em uso.');
      throw error;
    }
  }

  /** Atividade pública do perfil (mais recente primeiro), se o viewer pode ver o perfil. */
  async activity(viewerId: string, targetId: string, limit = 20): Promise<ProfileActivityItem[]> {
    await this.assertVisible(viewerId, targetId);
    const events = await this.prisma.profileEvent.findMany({
      where: { userId: targetId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { kind: true, createdAt: true },
    });
    return events.map((event) => ({
      kind: event.kind,
      at: event.createdAt.toISOString(),
    }));
  }

  /**
   * Busca membros por nome (case-insensitive), respeitando bloqueios nos dois sentidos: quem
   * bloqueou ou foi bloqueado não aparece, nem contas excluídas. Prefixo vem antes de "contém".
   */
  async search(viewerId: string, query: string, limit = 20): Promise<PublicProfile[]> {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const hidden = blocks.map((block) =>
      block.blockerId === viewerId ? block.blockedId : block.blockerId,
    );
    const excluded = [viewerId, ...hidden];
    const base = {
      deletedAt: null,
      id: { notIn: excluded },
    } as const;
    // A busca usa a chave normalizada (sem acento): "ana" encontra "Ána".
    const key = nameSearchKey(query);

    const prefix = await this.prisma.user.findMany({
      where: { ...base, searchKey: { startsWith: key } },
      select: PROFILE_SELECT,
      orderBy: { displayName: 'asc' },
      take: limit,
    });
    if (prefix.length >= limit) return prefix.map((user) => this.toProfile(user, false));

    const rest = await this.prisma.user.findMany({
      where: {
        ...base,
        id: { notIn: [...excluded, ...prefix.map((user) => user.id)] },
        searchKey: { contains: key },
      },
      select: PROFILE_SELECT,
      orderBy: { displayName: 'asc' },
      take: limit - prefix.length,
    });
    return [...prefix, ...rest].map((user) => this.toProfile(user, false));
  }

  /**
   * Garante que `viewer` pode ver `target`: nada de perfil de conta excluída e bloqueio nos dois
   * sentidos esconde. Usado também pela foto.
   */
  async assertVisible(viewerId: string, targetId: string): Promise<void> {
    if (viewerId !== targetId) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: targetId },
            { blockerId: targetId, blockedId: viewerId },
          ],
        },
        select: { blockerId: true },
      });
      if (blocked) throw new NotFoundException('Perfil não encontrado.');
    }
    const exists = await this.prisma.user.count({ where: { id: targetId, deletedAt: null } });
    if (exists === 0) throw new NotFoundException('Perfil não encontrado.');
  }

  toProfile(user: ProfileRow, own: boolean): PublicProfile {
    return {
      id: user.id,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
      bio: user.bio,
      location: user.location,
      // Sem ano: o perfil mostra só o dia/mês quando a pessoa escolhe (o próprio sempre vê).
      birthday:
        user.birthDate && (own || user.showBirthday)
          ? { day: user.birthDate.getUTCDate(), month: user.birthDate.getUTCMonth() + 1 }
          : null,
      role: user.role,
      verifiedAdult: user.ageAssurance === 'VERIFIED',
      photoUpdatedAt: user.profilePhoto?.updatedAt.toISOString() ?? null,
    };
  }
}
