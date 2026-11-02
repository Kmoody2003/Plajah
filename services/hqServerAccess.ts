// Server-side lookups for Content HQ access: loads the owner's records and asks services/hqAccessPolicy.
import { fsGet, fsQuery } from './firebaseAdminRest';
import { mergeSeats } from './businessStaffServerCore';
import { canReviewHqSecurity, canSeeHqFile, canUseOrgShare, canWriteHqFile, isOrgShareable } from './hqAccessPolicy';

export type Row = Record<string, any>;

export const scopeOwnerPath = (kind: string, id: string) => (kind === 'org' ? `organizations/${id}` : kind === 'business' ? `businessPages/${id}` : null);

export async function loadScopeOwner(kind: string, id: string): Promise<Row | null> {
  const path = scopeOwnerPath(kind, id);
  if (!path) return null;
  if (kind !== 'business') return fsGet(path);
  const [page, seats] = await Promise.all([fsGet(path), fsGet(`${path}/private/staff`)]);
  return page && mergeSeats(page, seats);
}

export async function activeMembership(orgId: string, uid: string): Promise<Row | null> {
  const rows = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }, { field: 'userId', value: uid }], 5);
  return rows.map(r => r.data).find(m => m.status === 'ACTIVE') || null;
}

/** The one server check for opening a file: its list row, its bytes, its text and its thread. */
export async function canOpenHqFile(uid: string, asset: Row | null): Promise<boolean> {
  return !!(await hqFileAccess(uid, asset));
}

/** How this person reaches the file: as someone in its own scope, or only through a share to their org. */
export async function hqFileAccess(uid: string, asset: Row | null): Promise<'own' | 'org_share' | null> {
  if (!asset || !uid) return null;
  if (asset.scopeKind === 'user') return asset.scopeId === uid ? 'own' : null;
  const owner = await loadScopeOwner(String(asset.scopeKind), String(asset.scopeId));
  const membership = asset.scopeKind === 'org' ? await activeMembership(String(asset.scopeId), uid) : null;
  if (canSeeHqFile(uid, asset, owner, membership)) return 'own';
  if (!isOrgShareable(asset)) return null;
  for (const orgId of ((asset.sharedOrgIds || []) as string[]).slice(0, 50)) {
    if (canUseOrgShare(uid, await loadScopeOwner('org', orgId))) return 'org_share';
  }
  return null;
}

export async function canWriteHqFileServer(uid: string, asset: Row | null): Promise<boolean> {
  if (!asset || !uid) return false;
  if (asset.scopeKind === 'user') return asset.scopeId === uid;
  return canWriteHqFile(uid, asset, await loadScopeOwner(String(asset.scopeKind), String(asset.scopeId)));
}

export async function mayReviewSecurity(uid: string, kind: string, id: string): Promise<boolean> {
  if (kind === 'user') return id === uid;
  return canReviewHqSecurity(uid, kind, await loadScopeOwner(kind, id));
}
