import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { PublicProfile } from '@3dx/contracts';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';

/** Perfil público mínimo. Só para usuários logados, para não expor a lista de membros. */
@Controller('profiles')
@UseGuards(SessionGuard)
export class ProfilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, displayName: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Perfil não encontrado.');
    return { id: user.id, displayName: user.displayName, createdAt: user.createdAt.toISOString() };
  }
}
