import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AvatarsModule } from './avatars/avatars.module.js';
import { OriginGuard } from './common/origin.guard.js';
import { HealthController } from './health/health.controller.js';
import { MetricsController } from './health/metrics.controller.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';

@Module({
  imports: [
    // Limite geral por IP; rotas sensíveis (login, cadastro, denúncia) têm limites próprios.
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }] }),
    PrismaModule,
    AuthModule,
    ProfilesModule,
    AvatarsModule,
    ModerationModule,
    AdminModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // helmet: cabeçalhos de segurança (nosniff, frame-ancestors, HSTS em HTTPS, CSP mínima para JSON).
    consumer.apply(helmet(), cookieParser()).forRoutes('*');
  }
}
