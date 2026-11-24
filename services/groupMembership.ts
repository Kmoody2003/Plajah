// groupMembership — the two rules behind a ministry / department / sub-group's button.
import type { Ministry, OrgMembership } from '../types';

/** Public groups show Follow instead of Join. */
export const isPublicGroup = (m: Pick<Ministry, 'allowFollowers' | 'threadAudience'>): boolean =>
  !!m.allowFollowers || m.threadAudience === 'PUBLIC';

/** In the group as one of its heads, by roster (ministryIds), or by holding a role there. */
export function isInGroup(
  m: Pick<Ministry, 'id' | 'headUids'>,
  membership: Pick<OrgMembership, 'ministryIds' | 'ministryRoles'> | null | undefined,
  uid: string | undefined,
): boolean {
  if (!uid) return false;
  return (m.headUids || []).includes(uid)
    || !!membership?.ministryIds?.includes(m.id)
    || !!membership?.ministryRoles?.some(r => r.ministryId === m.id);
}
