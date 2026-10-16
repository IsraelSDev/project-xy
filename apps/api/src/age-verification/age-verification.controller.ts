import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  AgeVerificationComplete,
  AgeVerificationRequest,
  type AgeVerificationStatus,
} from '@3dx/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { AgeVerificationService } from './age-verification.service.js';

const MINUTE = 60_000;

/** Verificação de idade da própria conta: status, início e confirmação. */
@Controller('age-verification')
@UseGuards(SessionGuard)
export class AgeVerificationController {
  constructor(private readonly verification: AgeVerificationService) {}

  @Get('me')
  async me(@CurrentUser() user: { id: string }): Promise<AgeVerificationStatus> {
    return this.verification.status(user.id);
  }

  @Post('request')
  @RateLimit({ limit: 5, windowMs: MINUTE, by: 'ip' })
  async request(
    @CurrentUser() user: { id: string },
    @Body(new ZodBody(AgeVerificationRequest)) body: AgeVerificationRequest,
  ): Promise<{ reference: string; expiresAt: string }> {
    return this.verification.request(user.id, body.method);
  }

  @Post('complete')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: MINUTE, by: 'ip' })
  async complete(
    @CurrentUser() user: { id: string },
    @Body(new ZodBody(AgeVerificationComplete)) body: AgeVerificationComplete,
  ): Promise<AgeVerificationStatus> {
    return this.verification.complete(user.id, body);
  }
}
