import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role, SessionUser } from '@3dx/contracts';
import type { Request } from 'express';
import { SessionService } from './session.service.js';

export interface AuthedRequest extends Request {
  user?: SessionUser;
}

const ROLES_KEY = 'roles';

/** Restringe a rota a estes papéis (além de exigir sessão). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Exige sessão válida e, se a rota pedir, um dos papéis de `@Roles`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.sessions.forRequest(request);
    if (!user) throw new UnauthorizedException('Faça login para continuar.');

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException('Acesso restrito à moderação.');
    }

    request.user = user;
    return true;
  }
}

/** Usuário autenticado da requisição (use junto com `SessionGuard`). */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});
