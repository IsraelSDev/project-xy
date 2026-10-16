import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAppealsController } from './admin-appeals.controller.js';
import { AdminConversationsController } from './admin-conversations.controller.js';
import { AdminQueueController } from './admin-queue.controller.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { AdminSanctionsController } from './admin-sanctions.controller.js';
import { AdminUsersController } from './admin-users.controller.js';
import { ConversationsService } from './conversations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminReportsController,
    AdminQueueController,
    AdminSanctionsController,
    AdminAppealsController,
    AdminConversationsController,
    AdminUsersController,
  ],
  providers: [ConversationsService],
})
export class AdminModule {}
