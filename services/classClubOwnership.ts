// Who owns a file shared into a class, and so whose storage it counts against.
//   - Admins, staff and volunteers (a class's teachers included) uploading on an org's class: the org.
//   - Students and everyone else: the uploader's own account, even inside an org's class.
//   - A class with no org: the uploader's own account.
// The class only ever holds a copy record pointing at the file, so removing or editing the copy never
// touches the original. Pure module: the server decides with it, tests check it.

export type ClubUploadScope = { kind: 'org' | 'user'; id: string };

export interface ClubOrgFacts {
  creatorId?: string;
  admins?: string[];
  staffUids?: string[];
  pastorUids?: string[];
}

export interface ClubMembershipFacts {
  status?: string;
  role?: string;
  isEmployee?: boolean;
  roleKey?: string;
  roleKeys?: string[];
}

const STAFF_ROLES = new Set(['OWNER', 'ADMIN', 'STAFF', 'MODERATOR']);
const STAFF_ROLE_KEY = /VOLUNTEER|STAFF|INSTRUCTOR|TEACHER|ADMIN/i;

export function isOrgWorker(uid: string, org: ClubOrgFacts | null | undefined, memberships: ClubMembershipFacts[] = []): boolean {
  if (org && (org.creatorId === uid || (org.admins || []).includes(uid)
    || (org.staffUids || []).includes(uid) || (org.pastorUids || []).includes(uid))) return true;
  return memberships.some(m => m.status === 'ACTIVE' && (
    STAFF_ROLES.has(String(m.role)) || !!m.isEmployee
    || [m.roleKey, ...(m.roleKeys || [])].some(k => !!k && STAFF_ROLE_KEY.test(k))
  ));
}

export function resolveClubUploadScope(input: {
  uid: string;
  orgId?: string | null;
  isClassTeacher: boolean;
  isClassStudent: boolean;
  org?: ClubOrgFacts | null;
  memberships?: ClubMembershipFacts[];
}): ClubUploadScope {
  const { uid, orgId, isClassTeacher, isClassStudent, org, memberships } = input;
  if (!orgId) return { kind: 'user', id: uid };
  if (isClassTeacher) return { kind: 'org', id: orgId };
  // A staff member enrolled as a student here is participating: their work stays theirs.
  if (isClassStudent) return { kind: 'user', id: uid };
  return isOrgWorker(uid, org, memberships) ? { kind: 'org', id: orgId } : { kind: 'user', id: uid };
}
