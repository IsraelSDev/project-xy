import { z } from 'zod';
import { ROLES } from './auth.ts';

export const AdminUserSummary = z.strictObject({
  id: z.uuid(),
  email: z.string().email(),
  displayName: z.string(),
  role: z.enum(ROLES),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type AdminUserSummary = z.infer<typeof AdminUserSummary>;

export const AdminListUsersRequest = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  take: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminListUsersRequest = z.infer<typeof AdminListUsersRequest>;

export const AdminUpdateRoleRequest = z.strictObject({
  role: z.enum(ROLES),
});
export type AdminUpdateRoleRequest = z.infer<typeof AdminUpdateRoleRequest>;

export interface AdminUsersPage {
  users: AdminUserSummary[];
  total: number;
  page: number;
  take: number;
}

/** Nome anterior de uma troca de nome, para a moderação (mais recente primeiro). */
export interface NameChangeSummary {
  previousName: string;
  changedAt: string;
}
