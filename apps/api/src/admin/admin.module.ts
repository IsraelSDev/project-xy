import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAppealsController } from './admin-appeals.controller.js';
import { AdminConversationsController } from './admin-conversations.controller.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { AdminSanctionsController } from './admin-sanctions.controller.js';
import { ConversationsService } from './conversations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminReportsController,
    AdminSanctionsController,
    AdminAppealsController,
    AdminConversationsController,
  ],
  providers: [ConversationsService],
})
export class AdminModule {}
