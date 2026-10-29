import { describe, expect, it } from 'vitest';
import {
  MAX_BIO_LENGTH,
  RealtimeTicketClaims,
  RegisterRequest,
  UpdateProfileRequest,
  isAdult,
} from './auth.ts';
import { DEFAULT_AVATAR } from './avatar.ts';

const VALID = {
  email: '  Ana@Example.COM ',
  password: 'senha-bem-longa',
  displayName: 'Ana Souza',
  birthDate: '1990-05-20',
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
    };
    for (const displayName of ['Conta excluída', 'conta excluida', 'CONTA EXCLUÍDA']) {
      expect(RegisterRequest.safeParse({ ...base, displayName }).success).toBe(false);
    }
    expect(RegisterRequest.safeParse({ ...base, displayName: 'Conta nova' }).success).toBe(true);
  });
});
