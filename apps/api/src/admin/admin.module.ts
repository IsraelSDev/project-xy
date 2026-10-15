import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAppealsController } from './admin-appeals.controller.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { AdminSanctionsController } from './admin-sanctions.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminReportsController, AdminSanctionsController, AdminAppealsController],
})
export class AdminModule {}
