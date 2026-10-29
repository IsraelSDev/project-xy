import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProfilePhotosService } from './profile-photos.service.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfilePhotosService],
})
export class ProfilesModule {}
