import { describe, expect, it } from 'vitest';
import {
  MAX_BIO_LENGTH,
  MAX_LOCATION_LENGTH,
  RealtimeTicketClaims,
  RegisterRequest,
  UpdateProfileRequest,
  isAdult,
  nameSearchKey,
} from './auth.ts';
import { ProfilePhotoUpload } from './auth.ts';
import { DEFAULT_AVATAR } from './avatar.ts';

const VALID = {
  email: '  Ana@Example.COM ',
  password: 'senha-bem-longa',
  displayName: 'Ana Souza',
  birthDate: '1990-05-20',
  acceptTerms: true,
};

describe('isAdult', () => {
  const today = new Date('2026-10-14T12:00:00Z');

  it('18 anos completos no dia do aniversário', () => {
    expect(isAdult('2008-10-14', today)).toBe(true);
    expect(isAdult('2008-10-15', today)).toBe(false);
  });

  it('recusa datas impossíveis de idade (futuro ou mais de 120 anos)', () => {
    expect(isAdult('2030-01-01', today)).toBe(false);
    expect(isAdult('1900-01-01', today)).toBe(false);
  });
});

describe('UpdateProfileRequest', () => {
  it('apara a bio e aceita apagar com null', () => {
    expect(UpdateProfileRequest.parse({ bio: '  oi  ' })).toEqual({ bio: 'oi' });
    expect(UpdateProfileRequest.parse({ bio: null })).toEqual({ bio: null });
  });

  it('aceita trocar o nome, com as regras do cadastro', () => {
    expect(UpdateProfileRequest.parse({ displayName: '  Ana Nova  ' })).toEqual({
      displayName: 'Ana Nova',
    });
    expect(UpdateProfileRequest.safeParse({ displayName: 'ab' }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ displayName: 'Conta excluída' }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ displayName: '@ana' }).success).toBe(false);
  });

  it('exige bio, localização, aniversário ou nome (nada de corpo vazio)', () => {
    expect(UpdateProfileRequest.safeParse({}).success).toBe(false);
  });

  it('apara a localização, aceita apagar e recusa HTML/quebras', () => {
    expect(UpdateProfileRequest.parse({ location: '  São Paulo  ' })).toEqual({
      location: 'São Paulo',
    });
    expect(UpdateProfileRequest.parse({ location: null })).toEqual({ location: null });
    expect(UpdateProfileRequest.safeParse({ location: '<b>oi</b>' }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ location: 'a\nb' }).success).toBe(false);
    expect(
      UpdateProfileRequest.safeParse({ location: 'x'.repeat(MAX_LOCATION_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('aceita mostrar ou esconder o aniversário', () => {
    expect(UpdateProfileRequest.parse({ showBirthday: true })).toEqual({ showBirthday: true });
    expect(UpdateProfileRequest.safeParse({ showBirthday: 'sim' as never }).success).toBe(false);
  });

  it('aceita status, opções do perfil e listas sem repetir', () => {
    expect(UpdateProfileRequest.parse({ status: '  na vibe  ' })).toEqual({ status: 'na vibe' });
    expect(UpdateProfileRequest.parse({ lookingFor: 'chat', pronouns: 'they' })).toEqual({
      lookingFor: 'chat',
      pronouns: 'they',
    });
    expect(
      UpdateProfileRequest.parse({ interests: ['music', 'dance'], languages: ['pt', 'en'] }),
    ).toEqual({ interests: ['music', 'dance'], languages: ['pt', 'en'] });
    expect(UpdateProfileRequest.safeParse({ interests: ['music', 'music'] }).success).toBe(false);
    expect(
      UpdateProfileRequest.safeParse({
        interests: ['music', 'dance', 'games', 'movies', 'travel', 'art', 'books'],
      }).success,
    ).toBe(false);
    expect(UpdateProfileRequest.safeParse({ lookingFor: 'nada' as never }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ pronouns: 'ele' as never }).success).toBe(false);
  });

  it('respeita o limite e recusa campos fora do contrato', () => {
    expect(UpdateProfileRequest.safeParse({ bio: 'x'.repeat(MAX_BIO_LENGTH) }).success).toBe(true);
    expect(UpdateProfileRequest.safeParse({ bio: 'x'.repeat(MAX_BIO_LENGTH + 1) }).success).toBe(
      false,
    );
    expect(UpdateProfileRequest.safeParse({ bio: 'oi', role: 'ADMIN' as never }).success).toBe(
      false,
    );
  });
});

describe('ProfilePhotoUpload', () => {
  it('aceita os formatos suportados e exige base64 com tamanho mínimo', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp'] as const) {
      expect(ProfilePhotoUpload.safeParse({ mime, data: 'a'.repeat(32) }).success).toBe(true);
    }
    expect(ProfilePhotoUpload.safeParse({ mime: 'image/gif', data: 'a'.repeat(32) }).success).toBe(
      false,
    );
    expect(ProfilePhotoUpload.safeParse({ mime: 'image/png', data: 'abc' }).success).toBe(false);
    expect(
      ProfilePhotoUpload.safeParse({ mime: 'image/png', data: 'a'.repeat(32), extra: 1 }).success,
    ).toBe(false);
  });
});

describe('nameSearchKey', () => {
  it('remove acento, caixa e espaços extras (busca de membros)', () => {
    expect(nameSearchKey('  Ána   Souza ')).toBe('ana souza');
    expect(nameSearchKey('JOÃO')).toBe('joao');
    expect(nameSearchKey('Ação')).toBe('acao');
  });
});

describe('RegisterRequest', () => {
  it('normaliza o e-mail (espaços e caixa)', () => {
    expect(RegisterRequest.parse(VALID).email).toBe('ana@example.com');
  });

  it.each([
    ['senha curta', { ...VALID, password: 'curta' }],
    ['nome com símbolo', { ...VALID, displayName: 'Ana<script>' }],
    ['nome curto', { ...VALID, displayName: 'A' }],
    ['data fora do formato', { ...VALID, birthDate: '20/05/1990' }],
    ['campo extra (papel)', { ...VALID, role: 'ADMIN' }],
    ['sem aceitar os termos', { ...VALID, acceptTerms: false }],
  ])('rejeita %s', (_, value) => {
    expect(RegisterRequest.safeParse(value).success).toBe(false);
  });
});

describe('RealtimeTicketClaims', () => {
  it('exige ids válidos', () => {
    const claims = {
      sub: '0b9a2a52-5f3c-4c1e-9d3b-2f1f6c0e8a11',
      name: 'Ana Souza',
      blocked: [],
      avatar: DEFAULT_AVATAR,
      mutedUntil: null,
    };
    expect(RealtimeTicketClaims.safeParse(claims).success).toBe(true);
    expect(RealtimeTicketClaims.safeParse({ ...claims, sub: '1' }).success).toBe(false);
  });
});

describe('nome reservado', () => {
  it('recusa "Conta excluída" no cadastro, com ou sem acento e em qualquer caixa', () => {
    const base = {
      email: 'ana@example.com',
      password: 'senha-bem-longa',
      birthDate: '1990-01-01',
      acceptTerms: true,
    };
    for (const displayName of ['Conta excluída', 'conta excluida', 'CONTA EXCLUÍDA']) {
      expect(RegisterRequest.safeParse({ ...base, displayName }).success).toBe(false);
    }
    expect(RegisterRequest.safeParse({ ...base, displayName: 'Conta nova' }).success).toBe(true);
  });
});
