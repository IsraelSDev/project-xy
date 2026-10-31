import { z } from 'zod';
import type { AvatarConfig } from './avatar.ts';
import type {
  ProfileInterest,
  ProfileLanguage,
  ProfileLookingFor,
  ProfilePronouns,
  Role,
} from './auth.ts';
import type { ConversationKind } from './conversations.ts';
import type { FriendEntry } from './friends.ts';
import type { ReportReason, ReportStatus, SanctionType, UserRef } from './safety.ts';

/** Exclusão da própria conta: exige a senha atual (quem só tem o cookie não exclui a conta). */
export const DeleteAccountRequest = z.strictObject({
  password: z.string().min(1).max(128),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

/** Nome exibido no lugar de uma conta excluída (denúncias, sanções e auditoria). */
export const DELETED_ACCOUNT_NAME = 'Conta excluída';

/**
 * Cópia dos dados da própria conta (direito de acesso). Denúncias recebidas ficam de fora: revelariam
 * quem denunciou. As sanções recebidas entram.
 */
export interface AccountExport {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    birthDate: string | null;
    role: Role;
    avatar: AvatarConfig;
    createdAt: string;
    /** Dados do perfil social (também são dados pessoais: entram na exportação). */
    location: string | null;
    status: string | null;
    lookingFor: ProfileLookingFor | null;
    pronouns: ProfilePronouns | null;
    interests: ProfileInterest[];
    languages: ProfileLanguage[];
    showBirthday: boolean;
  };
  sessions: { createdAt: string; expiresAt: string }[];
  blocks: { user: UserRef; createdAt: string }[];
  friends: FriendEntry[];
  reportsMade: {
    id: string;
    reported: UserRef;
    reason: ReportReason;
    details: string | null;
    status: ReportStatus;
    createdAt: string;
  }[];
  sanctionsReceived: {
    type: SanctionType;
    createdAt: string;
    endsAt: string | null;
    revokedAt: string | null;
  }[];
  /** Mensagens da própria pessoa (enviadas ou recebidas), guardadas para a administração (ADR 0015). */
  messages: {
    kind: ConversationKind;
    roomId: string | null;
    from: UserRef;
    to: UserRef | null;
    text: string;
    sentAt: string;
  }[];
}
