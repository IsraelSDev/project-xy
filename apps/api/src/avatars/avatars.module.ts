import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AvatarsController } from './avatars.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AvatarsController],
})
export class AvatarsModule {}
