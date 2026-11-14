// elevateRoles — the role catalog + access gate for Plajah Elevate (churches, faith, cultural, nonprofit).
//
// Builds on orgPermissions.ts: a membership's powers = its explicit `permissions` override, else the
// union of the permissions of its `roleKey`, `roleKeys`, and any `ministryRoles` in this catalog, else the OrgRole
// default. Least privilege: money is the owner, IT Admins, Senior Pastors and finance roles only; prayer requests are pastors + ministers +
// Prayer Warriors only; a pastor can hand a member the TRUSTEE role (an elevated volunteer).
//
// Teaching Credential Distinction:
// - `TEACHER` is reserved platform-wide for credentialed educational & Academia school teachers.
// - `INSTRUCTOR` is used in Elevate & Christian Education for non-credentialed people teaching a class
//   at a church, ministry, or community organization.
//
// Multi-Department & Multi-Role Support:
// - Any person can belong to multiple departments (`ministryIds`) and hold multiple roles simultaneously
//   both org-wide (`roleKeys`) and per-department (`ministryRoles`), including `DEPARTMENT_HEAD`,
//   `DEPARTMENT_ADMIN`, `INSTRUCTOR`, and `DEPARTMENT_VOLUNTEER`.

import type { Organization, OrgMembership, OrgPermission, OrgRole, RosterGroup, UserProfile } from '../types';
import { FINANCE_PERMISSIONS, ROLE_PERMISSIONS, isFinanceLead, isOrgOwner } from './orgPermissions';

export interface ElevateRoleDef {
  key: string;
  label: string;
  description: string;
  baseRole: OrgRole;
  rosterGroup: RosterGroup;
  permissions: OrgPermission[];
  /** Role keys allowed to assign this role. Empty = owners/senior pastors only. */
  assignableBy?: string[];
  /** Shown on the public page roster. */
  isPublic?: boolean;
  /** Counts toward the pastorUids index (prayer + pastoral powers). */
  isPastoral?: boolean;
  /** True when this role is typically scoped to one or more departments/ministries. */
  isDepartmentRole?: boolean;
  /** Distinguishes non-credentialed org class instructors from credentialed Academia teachers. */
  teachingTier?: 'ORG_INSTRUCTOR_NON_CREDENTIALED';
}

const POST = ['POST_AS_ORG'] as OrgPermission[];

