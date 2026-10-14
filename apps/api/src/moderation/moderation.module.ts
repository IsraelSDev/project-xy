import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlocksController } from './blocks.controller';
import { ReportsController } from './reports.controller';

@Module({
  imports: [AuthModule],
  controllers: [BlocksController, ReportsController],
})
export class ModerationModule {}
