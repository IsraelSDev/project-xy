import { Body, ConflictException, Controller, Post } from '@nestjs/common';
import { CreateAppealRequest, type AppealReceipt } from '@3dx/contracts';
import { AuthService } from '../auth/auth.service.js';
import { activeSanction } from '../auth/sanctions.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';

const HOUR = 60 * 60_000;

/** Erro do Prisma para violação de chave única (a sanção já tem contestação). */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

/**
 * Contestação de sanção por quem a recebeu. Autentica por e-mail e senha, não por sessão: quem está
 * suspenso não consegue entrar. Vale para a sanção ativa mais grave, uma contestação por sanção.
 */
@Controller('appeals')
export class AppealsController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  // Por IP: a rota confere senha, então é limitada como o login.
  @RateLimit({ limit: 10, windowMs: HOUR, by: 'ip' })
  async create(
    @Body(new ZodBody(CreateAppealRequest)) body: CreateAppealRequest,
  ): Promise<AppealReceipt> {
    const user = await this.auth.verifyCredentials(body.email, body.password);
    const now = new Date();
    const sanction =
      (await this.prisma.sanction.findFirst({
        where: { userId: user.id, ...activeSanction('SUSPEND', now) },
        orderBy: { endsAt: { sort: 'desc', nulls: 'first' } },
      })) ??
      (await this.prisma.sanction.findFirst({
        where: { userId: user.id, ...activeSanction('MUTE', now) },
        orderBy: { endsAt: 'desc' },
      }));
    if (!sanction) throw new ConflictException('Não há sanção em vigor para contestar.');

    try {
      await this.prisma.$transaction([
        this.prisma.appeal.create({
          data: { sanctionId: sanction.id, userId: user.id, message: body.message },
        }),
        this.prisma.moderationAction.create({
          data: {
            actorId: user.id,
            reportId: sanction.reportId,
            sanctionId: sanction.id,
            action: 'appeal.created',
            note: null,
          },
        }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Esta sanção já foi contestada.');
      }
      throw error;
    }
    return {
      sanction: { type: sanction.type, endsAt: sanction.endsAt?.toISOString() ?? null },
    };
  }
}
