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

/** Decisão de quem modera sobre uma denúncia aberta. */
export const ReviewReportRequest = z.strictObject({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  note: z.string().trim().max(1000).optional(),
});
export type ReviewReportRequest = z.infer<typeof ReviewReportRequest>;

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
