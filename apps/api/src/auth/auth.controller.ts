import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  LoginRequest,
  RegisterRequest,
  type RealtimeTicketResponse,
  type SessionUser,
} from '@3dx/contracts';
import type { Request, Response } from 'express';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, SessionGuard } from './session.guard.js';
import { SESSION_COOKIE, SessionService, sessionCookieOptions } from './session.service.js';
import { TicketService } from './ticket.service.js';

const MINUTE = 60_000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly tickets: TicketService,
  ) {}

  @Post('register')
  @RateLimit({ limit: 5, windowMs: MINUTE, by: 'ip' })
  async register(
    @Body(new ZodBody(RegisterRequest)) body: RegisterRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionUser> {
    const user = await this.auth.register(body);
    await this.startSession(user.id, response);
    return user;
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: MINUTE, by: 'ip' })
  async login(
    @Body(new ZodBody(LoginRequest)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionUser> {
    const user = await this.auth.login(body);
    await this.startSession(user.id, response);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await this.sessions.revoke(token);
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }

  @Post('realtime-ticket')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @RateLimit({ limit: 30, windowMs: MINUTE })
  ticket(@CurrentUser() user: SessionUser): Promise<RealtimeTicketResponse> {
    return this.tickets.issue(user);
  }

  private async startSession(userId: string, response: Response): Promise<void> {
    const { token, expiresAt } = await this.sessions.create(userId);
    response.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(), expires: expiresAt });
  }
}
