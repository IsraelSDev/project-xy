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

/**
 * Chave de busca do nome (coluna `User.searchKey`): sem acento, minúscula e com espaços
 * colapsados, para "ana" encontrar "Ána" e "Ana  Souza" casar com "ana souza".
 */
export function nameSearchKey(name: string): string {
  return plain(name).replace(/\s+/g, ' ').trim();
}

/** Nome aceito no cadastro e na troca de nome: as regras acima, menos o nome reservado. */
export const ProfileDisplayName = DisplayName.refine(
  (name) => plain(name) !== plain(DELETED_ACCOUNT_NAME),
  { message: 'Este nome é reservado.' },
);

/** Versão dos Termos de Uso/Política de Privacidade aceita no cadastro (data da revisão). */
export const TERMS_VERSION = '2026-10-31';

export const RegisterRequest = z.strictObject({
  email: Email,
  password: Password,
  // Ninguém se cadastra como "Conta excluída": na moderação pareceria uma conta anonimizada.
  displayName: ProfileDisplayName,
  /** Data no formato AAAA-MM-DD. */
  birthDate: z.iso.date(),
  /** O cadastro só vale com o aceite explícito dos termos (registrado com a versão e a data). */
  acceptTerms: z.boolean().refine((value) => value === true, {
    message: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.',
  }),
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

/** Tamanho máximo da bio do perfil (texto puro, sem HTML). */
export const MAX_BIO_LENGTH = 300;

/** Bio do perfil: sem espaços nas pontas, no máximo `MAX_BIO_LENGTH`; vazio = sem bio. */
export const ProfileBio = z.string().trim().max(MAX_BIO_LENGTH);

/** Localização opcional do perfil (cidade/região), texto puro e curto. */
export const MAX_LOCATION_LENGTH = 60;
export const ProfileLocation = z
  .string()
  .trim()
  .max(MAX_LOCATION_LENGTH)
  .refine((value) => !/[<>\r\n]/.test(value), {
    message: 'A localização não pode ter HTML nem quebras de linha.',
  });

/** Status curto do perfil ("hoje tô na vibe de…"). */
export const MAX_STATUS_LENGTH = 80;
export const ProfileStatus = z
  .string()
  .trim()
  .max(MAX_STATUS_LENGTH)
  .refine((value) => !/[<>\r\n]/.test(value), {
    message: 'O status não pode ter HTML nem quebras de linha.',
  });

/** Opções de perfil: ids estáveis (os rótulos ficam na interface). */
export const PROFILE_INTERESTS = [
  { id: 'music', label: 'Música' },
  { id: 'dance', label: 'Dança' },
  { id: 'games', label: 'Games' },
  { id: 'movies', label: 'Filmes e séries' },
  { id: 'travel', label: 'Viagens' },
  { id: 'art', label: 'Arte' },
  { id: 'fashion', label: 'Moda' },
  { id: 'photos', label: 'Fotografia' },
  { id: 'sports', label: 'Esportes' },
  { id: 'books', label: 'Livros' },
  { id: 'anime', label: 'Anime' },
  { id: 'tech', label: 'Tecnologia' },
  { id: 'nature', label: 'Natureza' },
  { id: 'pets', label: 'Pets' },
  { id: 'cooking', label: 'Cozinha' },
] as const;

export const PROFILE_LOOKING_FOR = [
  { id: 'chat', label: 'Conversar' },
  { id: 'friends', label: 'Amizades' },
  { id: 'dance', label: 'Dançar' },
  { id: 'romance', label: 'Romance' },
  { id: 'chill', label: 'Só curtir' },
] as const;

export const PROFILE_LANGUAGES = [
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'Inglês' },
  { id: 'es', label: 'Espanhol' },
  { id: 'fr', label: 'Francês' },
  { id: 'de', label: 'Alemão' },
  { id: 'it', label: 'Italiano' },
] as const;

export const PROFILE_PRONOUNS = [
  { id: 'she', label: 'Ela/dela' },
  { id: 'he', label: 'Ele/dele' },
  { id: 'they', label: 'Elu/delu' },
] as const;

export type ProfileInterest = (typeof PROFILE_INTERESTS)[number]['id'];
export type ProfileLookingFor = (typeof PROFILE_LOOKING_FOR)[number]['id'];
export type ProfileLanguage = (typeof PROFILE_LANGUAGES)[number]['id'];
export type ProfilePronouns = (typeof PROFILE_PRONOUNS)[number]['id'];

const optionIds = <Id extends string>(items: readonly { id: Id }[]) =>
  items.map((item) => item.id) as [Id, ...Id[]];

export const ProfileInterestId = z.enum(optionIds(PROFILE_INTERESTS));
export const ProfileLookingForId = z.enum(optionIds(PROFILE_LOOKING_FOR));
export const ProfileLanguageId = z.enum(optionIds(PROFILE_LANGUAGES));
export const ProfilePronounsId = z.enum(optionIds(PROFILE_PRONOUNS));

/** Lista de ids sem repetir; `max` limita quantas cabem no perfil. */
const uniqueIds = <T extends z.ZodType<string>>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .refine((list) => new Set(list).size === list.length, { message: 'Sem repetir opções.' });

/** Cliente -> servidor: salva bio, localização, status, opções e/ou o nome de exibição. */
export const UpdateProfileRequest = z
  .strictObject({
    bio: ProfileBio.nullable().optional(),
    location: ProfileLocation.nullable().optional(),
    status: ProfileStatus.nullable().optional(),
    lookingFor: ProfileLookingForId.nullable().optional(),
    pronouns: ProfilePronounsId.nullable().optional(),
    interests: uniqueIds(ProfileInterestId, 6).optional(),
    languages: uniqueIds(ProfileLanguageId, 3).optional(),
    /** Mostra dia e mês do aniversário no perfil público (o ano nunca é exposto). */
    showBirthday: z.boolean().optional(),
    displayName: ProfileDisplayName.optional(),
  })
  .refine(
    (update) =>
      update.bio !== undefined ||
      update.location !== undefined ||
      update.status !== undefined ||
      update.lookingFor !== undefined ||
      update.pronouns !== undefined ||
      update.interests !== undefined ||
      update.languages !== undefined ||
      update.showBirthday !== undefined ||
      update.displayName !== undefined,
    { message: 'Informe algum campo do perfil.' },
  );
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

/** Intervalo mínimo entre trocas de nome (evita assédio/impersonação por renomeação). */
export const DISPLAY_NAME_COOLDOWN_MS = 24 * 60 * 60_000;

/** Intervalo mínimo entre dois "entrou na sala" no feed (o ticket é renovado com frequência). */
export const PROFILE_ROOM_EVENT_COOLDOWN_MS = 45 * 60_000;

/** Atividade pública do perfil: sem valores antigos, só o fato (quem vê o perfil vê a lista). */
export const PROFILE_EVENT_KINDS = [
  'JOINED',
  'BIO',
  'PHOTO',
  'NAME',
  'FRIEND',
  'AVATAR',
  'ROOM',
] as const;
export type ProfileEventKind = (typeof PROFILE_EVENT_KINDS)[number];

export interface ProfileActivityItem {
  kind: ProfileEventKind;
  at: string;
}

/** Foto do perfil: imagem pequena, já redimensionada no cliente (o corpo público pesa). */
export const MAX_PHOTO_BYTES = 256 * 1024;

/** Formatos aceitos na foto do perfil (o cliente manda JPEG; PNG/WebP valem para importar). */
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Cliente -> servidor: foto em base64 (sem o prefixo `data:`), até `MAX_PHOTO_BYTES` decodificada. */
export const ProfilePhotoUpload = z.strictObject({
  mime: z.enum(PHOTO_MIME_TYPES),
  data: z
    .string()
    .min(24)
    .max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8),
});
export type ProfilePhotoUpload = z.infer<typeof ProfilePhotoUpload>;

