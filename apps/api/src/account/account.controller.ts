import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { DeleteAccountRequest, type AccountExport, type SessionUser } from '@3dx/contracts';
import type { Response } from 'express';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../auth/session.service.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { AccountService } from './account.service.js';

const MINUTE = 60_000;

/** A própria conta: exportar os dados e excluir. */
@Controller('account')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('export')
  @RateLimit({ limit: 10, windowMs: MINUTE })
  export(@CurrentUser() user: SessionUser): Promise<AccountExport> {
    return this.account.export(user.id);
  }

  /** POST (não DELETE): o corpo leva a senha, e DELETE com corpo nem sempre passa por proxies. */
  @Post('delete')
  @HttpCode(204)
  @RateLimit({ limit: 5, windowMs: MINUTE })
  async delete(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(DeleteAccountRequest)) body: DeleteAccountRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.account.delete(user.id, body.password);
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }
}
