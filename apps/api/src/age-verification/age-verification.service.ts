import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AgeVerificationComplete,
  type AgeAssurance,
  type AgeVerificationMethod,
  type AgeVerificationStatus,
} from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/** Uma referência de verificação expira após 15 minutos sem confirmação. */
const REFERENCE_TTL_MS = 15 * 60 * 1000;

/** Idade verificada: nível exigido para acesso a áreas adultas. */
const VERIFIED: AgeAssurance = 'VERIFIED';

@Injectable()
export class AgeVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Status atual de garantia de idade da conta autenticada. */
  async status(userId: string): Promise<AgeVerificationStatus> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      ageAssurance: user.ageAssurance,
      ageVerifiedAt: user.ageVerifiedAt?.toISOString() ?? null,
      ageVerificationMethod: (user.ageVerificationMethod ?? null) as AgeVerificationMethod | null,
    };
  }

  /**
   * Inicia uma verificação de idade: gera uma referência de uso único e curta duração que o
   * provedor (ou o cliente, no MVP) apresenta na confirmação. Não cria referência se já verificado.
   */
  async request(
    userId: string,
    method: AgeVerificationMethod,
  ): Promise<{ reference: string; expiresAt: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ageAssurance: true },
    });
    if (existing?.ageAssurance === VERIFIED) {
      throw new ConflictException('Idade já verificada.');
    }

    const reference = randomBytes(16).toString('base64url');
    const expiresAt = new Date(Date.now() + REFERENCE_TTL_MS);
    await this.prisma.ageVerificationReference.create({
      data: { reference, userId, method, expiresAt },
    });

    await this.prisma.moderationAction.create({
      data: { actorId: userId, action: 'age.verification.requested', note: method },
    });

    return { reference, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Confirma a verificação. Valida a referência (existe, não expirou, pertence à conta e bate o
   * método), então promove a conta para VERIFIED e apaga a referência (uso único).
   */
  async complete(userId: string, input: AgeVerificationComplete): Promise<AgeVerificationStatus> {
    const ref = await this.prisma.ageVerificationReference.findUnique({
      where: { reference: input.reference },
    });
    if (
      !ref ||
      ref.userId !== userId ||
      ref.method !== input.method ||
      ref.expiresAt < new Date()
    ) {
      throw new NotFoundException('Referência de verificação inválida ou vencida.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ageAssurance: VERIFIED,
          ageVerifiedAt: new Date(),
          ageVerificationMethod: input.method,
        },
      });
      await tx.ageVerificationReference.delete({ where: { reference: input.reference } });
      await tx.moderationAction.create({
        data: { actorId: userId, action: 'age.verified', note: input.method },
      });
    });

    return this.status(userId);
  }
}
