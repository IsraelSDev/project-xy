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
} as const;

type ProfileRow = {
  id: string;
  displayName: string;
  createdAt: Date;
  bio: string | null;
  role: PublicProfile['role'];
  ageAssurance: 'SELF_DECLARED' | 'VERIFIED';
};

/**
 * Perfil público dos membros. A única regra de visibilidade é o bloqueio: quem bloqueou (ou foi
 * bloqueado) não vê o perfil do outro — mesma decisão do chat e das amizades.
 */
@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(viewerId: string, targetId: string): Promise<PublicProfile> {
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

  private toProfile(user: ProfileRow): PublicProfile {
    return {
      id: user.id,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
      bio: user.bio,
      role: user.role,
      verifiedAdult: user.ageAssurance === 'VERIFIED',
    };
  }
}
