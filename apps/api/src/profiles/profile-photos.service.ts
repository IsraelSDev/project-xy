import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_PHOTO_BYTES, type ProfilePhotoUpload } from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfilesService } from './profiles.service.js';

/** Assinatura de cada formato aceito: o `mime` declarado tem que casar com os bytes. */
const MAGIC: Record<ProfilePhotoUpload['mime'], (data: Buffer) => boolean> = {
  'image/jpeg': (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  'image/png': (data) =>
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (data) =>
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP',
};

const MAX_PHOTO_KB = Math.round(MAX_PHOTO_BYTES / 1024);

/**
 * Foto do perfil guardada no Postgres (`ProfilePhoto.data`): imagem pequena já redimensionada no
 * cliente, servida por `GET /profiles/:id/photo`. Fica no banco para funcionar na Vercel (filesystem
 * efêmero); para migrar a um bucket (Supabase/S3) só esta classe muda.
 */
@Injectable()
export class ProfilePhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
  ) {}

  async save(userId: string, upload: ProfilePhotoUpload): Promise<void> {
    const data = Buffer.from(upload.data, 'base64');
    if (data.length === 0) throw new BadRequestException('A imagem está vazia.');
    if (data.length > MAX_PHOTO_BYTES) {
      throw new BadRequestException(`A foto pode ter no máximo ${MAX_PHOTO_KB} KB.`);
    }
    if (!MAGIC[upload.mime](data)) {
      throw new BadRequestException('O arquivo enviado não é uma imagem válida.');
    }
    await this.prisma.profilePhoto.upsert({
      where: { userId },
      create: { userId, mime: upload.mime, data },
      update: { mime: upload.mime, data },
    });
  }

  async remove(userId: string): Promise<void> {
    await this.prisma.profilePhoto.deleteMany({ where: { userId } });
  }

  /** Bytes da foto de `targetId`, se `viewerId` pode ver o perfil. */
  async read(viewerId: string, targetId: string): Promise<{ mime: string; data: Buffer }> {
    await this.profiles.assertVisible(viewerId, targetId);
    const photo = await this.prisma.profilePhoto.findUnique({
      where: { userId: targetId },
      select: { mime: true, data: true },
    });
    if (!photo) throw new NotFoundException('Este perfil não tem foto.');
    return { mime: photo.mime, data: Buffer.from(photo.data) };
  }
}
