import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksController } from './blocks.controller.js';
import { ReportsController } from './reports.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [BlocksController, ReportsController],
})
export class ModerationModule {}
