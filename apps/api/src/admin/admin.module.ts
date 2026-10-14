import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminReportsController } from './admin-reports.controller';
import { AdminSanctionsController } from './admin-sanctions.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminReportsController, AdminSanctionsController],
})
export class AdminModule {}
