// elevateRoles — the role catalog + access gate for Plajah Elevate (churches, faith, cultural, nonprofit).
//
// Builds on orgPermissions.ts: a membership's powers = its explicit `permissions` override, else the
// union of the permissions of its `roleKey` (and any `ministryRoles`) in this catalog, else the OrgRole
// default. Least privilege: money is finance + pastors only; prayer requests are pastors + ministers +
// Prayer Warriors only; a pastor can hand a member the TRUSTEE role (an elevated volunteer).

import type { Organization, OrgMembership, OrgPermission, OrgRole, RosterGroup } from '../types';
import { ROLE_PERMISSIONS, isOrgOwner } from './orgPermissions';

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
}

const POST = ['POST_AS_ORG'] as OrgPermission[];

export const ELEVATE_ROLES: ElevateRoleDef[] = [
  { key: 'SENIOR_PASTOR', label: 'Senior Pastor', description: 'Lead of the institution. Full control.', baseRole: 'ADMIN', rosterGroup: 'PASTORAL', isPublic: true, isPastoral: true,
    permissions: ['MANAGE_ACCOUNTING','VIEW_ACCOUNTING','SUBMIT_EXPENSES','APPROVE_EXPENSES','EDIT_PAGE','MANAGE_EMPLOYEES','MANAGE_ROLES','POST_AS_ORG','MANAGE_MONEY','MANAGE_CONTENT','MANAGE_ORDERS','VIEW_ANALYTICS','MANAGE_GIVING','VIEW_GIVING','VIEW_PRAYER','MANAGE_PRAYER','MANAGE_SERMONS','MANAGE_MEDIA','MANAGE_MINISTRIES','MANAGE_ROSTER','ASSIGN_ROLES','MANAGE_STORE','MODERATE_THREADS','MANAGE_INVITES'] },
  { key: 'PASTOR', label: 'Pastor', description: 'Pastoral leader. Sees prayer, manages giving, can grant Trustee.', baseRole: 'ADMIN', rosterGroup: 'PASTORAL', isPublic: true, isPastoral: true, assignableBy: ['SENIOR_PASTOR'],
    permissions: ['VIEW_ACCOUNTING','SUBMIT_EXPENSES','APPROVE_EXPENSES','EDIT_PAGE','POST_AS_ORG','MANAGE_CONTENT','VIEW_ANALYTICS','MANAGE_GIVING','VIEW_GIVING','VIEW_PRAYER','MANAGE_PRAYER','MANAGE_SERMONS','MANAGE_MINISTRIES','MANAGE_ROSTER','ASSIGN_ROLES','MODERATE_THREADS','MANAGE_INVITES','MANAGE_EMPLOYEES'] },
  { key: 'MINISTER', label: 'Minister', description: 'Ordained/licensed minister. Pastoral care + prayer.', baseRole: 'STAFF', rosterGroup: 'PASTORAL', isPublic: true, isPastoral: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: [...POST, 'MANAGE_CONTENT', 'VIEW_PRAYER', 'MANAGE_PRAYER', 'MANAGE_SERMONS', 'MODERATE_THREADS'] },
  { key: 'ELDER', label: 'Elder', description: 'Spiritual oversight; leadership roster.', baseRole: 'STAFF', rosterGroup: 'LEADERSHIP', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: [...POST, 'VIEW_ANALYTICS', 'MODERATE_THREADS'] },
  { key: 'DEACON', label: 'Deacon', description: 'Service leader; leadership roster.', baseRole: 'STAFF', rosterGroup: 'LEADERSHIP', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: [...POST, 'MODERATE_THREADS'] },
  { key: 'DEPARTMENT_HEAD', label: 'Department Head', description: 'Near-pastor operational control over their own department.', baseRole: 'ADMIN', rosterGroup: 'LEADERSHIP', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: ['SUBMIT_EXPENSES','APPROVE_EXPENSES','EDIT_PAGE','POST_AS_ORG','MANAGE_CONTENT','MANAGE_ORDERS','VIEW_ANALYTICS','MANAGE_MINISTRIES','MANAGE_ROSTER','MODERATE_THREADS','MANAGE_INVITES','MANAGE_MEDIA'] },
  { key: 'FINANCE_DIRECTOR', label: 'Finance Director', description: 'Sets up and manages everything related to giving.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: ['MANAGE_ACCOUNTING','VIEW_ACCOUNTING','SUBMIT_EXPENSES','APPROVE_EXPENSES', ...POST, 'MANAGE_MONEY', 'MANAGE_GIVING', 'VIEW_GIVING', 'VIEW_ANALYTICS', 'MANAGE_ORDERS'] },
  { key: 'TREASURER', label: 'Treasurer', description: 'Finance team member with giving access.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: false, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: ['MANAGE_ACCOUNTING','VIEW_ACCOUNTING','SUBMIT_EXPENSES','APPROVE_EXPENSES', 'MANAGE_GIVING', 'VIEW_GIVING', 'VIEW_ANALYTICS'] },
  { key: 'TRUSTEE', label: 'Trustee', description: 'Elevated volunteer role granted by a pastor. Giving oversight.', baseRole: 'MODERATOR', rosterGroup: 'LEADERSHIP', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: ['VIEW_ACCOUNTING', 'VIEW_GIVING', 'VIEW_ANALYTICS', 'MANAGE_CONTENT'] },
  { key: 'BOOKKEEPER', label: 'Bookkeeper', description: 'Day-to-day books: journals, bills, bank reconciliation. Cannot change roles or giving setup.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: false, assignableBy: ['SENIOR_PASTOR', 'PASTOR'],
    permissions: ['MANAGE_ACCOUNTING', 'VIEW_ACCOUNTING', 'VIEW_GIVING', 'SUBMIT_EXPENSES', 'VIEW_ANALYTICS'] },
  { key: 'ACCOUNTANT', label: 'Accountant / Auditor', description: 'External CPA or auditor — read-only access to the books and giving records.', baseRole: 'MEMBER', rosterGroup: 'VOLUNTEER', isPublic: false, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'FINANCE_DIRECTOR'],
    permissions: ['VIEW_ACCOUNTING', 'VIEW_GIVING', 'VIEW_ANALYTICS'] },
  { key: 'MEDIA_TEAM', label: 'Media Team', description: 'Sermon Studio, transcription → articles/books, livestream, Content HQ.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: false, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD'],
    permissions: ['SUBMIT_EXPENSES', ...POST, 'MANAGE_CONTENT', 'MANAGE_SERMONS', 'MANAGE_MEDIA', 'MANAGE_STORE'] },
  { key: 'STAFF', label: 'Staff', description: 'Paid or part-time staff member.', baseRole: 'STAFF', rosterGroup: 'STAFF', isPublic: true, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD'],
    permissions: ['SUBMIT_EXPENSES', ...POST, 'MANAGE_CONTENT'] },
  { key: 'PRAYER_WARRIOR', label: 'Prayer Warrior', description: 'Official volunteer/member on a ministry or intercessory prayer team. Can read the prayer queue.', baseRole: 'MEMBER', rosterGroup: 'VOLUNTEER', isPublic: false, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'MINISTER', 'DEPARTMENT_HEAD'],
    permissions: ['VIEW_PRAYER'] },
  { key: 'VOLUNTEER', label: 'Volunteer', description: 'Serves in a ministry or department.', baseRole: 'MEMBER', rosterGroup: 'VOLUNTEER', isPublic: false, assignableBy: ['SENIOR_PASTOR', 'PASTOR', 'DEPARTMENT_HEAD'],
    permissions: [] },
  { key: 'MEMBER', label: 'Member', description: 'Congregation member.', baseRole: 'MEMBER', rosterGroup: 'MEMBER', isPublic: false, permissions: [] },
];