export const ELEVATE_ROLES: ElevateRoleDef[] = [
  { key: 'IT_ADMIN', label: 'IT Admin', description: 'Master access inside this organization. Sets up the first finance roles. The owner is always one.', baseRole: 'ADMIN', rosterGroup: 'STAFF', isPublic: false, assignableBy: ['IT_ADMIN'],
    permissions: ['MANAGE_ACCOUNTING','VIEW_ACCOUNTING','SUBMIT_EXPENSES','APPROVE_EXPENSES','EDIT_PAGE','MANAGE_EMPLOYEES','MANAGE_ROLES','POST_AS_ORG','MANAGE_MONEY','MANAGE_CONTENT','MANAGE_ORDERS','VIEW_ANALYTICS','MANAGE_GIVING','VIEW_GIVING','VIEW_PRAYER','MANAGE_PRAYER','MANAGE_SERMONS','MANAGE_MEDIA','MANAGE_MINISTRIES','MANAGE_ROSTER','ASSIGN_ROLES','MANAGE_STORE','MODERATE_THREADS','MANAGE_INVITES'] },
  { key: 'SENIOR_PASTOR', label: 'Senior Pastor', description: 'Lead of the institution. Full control.', baseRole: 'ADMIN', rosterGroup: 'PASTORAL', isPublic: true, isPastoral: true,
    permissions: ['MANAGE_ACCOUNTING','VIEW_ACCOUNTING','SUBMIT_EXPENSES','APPROVE_EXPENSES','EDIT_PAGE','MANAGE_EMPLOYEES','MANAGE_ROLES','POST_AS_ORG','MANAGE_MONEY','MANAGE_CONTENT','MANAGE_ORDERS','VIEW_ANALYTICS','MANAGE_GIVING','VIEW_GIVING','VIEW_PRAYER','MANAGE_PRAYER','MANAGE_SERMONS','MANAGE_MEDIA','MANAGE_MINISTRIES','MANAGE_ROSTER','ASSIGN_ROLES','MANAGE_STORE','MODERATE_THREADS','MANAGE_INVITES'] },
  { key: 'PASTOR', label: 'Pastor', description: 'Pastoral leader. Sees prayer, manages ministries and the roster.', baseRole: 'ADMIN', rosterGroup: 'PASTORAL', isPublic: true, isPastoral: true, assignableBy: ['SENIOR_PASTOR'],
    permissions: ['SUBMIT_EXPENSES','EDIT_PAGE','POST_AS_ORG','MANAGE_CONTENT','VIEW_ANALYTICS','VIEW_PRAYER','MANAGE_PRAYER','MANAGE_SERMONS','MANAGE_MINISTRIES','MANAGE_ROSTER','ASSIGN_ROLES','MODERATE_THREADS','MANAGE_INVITES','MANAGE_EMPLOYEES'] },
  { key: 'MINISTER', label: 'Minister', description: 'Ordained/licensed minister. Pastoral care + prayer.', baseRole: 'STAFF', rosterGroup: 'PASTORAL', isPublic: true, isPastoral: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: [...POST, 'MANAGE_CONTENT', 'VIEW_PRAYER', 'MANAGE_PRAYER', 'MANAGE_SERMONS', 'MODERATE_THREADS'] },
  { key: 'ELDER', label: 'Elder', description: 'Spiritual oversight; leadership roster.', baseRole: 'STAFF', rosterGroup: 'LEADERSHIP', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: [...POST, 'VIEW_ANALYTICS', 'MODERATE_THREADS'] },
  { key: 'DEACON', label: 'Deacon', description: 'Service leader; leadership roster.', baseRole: 'STAFF', rosterGroup: 'LEADERSHIP', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: [...POST, 'MODERATE_THREADS'] },
  { key: 'DEPARTMENT_HEAD', label: 'Department Head', description: 'Near-pastor operational control over their own department(s), rosters, and schedules.', baseRole: 'ADMIN', rosterGroup: 'LEADERSHIP', isPublic: true, isDepartmentRole: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: ['SUBMIT_EXPENSES','APPROVE_EXPENSES','EDIT_PAGE','POST_AS_ORG','MANAGE_CONTENT','MANAGE_ORDERS','VIEW_ANALYTICS','MANAGE_MINISTRIES','MANAGE_ROSTER','ASSIGN_ROLES','MODERATE_THREADS','MANAGE_INVITES','MANAGE_MEDIA'] },
  { key: 'DEPARTMENT_ADMIN', label: 'Department Administrator', description: 'Coordinates schedules, rosters, classes, events, and communications for one or more departments.', baseRole: 'STAFF', rosterGroup: 'LEADERSHIP', isPublic: false, isDepartmentRole: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD'],
    permissions: ['SUBMIT_EXPENSES', ...POST, 'MANAGE_CONTENT', 'VIEW_ANALYTICS', 'MANAGE_ROSTER', 'ASSIGN_ROLES', 'MODERATE_THREADS', 'MANAGE_INVITES'] },
  { key: 'INSTRUCTOR', label: 'Instructor', description: 'Non-credentialed class instructor or catechist teaching a church/organization class (distinct from credentialed Academia school Teachers).', baseRole: 'STAFF', rosterGroup: 'VOLUNTEER', isPublic: false, isDepartmentRole: true, teachingTier: 'ORG_INSTRUCTOR_NON_CREDENTIALED', assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD', 'DEPARTMENT_ADMIN'],
    permissions: [...POST, 'MANAGE_CONTENT', 'MODERATE_THREADS'] },
  { key: 'FINANCE_DIRECTOR', label: 'Finance Director', description: 'Sets up and manages everything related to giving. Controls who else can see the money.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: true, assignableBy: ['IT_ADMIN', 'FINANCE_DIRECTOR'],
    permissions: ['MANAGE_ACCOUNTING','VIEW_ACCOUNTING','SUBMIT_EXPENSES','APPROVE_EXPENSES', ...POST, 'MANAGE_MONEY', 'MANAGE_GIVING', 'VIEW_GIVING', 'VIEW_ANALYTICS', 'MANAGE_ORDERS'] },
  { key: 'TREASURER', label: 'Treasurer', description: 'Finance team member with giving access.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: false, assignableBy: ['IT_ADMIN', 'FINANCE_DIRECTOR'],
    permissions: ['MANAGE_ACCOUNTING','VIEW_ACCOUNTING','SUBMIT_EXPENSES','APPROVE_EXPENSES', 'MANAGE_GIVING', 'VIEW_GIVING', 'VIEW_ANALYTICS'] },
  { key: 'TRUSTEE', label: 'Trustee', description: 'Elevated volunteer role. Giving oversight.', baseRole: 'MODERATOR', rosterGroup: 'LEADERSHIP', isPublic: true, assignableBy: ['IT_ADMIN', 'FINANCE_DIRECTOR'],
    permissions: ['VIEW_ACCOUNTING', 'VIEW_GIVING', 'VIEW_ANALYTICS', 'MANAGE_CONTENT'] },
  { key: 'BOOKKEEPER', label: 'Bookkeeper', description: 'Day-to-day books: journals, bills, bank reconciliation. Cannot change roles or giving setup.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: false, assignableBy: ['IT_ADMIN', 'FINANCE_DIRECTOR'],
    permissions: ['MANAGE_ACCOUNTING', 'VIEW_ACCOUNTING', 'VIEW_GIVING', 'SUBMIT_EXPENSES', 'VIEW_ANALYTICS'] },
  { key: 'ACCOUNTANT', label: 'Accountant / Auditor', description: 'External CPA or auditor — read-only access to the books and giving records.', baseRole: 'MEMBER', rosterGroup: 'VOLUNTEER', isPublic: false, assignableBy: ['IT_ADMIN', 'FINANCE_DIRECTOR'],
    permissions: ['VIEW_ACCOUNTING', 'VIEW_GIVING', 'VIEW_ANALYTICS'] },
  { key: 'FINANCE_VIEWER', label: 'Finance Viewer', description: 'Read-only finance access granted by the finance department, such as an org admin who needs to see the numbers.', baseRole: 'MEMBER', rosterGroup: 'MEMBER', isPublic: false, assignableBy: ['IT_ADMIN', 'FINANCE_DIRECTOR'],
    permissions: ['VIEW_ACCOUNTING', 'VIEW_GIVING', 'VIEW_ANALYTICS'] },
  { key: 'MEDIA_TEAM', label: 'Media Team', description: 'Sermon Studio, transcription → articles/books, livestream, Content HQ.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: false, isDepartmentRole: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD', 'DEPARTMENT_ADMIN'],
    permissions: ['SUBMIT_EXPENSES', ...POST, 'MANAGE_CONTENT', 'MANAGE_SERMONS', 'MANAGE_MEDIA', 'MANAGE_STORE'] },
  { key: 'STAFF', label: 'Staff', description: 'Paid or part-time staff member.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD'],
    permissions: ['SUBMIT_EXPENSES', ...POST, 'MANAGE_CONTENT'] },
  { key: 'PRAYER_WARRIOR', label: 'Prayer Warrior', description: 'Official volunteer/member on a ministry or intercessory prayer team. Can read the prayer queue.', baseRole: 'MEMBER', rosterGroup: 'VOLUNTEER', isPublic: false, isDepartmentRole: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'MINISTER', 'DEPARTMENT_HEAD', 'DEPARTMENT_ADMIN'],
    permissions: ['VIEW_PRAYER'] },
  { key: 'DEPARTMENT_VOLUNTEER', label: 'Department Volunteer', description: 'Assigned volunteer serving in one or more specific departments or ministries.', baseRole: 'MEMBER', rosterGroup: 'VOLUNTEER', isPublic: false, isDepartmentRole: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD', 'DEPARTMENT_ADMIN'],
    permissions: [] },
  { key: 'VOLUNTEER', label: 'Volunteer', description: 'Serves in a ministry or department.', baseRole: 'MEMBER', rosterGroup: 'VOLUNTEER', isPublic: false, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD', 'DEPARTMENT_ADMIN'],
    permissions: [] },
  { key: 'MEMBER', label: 'Member', description: 'Congregation member.', baseRole: 'MEMBER', rosterGroup: 'MEMBER', isPublic: false, permissions: [] },
];

