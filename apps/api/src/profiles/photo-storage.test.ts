import type { PrismaService } from '../prisma/prisma.service.js';
import { describe, expect, it, vi } from 'vitest';
import { createPhotoStorage, type FetchInit, type FetchResponse } from './photo-storage.js';

/** Stub do Prisma: só o que o armazenamento toca (com parâmetros para `mock.calls` tipar). */
function prismaStub() {
  const upsert = vi.fn((args: unknown) => {
    void args;
    return Promise.resolve(undefined);
  });
  const deleteMany = vi.fn((args: unknown) => {
    void args;
    return Promise.resolve({ count: 1 });
  });
  const findUnique = vi.fn((args: unknown) => {
    void args;
    return Promise.resolve({ mime: 'image/png', data: null });
  });
  return {
    upsert,
    deleteMany,
    findUnique,
    prisma: { profilePhoto: { upsert, deleteMany, findUnique } } as unknown as PrismaService,
  };
}

/** Resposta mínima do fetch (sem depender do tipo global `Response` do ambiente de build). */
const response = (body?: string | Uint8Array, status = 200): FetchResponse => {
  const bytes =
    typeof body === 'string' ? new TextEncoder().encode(body) : (body ?? new Uint8Array());
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
  };
};

/** `fetch` falso com a mesma assinatura do storage, para `mock.calls` ficar tipado. */
const mockFetch = (handler: () => FetchResponse) =>
  vi.fn((input: string, init?: FetchInit) => {
    void input;
    void init;
    return Promise.resolve(handler());
  });

const ENV = {
  SUPABASE_URL: 'https://exemplo.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico',
};

const OBJECT_URL = 'https://exemplo.supabase.co/storage/v1/object/profile-photos/profiles/user-1';

describe('createPhotoStorage', () => {
  it('sem variáveis do Supabase fica no Postgres (dev e CI)', () => {
    expect(createPhotoStorage(prismaStub().prisma, {}).kind).toBe('database');
    expect(createPhotoStorage(prismaStub().prisma, { SUPABASE_BUCKET: 'outro' }).kind).toBe(
      'database',
    );
  });

  it('exige URL e chave juntas', () => {
    expect(() => createPhotoStorage(prismaStub().prisma, { SUPABASE_URL: 'https://x' })).toThrow(
      /juntas/,
    );
    expect(() =>
      createPhotoStorage(prismaStub().prisma, { SUPABASE_SERVICE_ROLE_KEY: 'svc' }),
    ).toThrow(/juntas/);
  });

  it('com URL e chave envia para o bucket padrão e grava o mime', async () => {
    const { prisma, upsert } = prismaStub();
    const fetchMock = mockFetch(() => response());
    const storage = createPhotoStorage(prisma, ENV, fetchMock);

    expect(storage.kind).toBe('supabase');
    await storage.save('user-1', 'image/png', Buffer.from([1, 2, 3]));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(OBJECT_URL);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer chave-de-servico',
      'content-type': 'image/png',
      'x-upsert': 'true',
    });
    expect(upsert.mock.calls.length).toBe(1);
  });

  it('respeita SUPABASE_BUCKET e recusa upload malsucedido', async () => {
    const fetchMock = mockFetch(() => response('sem permissão', 403));
    const storage = createPhotoStorage(
      prismaStub().prisma,
      { ...ENV, SUPABASE_BUCKET: 'fotos' },
      fetchMock,
    );

    await expect(storage.save('user-1', 'image/png', Buffer.from([1]))).rejects.toThrow(/403/);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://exemplo.supabase.co/storage/v1/object/fotos/profiles/user-1',
    );
  });

  it('remove apaga o objeto e a linha', async () => {
    const { prisma, deleteMany } = prismaStub();
    const fetchMock = mockFetch(() => response());
    const storage = createPhotoStorage(prisma, ENV, fetchMock);

    await storage.remove('user-1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(OBJECT_URL);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(deleteMany.mock.calls[0]?.[0]).toEqual({ where: { userId: 'user-1' } });
  });

  it('read devolve os bytes do bucket e trata objeto ausente', async () => {
    const storage = createPhotoStorage(
      prismaStub().prisma,
      ENV,
      mockFetch(() => response(new Uint8Array([9, 8, 7]))),
    );
    const photo = await storage.read('user-1');
    expect(photo?.mime).toBe('image/png');
    expect([...(photo?.data ?? [])]).toEqual([9, 8, 7]);

    const missing = createPhotoStorage(
      prismaStub().prisma,
      ENV,
      mockFetch(() => response(undefined, 404)),
    );
    expect(await missing.read('user-1')).toBeUndefined();
  });
});
