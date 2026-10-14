import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminReportsController } from './admin-reports.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminReportsController],
})
export class AdminModule {}
