import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  TERMS_VERSION,
  isAdult,
  nameSearchKey,
  type LoginRequest,
  type RegisterRequest,
  type SessionUser,
} from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { activeSanction, suspensionMessage } from './sanctions.js';

const toSessionUser = (user: SessionUser): SessionUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  ageAssurance: user.ageAssurance,
});

/** Erro do Prisma para violação de chave única (e-mail ou nome já usado). */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

@Injectable()
export class AuthService {
  /** Hash de referência: login com e-mail inexistente custa o mesmo tempo que com senha errada. */
  private readonly dummyHash = hashPassword('senha-de-referencia-para-tempo-constante');

  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterRequest): Promise<SessionUser> {
    // Idade só DECLARADA no MVP: não é garantia suficiente para lançamento (ADR 0005).
    if (!isAdult(input.birthDate, new Date())) {
      throw new BadRequestException('É preciso ter 18 anos ou mais para entrar.');
    }

    const passwordHash = await hashPassword(input.password);
    const STARTER_BALANCE = 100;
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
            displayNameKey: input.displayName.toLowerCase(),
            searchKey: nameSearchKey(input.displayName),
            birthDate: new Date(`${input.birthDate}T00:00:00Z`),
            termsAcceptedAt: new Date(),
            termsVersion: TERMS_VERSION,
          },
        });
        const wallet = await tx.wallet.create({
          data: { userId: created.id, balance: STARTER_BALANCE },
        });
        await tx.transaction.create({
          data: {
            userId: created.id,
            walletId: wallet.id,
            type: 'CREDIT',
            amount: STARTER_BALANCE,
            note: 'Saldo inicial',
          },
        });
        // Primeiro item do feed do perfil.
        await tx.profileEvent.create({
          data: { userId: created.id, kind: 'JOINED', createdAt: created.createdAt },
        });
        return created;
      });
      return toSessionUser(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('E-mail ou nome de exibição já está em uso.');
      }
      throw error;
    }
  }

  /**
   * Confere e-mail e senha (login e contestação). Conta inexistente ou excluída responde igual a
   * senha errada, inclusive no tempo (hash de referência).
   */
  async verifyCredentials(email: string, password: string) {
    const found = await this.prisma.user.findUnique({ where: { email } });
    const user = found?.deletedAt ? null : found;
    const valid = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !valid) throw new UnauthorizedException('E-mail ou senha incorretos.');
    return user;
  }

  async login(input: LoginRequest): Promise<SessionUser> {
    const user = await this.verifyCredentials(input.email, input.password);

    // Depois da senha: a suspensão só é revelada a quem prova ser o dono da conta.
    const suspension = await this.prisma.sanction.findFirst({
      where: { userId: user.id, ...activeSanction('SUSPEND', new Date()) },
      // Permanente (endsAt nulo) primeiro; depois a que termina mais tarde.
      orderBy: { endsAt: { sort: 'desc', nulls: 'first' } },
      include: { appeal: { select: { status: true, response: true } } },
    });
    if (suspension) {
      throw new ForbiddenException(suspensionMessage(suspension.endsAt, suspension.appeal));
    }
    return toSessionUser(user);
  }
}
