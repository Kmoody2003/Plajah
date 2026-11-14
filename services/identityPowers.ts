// Being in an org's account versus speaking for it. Opening an org's files puts any member in its account, so what
// they do next is filed in the right place. That alone gives them nothing: posting as the org stays with those who
// hold that power. Pure, so tests hold it.

import type { Organization, OrgMembership } from '../types';
import { permissionsForMember } from './orgPermissions';

type OrgLists = Pick<Organization, 'creatorId' | 'admins'> & Partial<Pick<Organization, 'staffUids' | 'itAdminUids'>>;
type Seat = Pick<OrgMembership, 'status' | 'role' | 'permissions'> & Partial<Pick<OrgMembership, 'isEmployee'>>;

const runsOrg = (uid: string, org: OrgLists) =>
  org.creatorId === uid || !!org.admins?.includes(uid) || !!org.staffUids?.includes(uid) || !!org.itAdminUids?.includes(uid);

/** Does this person belong to this org at all? A pending or ended seat doesn't count. */
export function belongsToOrg(uid: string | null | undefined, org: OrgLists | null | undefined, seat: Seat | null | undefined): boolean {
  if (!uid || !org) return false;
  return runsOrg(uid, org) || seat?.status === 'ACTIVE';
}

/** May this person's posts carry the org's name? An ordinary member's never do. */
export function canPostAsOrg(uid: string | null | undefined, org: OrgLists | null | undefined, seat: Seat | null | undefined): boolean {
  if (!uid || !org) return false;
  if (runsOrg(uid, org)) return true;
  if (seat?.status !== 'ACTIVE') return false;
  return !!seat.isEmployee || permissionsForMember(seat).has('POST_AS_ORG');
}