export const ELEVATE_ROLE_MAP: Record<string, ElevateRoleDef> = Object.fromEntries(ELEVATE_ROLES.map(r => [r.key, r]));
export const ROLE_LABELS: Record<string, string> = Object.fromEntries(ELEVATE_ROLES.map(r => [r.key, r.label]));
export const getElevateRole = (key?: string): ElevateRoleDef | undefined => (key ? ELEVATE_ROLE_MAP[key] : undefined);

/** Roles that reach the org's money. Changed only through routes/elevateAccess.ts. */
export const FINANCE_ROLE_KEYS = ['FINANCE_DIRECTOR', 'TREASURER', 'TRUSTEE', 'BOOKKEEPER', 'ACCOUNTANT', 'FINANCE_VIEWER'] as const;
export const PROTECTED_ROLE_KEYS = ['IT_ADMIN', 'SENIOR_PASTOR', ...FINANCE_ROLE_KEYS] as const;
export const isProtectedRole = (key: string) => (PROTECTED_ROLE_KEYS as readonly string[]).includes(key);

/** Department-scoped role keys that can be assigned per ministry/department (a person may hold several). */
export const DEPARTMENT_SCOPED_ROLE_KEYS = [
  'DEPARTMENT_HEAD',
  'DEPARTMENT_ADMIN',
  'INSTRUCTOR',
  'DEPARTMENT_VOLUNTEER',
  'VOLUNTEER',
  'MEDIA_TEAM',
  'PRAYER_WARRIOR',
] as const;

