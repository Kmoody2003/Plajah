// Department channels on Reello — the pure rules, shared by the server route and its tests.
//
// An organization's departments (org.ministries, kind MINISTRY or DEPARTMENT) each get their own Reello
// channel under the org's main channel. A department channel exists only once something has been
// posted to it: a public video, or a stream started for it. Who may post for a department follows the
// org access model: the org's owner, IT Admins, the org's own account and org Owner/Admin members
// may post for any department; everyone else only for the departments they belong to or lead.

export interface DeptRef { orgId: string; departmentId: string }

/** Index doc id for a department channel: one per org department. */
export const deptChannelId = (orgId: string, departmentId: string) => `${orgId}__${departmentId}`;

export const MAX_INDEX_VIDEOS = 500;
export const MAX_INDEX_LIVE = 50;

type Org = Record<string, any>;
type Membership = Record<string, any>;

export function orgDepartments(org: Org | null | undefined): { id: string; name: string; iconEmoji?: string; description?: string; kind?: string; parentId?: string }[] {
  return ((org?.ministries || []) as any[])
    .filter(m => m && typeof m.id === 'string' && m.id && typeof m.name === 'string')
    .map(m => ({ id: m.id, name: m.name, iconEmoji: m.iconEmoji, description: m.description, kind: m.kind, parentId: m.parentId }));
}

/** May post for every department in the org. */
export function postsForWholeOrg(uid: string, org: Org, membership: Membership | null | undefined): boolean {
  if (!uid) return false;
  if (org.creatorId === uid || org.accountUid === uid) return true;
  if ((org.itAdminUids || []).includes(uid)) return true;
  if (membership?.status === 'ACTIVE' && (membership.role === 'OWNER' || membership.role === 'ADMIN')) return true;
  return false;
}

/** The department ids this person may post videos and streams for. */
export function postableDepartmentIds(uid: string, org: Org, membership: Membership | null | undefined): string[] {
  const all = orgDepartments(org).map(d => d.id);
  if (postsForWholeOrg(uid, org, membership)) return all;
  const mine = new Set<string>();
  for (const d of (org.ministries || []) as any[]) if ((d?.headUids || []).includes(uid)) mine.add(d.id);
  if (membership?.status === 'ACTIVE') {
    for (const id of membership.ministryIds || []) mine.add(String(id));
    for (const r of membership.ministryRoles || []) if (r?.ministryId) mine.add(String(r.ministryId));
  }
  return all.filter(id => mine.has(id));
}

export function canPostToDepartment(uid: string, org: Org, membership: Membership | null | undefined, departmentId: string): boolean {
  return postableDepartmentIds(uid, org, membership).includes(departmentId);
}

const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isFinite(n) ? n : Number(v) || 0; }
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  return 0;
};

/** Is this video something the public may see on a channel page right now? */
export function isPublicVideo(v: Record<string, any> | null | undefined, now = Date.now()): boolean {
  if (!v) return false;
  if (v.isPrivate === true) return false;
  if (v.isScheduled && toMs(v.releaseDate) > now) return false;
  if (v.copyrightHold || v.isHeld) return false;
  return true;
}

/** Newest-first id list with `id` moved to the front, capped. */
export function pushFront(list: string[] | undefined, id: string, cap: number): string[] {
  return [id, ...(list || []).filter(x => x !== id)].slice(0, cap);
}

export { toMs as toMillis };