/** Perfil público: o que qualquer membro logado vê de outro (ou de si). */
export interface PublicProfile {
  id: string;
  displayName: string;
  createdAt: string;
  /** Texto livre do perfil; `null` quando a pessoa não escreveu nada. */
  bio: string | null;
  /** Cidade/região opcional; `null` quando não informada. */
  location: string | null;
  /** Frase curta do perfil; `null` quando não informada. */
  status: string | null;
  /** O que a pessoa procura na casa; `null` = não informado. */
  lookingFor: ProfileLookingFor | null;
  /** Pronomes escolhidos; `null` = não informado. */
  pronouns: ProfilePronouns | null;
  /** Interesses do perfil (ids do catálogo). */
  interests: ProfileInterest[];
  /** Idiomas (ids do catálogo). */
  languages: ProfileLanguage[];
  /** Dia e mês do aniversário (sem ano); `null` = não mostrado ou não informado. */
  birthday: { day: number; month: number } | null;
  role: Role;
  /** Idade verificada por provedor (selo no perfil). */
  verifiedAdult: boolean;
  /** Quando a foto atual foi enviada; `null` = sem foto. Também serve de `?v=` no `<img>`. */
  photoUpdatedAt: string | null;
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
  /** Ids dos amigos (amizade aceita): mensagem privada só entre amigos. Opcional para aceitar
   * tickets de uma API anterior durante o deploy.
   */
  friends: z.array(z.uuid()).max(MAX_FRIENDS).default([]),
  /**
   * Versão da foto do perfil (ISO); `null`/ausente = sem foto. O cliente usa como `?v=` no `<img>`
   * da lista da sala. Opcional para aceitar tickets de uma API anterior durante o deploy.
   */
  photoUpdatedAt: z.string().datetime().nullable().optional(),
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