type MemberLike = Pick<OrgMembership, 'role' | 'permissions' | 'userId' | 'status'> &
  Partial<Pick<OrgMembership, 'roleKey' | 'roleKeys' | 'ministryRoles' | 'ministryIds' | 'protectedRoles'>>;

/** All distinct role keys held by a member (primary `roleKey` + `roleKeys` + `ministryRoles`). */
export function memberRoleKeys(member: MemberLike | null | undefined): string[] {
  if (!member) return [];
  const keys = new Set<string>();
  if (member.roleKey) keys.add(member.roleKey);
  (member.roleKeys || []).forEach(k => { if (k) keys.add(k); });
  (member.ministryRoles || []).forEach(mr => { if (mr?.roleKey) keys.add(mr.roleKey); });
  return Array.from(keys);
}

/** Alias for `memberRoleKeys` used across member & communications surfaces. */
export const getMemberEffectiveRoleKeys = memberRoleKeys;

/** All distinct department/ministry IDs a member belongs to or leads. */
export function memberDepartmentIds(
  member: MemberLike | null | undefined,
  org?: Pick<Organization, 'ministries'> | null,
): string[] {
  if (!member) return [];
  const ids = new Set<string>(member.ministryIds || []);
  (member.ministryRoles || []).forEach(mr => { if (mr?.ministryId) ids.add(mr.ministryId); });
  (org?.ministries || []).forEach(m => {
    if (m.headUids?.includes(member.userId)) ids.add(m.id);
  });
  return Array.from(ids);
}

/** True when a user holds a credentialed educational/Academia `TEACHER` account (distinct from church/org `INSTRUCTOR`). */
export function isCredentialedAcademiaTeacher(user?: Pick<UserProfile, 'accountType'> | null): boolean {
  return user?.accountType === 'TEACHER';
}

/** True when an org member holds the non-credentialed `INSTRUCTOR` role (or leads/teaches a department class). */
export function isElevateInstructor(member: MemberLike | null | undefined, ministryId?: string): boolean {
  if (!member) return false;
  if (ministryId) {
    return (member.ministryRoles || []).some(
      r => r.ministryId === ministryId && (r.roleKey === 'INSTRUCTOR' || r.roleKey === 'DEPARTMENT_HEAD' || r.roleKey === 'DEPARTMENT_ADMIN'),
    ) || member.roleKey === 'INSTRUCTOR';
  }
  return memberRoleKeys(member).includes('INSTRUCTOR');
}

