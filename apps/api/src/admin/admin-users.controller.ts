import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AdminUserSummary,
  AdminUsersPage,
  NameChangeSummary,
  Role,
  SessionUser,
} from '@3dx/contracts';
import { z } from 'zod';
import { CurrentUser, Roles, SessionGuard } from '../auth/session.guard.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ListUsersQuery = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['USER', 'MODERATOR', 'ADMIN']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

const toUserSummary = (user: {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: Date;
  deletedAt: Date | null;
}): AdminUserSummary => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  createdAt: user.createdAt.toISOString(),
  deletedAt: user.deletedAt?.toISOString() ?? null,
});

/** Listagem de usuários para o painel de administração (busca por nome/e-mail, filtro de papel). */
@Controller('admin/users')
@UseGuards(SessionGuard)
@Roles('MODERATOR', 'ADMIN')
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Nomes anteriores (trocas de nome) do usuário, para a moderação ver o histórico. */
  @Get(':id/names')
  async names(@Param('id', ParseUUIDPipe) id: string): Promise<NameChangeSummary[]> {
    const changes = await this.prisma.nameChange.findMany({
      where: { userId: id },
      orderBy: { changedAt: 'desc' },
      take: 50,
      select: { previousName: true, changedAt: true },
    });
    return changes.map((change) => ({
      previousName: change.previousName,
      changedAt: change.changedAt.toISOString(),
    }));
  }

  @Get()
  async list(@Query() query: unknown): Promise<AdminUsersPage> {
    const parsed = ListUsersQuery.safeParse(query);
    if (!parsed.success) {
      const { page, take } = ListUsersQuery.parse({});
      return { users: [], total: 0, page, take };
    }

    const { q, role, page, take } = parsed.data;
    const skip = (page - 1) * take;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { displayName: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(role ? { role } : {}),
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
          deletedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({
        where: {
          ...(q
            ? {
                OR: [
                  { displayName: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(role ? { role } : {}),
        },
      }),
    ]);

    return {
      users: users.map(toUserSummary),
      total,
      page,
      take,
    };
  }

  /** Altera o papel de um usuário. Só ADMIN; não é possível rebaixar a si mesmo. */
  @Patch(':id/role')
  @Roles('ADMIN')
  async updateRole(
    @CurrentUser() requester: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(z.strictObject({ role: z.enum(['USER', 'MODERATOR', 'ADMIN']) })))
    body: { role: Role },
  ): Promise<AdminUserSummary> {
    if (id === requester.id) {
      throw new ForbiddenException('Não é possível alterar o seu próprio papel.');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: body.role },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        deletedAt: true,
      },
    });

    await this.prisma.moderationAction.create({
      data: {
        actorId: requester.id,
        action: 'user.role.changed',
        note: `${user.role} → ${body.role}`,
      },
    });

    return toUserSummary(updated);
  }
}
