import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AvatarsController } from './avatars.controller.js';
import { AvatarsService } from './avatars.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AvatarsController],
  providers: [AvatarsService],
})
export class AvatarsModule {}
