import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AppealsController } from './appeals.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AppealsController],
})
export class AppealsModule {}
