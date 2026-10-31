import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PHOTO_STORAGE, createPhotoStorage } from './photo-storage.js';
import { ProfilePhotosService } from './profile-photos.service.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProfilesController],
  providers: [
    ProfilesService,
    ProfilePhotosService,
    {
      provide: PHOTO_STORAGE,
      useFactory: (prisma: PrismaService) => createPhotoStorage(prisma),
      inject: [PrismaService],
    },
  ],
})
export class ProfilesModule {}
