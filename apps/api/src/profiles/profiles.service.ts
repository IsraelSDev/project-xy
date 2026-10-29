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
  type PublicProfile,
  type UpdateProfileRequest,
} from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { bioProblem } from './bio-policy.js';

/** Campos do banco que viram `PublicProfile`. */
const PROFILE_SELECT = {
  id: true,
  displayName: true,
  createdAt: true,
  bio: true,
  role: true,
  ageAssurance: true,
  profilePhoto: { select: { updatedAt: true } },
} as const;

type ProfileRow = {
  id: string;
  displayName: string;
  createdAt: Date;
  bio: string | null;
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
    return this.toProfile(user);
  }

  /**
   * Salva a bio (string vazia apaga) e/ou troca o nome de exibição. A troca de nome respeita o
   * intervalo mínimo e a unicidade (caixa-insensível via `displayNameKey`).
   */
  async update(userId: string, input: UpdateProfileRequest): Promise<PublicProfile> {
    const data: {
      bio?: string | null;
      displayName?: string;
      displayNameKey?: string;
      displayNameChangedAt?: Date;
    } = {};

    if (input.bio !== undefined) {
      if (input.bio) {
        const problem = bioProblem(input.bio);
        if (problem) throw new BadRequestException(problem);
      }
      data.bio = input.bio === '' ? null : input.bio;
    }

    if (input.displayName !== undefined) {
      const current = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { displayName: true, displayNameChangedAt: true },
      });
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
        data.displayName = input.displayName;
        data.displayNameKey = input.displayName.toLowerCase();
        data.displayNameChangedAt = new Date();
      }
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: PROFILE_SELECT,
      });
      return this.toProfile(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Esse nome já está em uso.');
      throw error;
    }
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

  toProfile(user: ProfileRow): PublicProfile {
    return {
      id: user.id,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
      bio: user.bio,
      role: user.role,
      verifiedAdult: user.ageAssurance === 'VERIFIED',
      photoUpdatedAt: user.profilePhoto?.updatedAt.toISOString() ?? null,
    };
  }
}
