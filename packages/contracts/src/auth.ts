import { z } from 'zod';
import { DELETED_ACCOUNT_NAME } from './account.ts';
import { AvatarConfig } from './avatar.ts';
import { MAX_FRIENDS } from './friends.ts';

/**
 * Idade mínima. ATENÇÃO: no MVP a idade é só declarada (data de nascimento), o que NÃO é garantia
 * suficiente para lançamento (especificação, seção 8). A estratégia de verificação está pendente.
 */
export const MIN_AGE = 18;

/** Como a idade foi estabelecida. SELF_DECLARED NÃO é garantia suficiente para lançamento. */
export const AgeAssurance = z.enum(['SELF_DECLARED', 'VERIFIED']);
export type AgeAssurance = z.infer<typeof AgeAssurance>;

export const ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Selo curto da equipe (só para MODERATOR/ADMIN), usado para identificar quem é da moderação. */
export const staffTag = (role: string | undefined): string | undefined => {
  if (role === 'ADMIN') return 'ADM';
  if (role === 'MODERATOR') return 'MOD';
  return undefined;
};

export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const Password = z.string().min(10).max(128);

/** Nome público: começa com letra ou número; letras, números, espaço, `_`, `.` e `-`. */
export const DisplayName = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u, 'Use letras, números, espaço, _, . ou -');

/** Sem acentos e em minúsculas, para comparar nomes "iguais à vista". */
const plain = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export const RegisterRequest = z.strictObject({
  email: Email,
  password: Password,
  // Ninguém se cadastra como "Conta excluída": na moderação pareceria uma conta anonimizada.
  displayName: DisplayName.refine((name) => plain(name) !== plain(DELETED_ACCOUNT_NAME), {
    message: 'Este nome é reservado.',
  }),
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
  /** Nível de garantia de idade da conta. */
  ageAssurance: AgeAssurance;
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
/**
 * O cliente renova o ticket na sala neste intervalo. O realtime tira da sala quem deixa o ticket
 * vencer: é assim que suspensão e silenciamento chegam a quem já está conectado (em até 60 s).
 */
export const TICKET_REFRESH_INTERVAL_MS = 20_000;
/** Limite de bloqueios carregados no ticket; acima disso o ticket ficaria grande demais. */
export const MAX_BLOCKS_IN_TICKET = 500;

export const RealtimeTicketClaims = z.object({
  sub: z.uuid(),
  name: DisplayName,
  /** Papel da conta: o realtime identifica a equipe (selo) e autoriza o anúncio. */
  role: z.enum(ROLES).default('USER'),
  /** Ids de quem este usuário bloqueou. */
  blocked: z.array(z.uuid()).max(MAX_BLOCKS_IN_TICKET),
  /** Aparência salva (validada pela API); o realtime repassa para os outros jogadores. */
  avatar: AvatarConfig,
  /** Silenciado pela moderação até este instante (epoch ms); `null` = pode usar o chat. */
  mutedUntil: z.int().positive().nullable(),
  /**
   * Ids dos amigos (amizade aceita): mensagem privada só entre amigos. Opcional para aceitar
   * tickets de uma API anterior durante o deploy.
   */
  friends: z.array(z.uuid()).max(MAX_FRIENDS).default([]),
  /** Garantia de idade da conta (o realtime confia porque só a API assina o ticket). */
  ageAssurance: AgeAssurance.default('SELF_DECLARED'),
});
export type RealtimeTicketClaims = z.infer<typeof RealtimeTicketClaims>;

export interface RealtimeTicketResponse {
  ticket: string;
  expiresAt: string;
}

/** Método de verificação de idade suportado (provedor/documento). */
export const AgeVerificationMethod = z.enum(['documento', 'selfie']);
export type AgeVerificationMethod = z.infer<typeof AgeVerificationMethod>;

/** Inicia uma verificação de idade: o cliente escolhe o método e recebe uma referência. */
export const AgeVerificationRequest = z.strictObject({
  method: AgeVerificationMethod,
});
export type AgeVerificationRequest = z.infer<typeof AgeVerificationRequest>;

/** Confirma a verificação (callback do provedor ou confirmação do cliente na referência). */
export const AgeVerificationComplete = z.strictObject({
  reference: z.string().min(1).max(128),
  method: AgeVerificationMethod,
});
export type AgeVerificationComplete = z.infer<typeof AgeVerificationComplete>;

/** Status atual de garantia de idade da conta. */
export const AgeVerificationStatus = z.strictObject({
  ageAssurance: AgeAssurance,
  ageVerifiedAt: z.string().datetime().nullable(),
  ageVerificationMethod: AgeVerificationMethod.nullable(),
});
export type AgeVerificationStatus = z.infer<typeof AgeVerificationStatus>;
