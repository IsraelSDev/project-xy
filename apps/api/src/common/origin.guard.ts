import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { readAllowedOrigins } from '../config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção contra CSRF em conjunto com o cookie `SameSite=Lax` e o corpo JSON obrigatório:
 * requisições que alteram estado vindas de um navegador precisam ter `Origin` permitida.
 * Sem `Origin` (clientes que não são navegador) não há cookie de terceiros a explorar.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed = new Set(readAllowedOrigins());

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin !== undefined && !this.allowed.has(origin)) {
      throw new ForbiddenException('Origem não permitida.');
    }
    return true;
  }
}
