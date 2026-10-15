import { staffTag } from '@3dx/contracts';

/** Selo da equipe (ADM/MOD) ao lado do nome; nada aparece para quem é usuário comum. */
export function StaffBadge({ role }: { role: string | undefined }) {
  const tag = staffTag(role);
  return tag ? <span className="badge badge-staff">{tag}</span> : null;
}
