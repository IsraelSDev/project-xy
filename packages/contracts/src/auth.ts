import { z } from 'zod';
import { AvatarConfig } from './avatar.ts';

/**
 * Idade mínima. ATENÇÃO: no MVP a idade é só declarada (data de nascimento), o que NÃO é garantia
 * suficiente para lançamento (especificação, seção 8). A estratégia de verificação está pendente.
 */
export const MIN_AGE = 18;

export const ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const Password = z.string().min(10).max(128);

/** Nome público: começa com letra ou número; letras, números, espaço, `_`, `.` e `-`. */
export const DisplayName = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u, 'Use letras, números, espaço, _, . ou -');

export const RegisterRequest = z.strictObject({
  email: Email,
  password: Password,
  displayName: DisplayName,
  /** Data no formato AAAA-MM-DD. */
  birthDate: z.iso.date(),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.strictObject({
  email: Email,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** Usuário da sessão atual (só para o próprio dono: inclui e-mail). */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface PublicProfile {
  id: string;
  displayName: string;
  createdAt: string;
}

/** `birthDate` (AAAA-MM-DD) já completou `MIN_AGE` anos em `today` (UTC)? */
export function isAdult(birthDate: string, today: Date): boolean {
  const [year, month, day] = birthDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const age =
    today.getUTCFullYear() -
    year -
    (today.getUTCMonth() + 1 < month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)
      ? 1
      : 0);
  return age >= MIN_AGE && age <= 120;
}

/** Ticket que a API assina para o cliente entrar no realtime (curta duração). */
export const TICKET_ISSUER = '3dx-api';
export const TICKET_AUDIENCE = '3dx-realtime';
export const TICKET_TTL_SECONDS = 60;
/** Limite de bloqueios carregados no ticket; acima disso o ticket ficaria grande demais. */
export const MAX_BLOCKS_IN_TICKET = 500;

export const RealtimeTicketClaims = z.object({
  sub: z.uuid(),
  name: DisplayName,
  /** Ids de quem este usuário bloqueou. */
  blocked: z.array(z.uuid()).max(MAX_BLOCKS_IN_TICKET),
  /** Aparência salva (validada pela API); o realtime repassa para os outros jogadores. */
  avatar: AvatarConfig,
});
export type RealtimeTicketClaims = z.infer<typeof RealtimeTicketClaims>;

export interface RealtimeTicketResponse {
  ticket: string;
  expiresAt: string;
}
