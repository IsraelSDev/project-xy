import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AgeVerificationController } from './age-verification.controller.js';
import { AgeVerificationService } from './age-verification.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AgeVerificationController],
  providers: [AgeVerificationService],
  exports: [AgeVerificationService],
})
export class AgeVerificationModule {}
