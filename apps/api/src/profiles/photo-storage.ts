import type { PrismaService } from '../prisma/prisma.service.js';

/** Bytes de uma foto já validada, com o mime que o cliente declarou. */
export interface StoredPhoto {
  mime: string;
  data: Buffer;
}

/**
 * Onde a foto do perfil mora. O `ProfilePhoto` (mime + `updatedAt`) é sempre a fonte da versão;
 * só os **bytes** mudam de lugar: Postgres (padrão, funciona na Vercel sem serviço extra) ou um
 * bucket S3-compatível (Supabase) quando as variáveis estão configuradas.
 */
export interface PhotoStorage {
  readonly kind: 'database' | 'supabase';
  save(userId: string, mime: string, data: Buffer): Promise<void>;
  remove(userId: string): Promise<void>;
  read(userId: string): Promise<StoredPhoto | undefined>;
}

/** Token do Nest para trocar a implementação nos testes. */
export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE');

/**
 * O mínimo que o storage usa da resposta do `fetch`. Declarado aqui (em vez de usar o tipo global
 * `Response`) para não depender da combinação de `lib`/`@types/node` do ambiente de build.
 */
export interface FetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Corpo/opções que o storage envia (compatível com `RequestInit` do fetch). */
export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/**
 * `fetch` do runtime adaptado ao contrato mínimo. O cast isola o tipo global `Response` (que muda
 * com a combinação de `lib`/`@types/node` e já quebrou o build da Vercel).
 */
const defaultFetch: FetchLike = (url, init) =>
  fetch(url, init as RequestInit).then((response) => response as unknown as FetchResponse);

/** Objeto no bucket: um por usuário (o upload sobrescreve). */
const objectPath = (userId: string) => `profiles/${userId}`;

/** Padrão: bytes no próprio Postgres (`ProfilePhoto.data`). */
class DatabasePhotoStorage implements PhotoStorage {
  readonly kind = 'database' as const;

  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, mime: string, data: Buffer): Promise<void> {
    // `Buffer` é `Uint8Array<ArrayBufferLike>`; o campo `Bytes` do Prisma espera `ArrayBuffer`.
    const bytes = new Uint8Array(data);
    await this.prisma.profilePhoto.upsert({
      where: { userId },
      create: { userId, mime, data: bytes },
      update: { mime, data: bytes },
    });
  }

  async remove(userId: string): Promise<void> {
    await this.prisma.profilePhoto.deleteMany({ where: { userId } });
  }

  async read(userId: string): Promise<StoredPhoto | undefined> {
    const photo = await this.prisma.profilePhoto.findUnique({
      where: { userId },
      select: { mime: true, data: true },
    });
    if (!photo?.data) return undefined;
    return { mime: photo.mime, data: Buffer.from(photo.data) };
  }
}

/**
 * Bucket do Supabase (Storage API, S3-compatível). A chave de serviço fica **só no servidor** e o
 * bucket é privado: a leitura continua passando pela API (`GET /profiles/:id/photo`), que aplica a
 * regra de bloqueio. A linha `ProfilePhoto` guarda mime/versão sem os bytes.
 */
class SupabasePhotoStorage implements PhotoStorage {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
    private readonly fetchImpl: FetchLike = defaultFetch,
  ) {}

  private objectUrl(userId: string): string {
    return `${this.baseUrl}/storage/v1/object/${this.bucket}/${objectPath(userId)}`;
  }

  private get auth(): { authorization: string } {
    return { authorization: `Bearer ${this.serviceKey}` };
  }

  async save(userId: string, mime: string, data: Buffer): Promise<void> {
    const response = await this.fetchImpl(this.objectUrl(userId), {
      method: 'POST',
      headers: { ...this.auth, 'content-type': mime, 'x-upsert': 'true' },
      body: new Uint8Array(data),
    });
    if (!response.ok) {
      throw new Error(`O bucket recusou o upload da foto (${response.status}).`);
    }
    await this.prisma.profilePhoto.upsert({
      where: { userId },
      create: { userId, mime },
      update: { mime },
    });
  }

  async remove(userId: string): Promise<void> {
    // Objeto ausente no bucket não é erro: a linha é a fonte da verdade.
    await this.fetchImpl(this.objectUrl(userId), {
      method: 'DELETE',
      headers: this.auth,
    }).catch(() => undefined);
    await this.prisma.profilePhoto.deleteMany({ where: { userId } });
  }

  async read(userId: string): Promise<StoredPhoto | undefined> {
    const photo = await this.prisma.profilePhoto.findUnique({
      where: { userId },
      select: { mime: true },
    });
    if (!photo) return undefined;
    const response = await this.fetchImpl(this.objectUrl(userId), { headers: this.auth });
    if (!response.ok) return undefined;
    return { mime: photo.mime, data: Buffer.from(await response.arrayBuffer()) };
  }
}

/**
 * Escolhe o armazenamento pelas variáveis de ambiente. Sem `SUPABASE_URL` **e**
 * `SUPABASE_SERVICE_ROLE_KEY`, segue no Postgres (dev e CI não precisam de bucket).
 */
export function createPhotoStorage(
  prisma: PrismaService,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = defaultFetch,
): PhotoStorage {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = env.SUPABASE_BUCKET?.trim() || 'profile-photos';
  if (url && key) {
    return new SupabasePhotoStorage(prisma, url.replace(/\/+$/, ''), key, bucket, fetchImpl);
  }
  if (url || key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidas juntas.');
  }
  return new DatabasePhotoStorage(prisma);
}