/** Effective permissions: explicit override → union of catalog role(s) (`roleKey`, `roleKeys`, `ministryRoles`) → OrgRole default. */
export function elevatePermissions(member: MemberLike | null | undefined): Set<OrgPermission> {
  if (!member) return new Set();
  // Finance powers come only from roles the server recorded in protectedRoles.
  const held = new Set<OrgPermission>();
  (member.protectedRoles || []).forEach(k => getElevateRole(k)?.permissions.forEach(p => held.add(p)));
  if (member.permissions && member.permissions.length) return new Set([...member.permissions.filter(p => !FINANCE_PERMISSIONS.includes(p)), ...held]);
  const out = new Set<OrgPermission>(ROLE_PERMISSIONS[member.role] || []);
  for (const key of memberRoleKeys(member)) {
    const def = getElevateRole(key);
    if (def) def.permissions.forEach(p => out.add(p));
  }
  FINANCE_PERMISSIONS.forEach(p => { if (!held.has(p)) out.delete(p); });
  held.forEach(p => out.add(p));
  return out;
}

/** The single gate for Elevate actions. Org owners always pass. Department heads & admins are scoped via `ministryId`. */
export function elevateCan(
  member: MemberLike | null | undefined,
  org: (Pick<Organization, 'creatorId' | 'admins' | 'ministries'> & Partial<Pick<Organization, 'itAdminUids' | 'seniorPastorUids'>>) | null | undefined,
  action: OrgPermission,
  opts?: { ministryId?: string },
): boolean {
  if (!org) return false;
  if (FINANCE_PERMISSIONS.includes(action)) {
    if (isFinanceLead(member?.userId, org)) return true;
    return member?.status === 'ACTIVE' && elevatePermissions(member).has(action);
  }
  if (isOrgOwner(member?.userId, org)) return true;
  if (!member || member.status !== 'ACTIVE') return false;
  const allKeys = memberRoleKeys(member);
  const isDeptScopedOnly =
    (allKeys.includes('DEPARTMENT_HEAD') || allKeys.includes('DEPARTMENT_ADMIN') || allKeys.includes('INSTRUCTOR')) &&
    !allKeys.includes('SENIOR_PASTOR') &&
    !allKeys.includes('PASTOR');
  if (elevatePermissions(member).has(action)) {
    // DEPARTMENT_HEAD / DEPARTMENT_ADMIN powers apply org-wide to general tools; when `opts.ministryId` is specified, check scope match.
    if (isDeptScopedOnly && opts?.ministryId) {
      const m = org.ministries?.find(x => x.id === opts.ministryId);
      return (
        !!m?.headUids?.includes(member.userId) ||
        !!member.ministryIds?.includes(opts.ministryId) ||
        !!member.ministryRoles?.some(r => r.ministryId === opts.ministryId)
      );
    }
    return true;
  }
  // Per-ministry roles
  if (opts?.ministryId) {
    const matchingRoles = (member.ministryRoles || []).filter(r => r.ministryId === opts.ministryId);
    for (const mr of matchingRoles) {
      const def = getElevateRole(mr.roleKey);
      if (def?.permissions.includes(action)) return true;
    }
  }
  return false;
}

/** Can `assigner` hand out `roleKey`? Owners/senior pastors always; others per any of their held roles' assignableBy. */
export function canAssignRole(
  assigner: MemberLike | null | undefined,
  org: (Pick<Organization, 'creatorId' | 'admins'> & Partial<Pick<Organization, 'itAdminUids'>>) | null | undefined,
  roleKey: string,
): boolean {
  if (!org) return false;
  if (isProtectedRole(roleKey)) {
    const uid = assigner?.userId;
    if (uid && (org.creatorId === uid || org.itAdminUids?.includes(uid))) return true;
    return (FINANCE_ROLE_KEYS as readonly string[]).includes(roleKey) && assigner?.status === 'ACTIVE' && !!assigner.protectedRoles?.includes('FINANCE_DIRECTOR');
  }
  if (isOrgOwner(assigner?.userId, org)) return true;
  if (!assigner || assigner.status !== 'ACTIVE') return false;
  if (!elevatePermissions(assigner).has('ASSIGN_ROLES')) return false;
  const def = getElevateRole(roleKey);
  if (!def) return false;
  const heldKeys = memberRoleKeys(assigner);
  if (heldKeys.includes('SENIOR_PASTOR')) return true;
  return heldKeys.some(k => !!def.assignableBy?.includes(k));
}
