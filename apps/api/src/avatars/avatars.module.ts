import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AvatarsController } from './avatars.controller';

@Module({
  imports: [AuthModule],
  controllers: [AvatarsController],
})
export class AvatarsModule {}
