import { z } from 'zod';

export const REPORT_REASONS = [
  'HARASSMENT',
  'SPAM',
  'INAPPROPRIATE_CONTENT',
  'UNDERAGE',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const BlockRequest = z.strictObject({ userId: z.uuid() });
export type BlockRequest = z.infer<typeof BlockRequest>;

export const CreateReportRequest = z.strictObject({
  reportedUserId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});
export type CreateReportRequest = z.infer<typeof CreateReportRequest>;

export const SANCTION_TYPES = ['MUTE', 'SUSPEND'] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];

/** Sanção mais longa com prazo: um ano. Além disso, só suspensão permanente. */
export const MAX_SANCTION_HOURS = 24 * 365;

const SanctionHours = z.int().min(1).max(MAX_SANCTION_HOURS);

/**
 * Sanção aplicada ao resolver uma denúncia. Silenciar (sem chat) sempre tem prazo; suspender
 * (sem login nem salas) pode ser permanente (`hours: null`).
 */
export const SanctionInput = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('MUTE'), hours: SanctionHours }),
  z.strictObject({ type: z.literal('SUSPEND'), hours: SanctionHours.nullable() }),
]);
export type SanctionInput = z.infer<typeof SanctionInput>;

/** Sanção direta (sem denúncia), ex.: flagrante numa sala. O motivo fica registrado. */
export const DirectSanctionRequest = z.strictObject({
  userId: z.uuid(),
  sanction: SanctionInput,
  reason: z.string().trim().min(3).max(500),
});
export type DirectSanctionRequest = z.infer<typeof DirectSanctionRequest>;

/** Decisão de quem modera sobre uma denúncia aberta. Sanção só vale ao resolver. */
export const ReviewReportRequest = z
  .strictObject({
    status: z.enum(['RESOLVED', 'DISMISSED']),
    note: z.string().trim().max(1000).optional(),
    sanction: SanctionInput.optional(),
  })
  .refine((review) => !review.sanction || review.status === 'RESOLVED', {
    message: 'Sanção só pode ser aplicada ao resolver a denúncia.',
    path: ['sanction'],
  });
export type ReviewReportRequest = z.infer<typeof ReviewReportRequest>;

export const RevokeSanctionRequest = z.strictObject({
  note: z.string().trim().max(1000).optional(),
});
export type RevokeSanctionRequest = z.infer<typeof RevokeSanctionRequest>;

export interface UserRef {
  id: string;
  displayName: string;
}

export interface BlockedUser extends UserRef {
  blockedAt: string;
}

export interface ReportSummary {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reporter: UserRef;
  reported: UserRef;
}

export interface SanctionSummary {
  id: string;
  type: SanctionType;
  user: UserRef;
  createdBy: UserRef;
  /** `null` = sanção direta, sem denúncia. */
  reportId: string | null;
  /** Motivo registrado por quem aplicou (só a moderação vê). */
  reason: string | null;
  createdAt: string;
  /** `null` = permanente (só suspensão). */
  endsAt: string | null;
}
