import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isAdult, type LoginRequest, type RegisterRequest, type SessionUser } from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password';

const toSessionUser = (user: SessionUser): SessionUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
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
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          displayNameKey: input.displayName.toLowerCase(),
          birthDate: new Date(`${input.birthDate}T00:00:00Z`),
        },
      });
      return toSessionUser(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('E-mail ou nome de exibição já está em uso.');
      }
      throw error;
    }
  }

  async login(input: LoginRequest): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user || !valid) throw new UnauthorizedException('E-mail ou senha incorretos.');
    return toSessionUser(user);
  }
}
