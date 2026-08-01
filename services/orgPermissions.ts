// orgPermissions — the single RBAC gate for business/organization actions.
//
// An org member's powers come from their OrgRole (a default permission tier) plus any
// explicit per-membership override (OrgMembership.permissions). This mirrors how the rest
// of the app gates surfaces with hasCapability(profile, cap) — here it's orgCan(member, org, action).
//
// Least privilege by design: MANAGE_MONEY and MANAGE_ROLES are OWNER-only unless a member
// is explicitly granted them via an override. Never widen these defaults casually.

import type { Organization, OrgMembership, OrgPermission, OrgRole } from '../types';

export const ROLE_PERMISSIONS: Record<OrgRole, OrgPermission[]> = {
  OWNER: [
    'EDIT_PAGE', 'MANAGE_EMPLOYEES', 'MANAGE_ROLES', 'POST_AS_ORG',
    'MANAGE_MONEY', 'MANAGE_CONTENT', 'MANAGE_ORDERS', 'VIEW_ANALYTICS',
  ],
  ADMIN: [
    'EDIT_PAGE', 'MANAGE_EMPLOYEES', 'POST_AS_ORG',
    'MANAGE_CONTENT', 'MANAGE_ORDERS', 'VIEW_ANALYTICS',
  ],
  STAFF: ['POST_AS_ORG', 'MANAGE_CONTENT', 'MANAGE_ORDERS'],
  MODERATOR: ['MANAGE_CONTENT'],
  MEMBER: [],
};

/** The effective permission set for a membership: explicit override, else the role default. */
export function permissionsForMember(member: Pick<OrgMembership, 'role' | 'permissions'>): Set<OrgPermission> {
  if (member.permissions && member.permissions.length) return new Set(member.permissions);
  return new Set(ROLE_PERMISSIONS[member.role] || []);
}

/**
 * Can this member perform `action` on `org`?
 * The org creator / any listed admin is always treated as an owner (full powers), so an org is
 * never left un-manageable if a membership row is missing.
 */
export function orgCan(
  member: Pick<OrgMembership, 'role' | 'permissions' | 'userId' | 'status'> | null | undefined,
  org: Pick<Organization, 'creatorId' | 'admins'> | null | undefined,
  action: OrgPermission,
): boolean {
  if (!member || member.status !== 'ACTIVE') {
    // Fall back to org-level ownership even without an ACTIVE membership row.
    return isOrgOwner(member?.userId, org);
  }
  if (isOrgOwner(member.userId, org)) return true;
  return permissionsForMember(member).has(action);
}

/** True when uid is the org creator or an explicit admin. */
export function isOrgOwner(
  uid: string | undefined,
  org: Pick<Organization, 'creatorId' | 'admins'> | null | undefined,
): boolean {
  if (!uid || !org) return false;
  return org.creatorId === uid || (org.admins || []).includes(uid);
}
