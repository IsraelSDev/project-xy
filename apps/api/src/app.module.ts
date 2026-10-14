import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { AvatarsModule } from './avatars/avatars.module';
import { OriginGuard } from './common/origin.guard';
import { HealthController } from './health/health.controller';
import { ModerationModule } from './moderation/moderation.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfilesModule } from './profiles/profiles.module';

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
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes('*');
  }
}