export const ELEVATE_ROLE_MAP: Record<string, ElevateRoleDef> = Object.fromEntries(ELEVATE_ROLES.map(r => [r.key, r]));
export const getElevateRole = (key?: string): ElevateRoleDef | undefined => (key ? ELEVATE_ROLE_MAP[key] : undefined);

type MemberLike = Pick<OrgMembership, 'role' | 'permissions' | 'userId' | 'status'> & Partial<Pick<OrgMembership, 'roleKey' | 'ministryRoles'>>;

/** Effective permissions: explicit override → catalog role(s) → OrgRole default. */
export function elevatePermissions(member: MemberLike | null | undefined): Set<OrgPermission> {
  if (!member) return new Set();
  if (member.permissions && member.permissions.length) return new Set(member.permissions);
  const out = new Set<OrgPermission>(ROLE_PERMISSIONS[member.role] || []);
  const base = getElevateRole(member.roleKey);
  if (base) base.permissions.forEach(p => out.add(p));
  return out;
}

/** The single gate for Elevate actions. Org owners always pass. Department heads are scoped via `ministryId`. */
export function elevateCan(
  member: MemberLike | null | undefined,
  org: Pick<Organization, 'creatorId' | 'admins' | 'ministries'> | null | undefined,
  action: OrgPermission,
  opts?: { ministryId?: string },
): boolean {
  if (!org) return false;
  if (isOrgOwner(member?.userId, org)) return true;
  if (!member || member.status !== 'ACTIVE') return false;
  if (elevatePermissions(member).has(action)) {
    // DEPARTMENT_HEAD powers apply org-wide only to department-scoped actions; elsewhere require scope match.
    if (member.roleKey === 'DEPARTMENT_HEAD' && opts?.ministryId) {
      const m = org.ministries?.find(x => x.id === opts.ministryId);
      return !!m?.headUids?.includes(member.userId) || !!member.ministryRoles?.some(r => r.ministryId === opts.ministryId);
    }
    return true;
  }
  // Per-ministry roles
  if (opts?.ministryId) {
    const mr = member.ministryRoles?.find(r => r.ministryId === opts.ministryId);
    const def = getElevateRole(mr?.roleKey);
    if (def?.permissions.includes(action)) return true;
  }
  return false;
}

/** Can `assigner` hand out `roleKey`? Owners/senior pastors always; others per the role's assignableBy. */
export function canAssignRole(assigner: MemberLike | null | undefined, org: Pick<Organization, 'creatorId' | 'admins'> | null | undefined, roleKey: string): boolean {
  if (!org) return false;
  if (isOrgOwner(assigner?.userId, org)) return true;
  if (!assigner || assigner.status !== 'ACTIVE') return false;
  if (!elevatePermissions(assigner).has('ASSIGN_ROLES')) return false;
  const def = getElevateRole(roleKey);
  if (!def) return false;
  if (assigner.roleKey === 'SENIOR_PASTOR') return true;
  return !!assigner.roleKey && !!def.assignableBy?.includes(assigner.roleKey);
}
