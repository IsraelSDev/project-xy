import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';
import { TicketService } from './ticket.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, SessionGuard, TicketService],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
