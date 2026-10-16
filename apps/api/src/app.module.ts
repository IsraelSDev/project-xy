import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AccountModule } from './account/account.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AgeVerificationModule } from './age-verification/age-verification.module.js';
import { AppealsModule } from './appeals/appeals.module.js';
import { EconomyModule } from './economy/economy.module.js';
import { FriendsModule } from './friends/friends.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AvatarsModule } from './avatars/avatars.module.js';
import { helmet } from './common/helmet.js';
import { OriginGuard } from './common/origin.guard.js';
import { RATE_LIMIT_SCOPE, RateLimitGuard } from './common/rate-limit.js';
import { HealthController } from './health/health.controller.js';
import { MetricsController } from './health/metrics.controller.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { NotifyModule } from './notify/notify.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProfilesModule,
    AvatarsModule,
    ModerationModule,
    NotifyModule,
    AdminModule,
    AccountModule,
    AgeVerificationModule,
    AppealsModule,
    EconomyModule,
    FriendsModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: RATE_LIMIT_SCOPE, useValue: '' },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // helmet: cabeçalhos de segurança (nosniff, frame-ancestors, HSTS em HTTPS, CSP mínima para JSON).
    consumer.apply(helmet(), cookieParser()).forRoutes('*');
  }
}
