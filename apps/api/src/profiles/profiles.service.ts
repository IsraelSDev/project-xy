import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicProfile } from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

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

  /** Salva a bio do próprio perfil; string vazia apaga (vira `null`). */
  async updateBio(userId: string, bio: string | null): Promise<PublicProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { bio: bio === null || bio === '' ? null : bio },
      select: PROFILE_SELECT,
    });
    return this.toProfile(user);
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
