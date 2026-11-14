// templateSharePolicy — who may share an organization's documents as public templates. Pure (no browser
// or Firebase imports): the client uses it to explain a refusal up front, and the server share route
// (routes/templateShare.ts) uses it to make the real decision with roles it resolves itself.
import type { TelaDoc } from '../../types';

export type OrgShareRole = 'admin' | 'staff' | 'teacher' | 'volunteer' | 'member';
export const ORG_SHARE_ROLES: Array<{ id: OrgShareRole; label: string }> = [
  { id: 'admin', label: 'Admins' }, { id: 'staff', label: 'Staff & leaders' }, { id: 'teacher', label: 'Teachers' },
  { id: 'volunteer', label: 'Volunteers' }, { id: 'member', label: 'Members' },
];

export interface OrgTemplatePolicy {
  orgId: string;
  /** Off by default: nothing leaves the org until an admin allows it. */
  allowPlatformSharing: boolean;
  roles: Record<OrgShareRole, boolean>;
  updatedBy?: string;
  updatedAt?: number;
}
export const defaultPolicy = (orgId: string): OrgTemplatePolicy => ({ orgId, allowPlatformSharing: false, roles: { admin: true, staff: true, teacher: true, volunteer: false, member: false } });

export function sharingBlockedReason(p: OrgTemplatePolicy, role: OrgShareRole): string | null {
  return sharingBlockedForRoles(p, [role]);
}

/** Refusal text, or null when any role the person holds in the org is allowed to share. */
export function sharingBlockedForRoles(p: OrgTemplatePolicy, held: OrgShareRole[]): string | null {
  if (!p.allowPlatformSharing) return 'This organization doesn’t allow its documents to be shared as public templates. An admin can turn it on in Content HQ › Template sharing.';
  if (!held.some(r => p.roles[r])) {
    const top = held[0] || 'member';
    return `This organization doesn’t let ${ORG_SHARE_ROLES.find(r => r.id === top)?.label.toLowerCase() || 'your role'} share its documents as public templates.`;
  }
  return null;
}

// Membership role names (types.ts OrgRole + roleKeys) that count as each sharing role.
const TEACHER_ROLES = new Set(['INSTRUCTOR', 'TEACHER', 'DEPARTMENT_HEAD', 'DEPARTMENT_ADMIN', 'CATECHIST']);
const VOLUNTEER_ROLES = new Set(['VOLUNTEER', 'DEPARTMENT_VOLUNTEER']);

/** Every sharing role a person holds in one org, strongest first. */
export function resolveShareRoles(uid: string, o: {
  org?: { creatorId?: string; admins?: string[]; staffUids?: string[]; pastorUids?: string[]; leaderUids?: string[] } | null;
  memberships?: Array<{ role?: string; roleKey?: string; roleKeys?: string[]; status?: string }>;
  teachesAClass?: boolean;
}): OrgShareRole[] {
  const org = o.org || {};
  const seats = (o.memberships || []).filter(m => (m.status || 'ACTIVE') === 'ACTIVE');
  const names = new Set(seats.flatMap(m => [m.role, m.roleKey, ...(m.roleKeys || [])].filter(Boolean).map(s => String(s).toUpperCase())));
  const out: OrgShareRole[] = [];
  if (org.creatorId === uid || (org.admins || []).includes(uid)) out.push('admin');
  if ([org.staffUids, org.pastorUids, org.leaderUids].some(l => (l || []).includes(uid))) out.push('staff');
  if (o.teachesAClass || [...names].some(n => TEACHER_ROLES.has(n))) out.push('teacher');
  if ([...names].some(n => VOLUNTEER_ROLES.has(n))) out.push('volunteer');
  if (seats.length || out.length) out.push('member');
  return out;
}

/** Every string in the document, lower-cased, for fingerprinting. */
function textOf(d: TelaDoc): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') { if (v.length < 4000) parts.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(d);
  return parts.join('\n').toLowerCase();
}

/**
 * Orgs a document came from: its orgOrigin tag, plus any of the person's orgs whose name (4+ letters)
 * appears in it, so dropping the tag alone doesn't make an org document look personal.
 */
export function orgsInDocument(d: TelaDoc, orgs: Array<{ id: string; name?: string }>): string[] {
  const found = new Set<string>();
  if (d.orgOrigin?.orgId) found.add(d.orgOrigin.orgId);
  const text = textOf(d);
  for (const o of orgs) {
    const n = (o.name || '').trim().toLowerCase();
    if (n.length >= 4 && text.includes(n)) found.add(o.id);
  }
  return [...found];
}
