// elevateAccess router — IT Admin, Senior Pastor and finance roles, which decide who can reach an org's money.
//
// These roles live in orgMemberships.protectedRoles and the uid lists rules read (itAdminUids, seniorPastorUids,
// financeUids, givingViewUids, accountingUids, accountingViewUids) are derived from them here. Firestore rules
// refuse every client write to both, so an org admin or pastor who can edit the roster still cannot grant
// themselves finance. The org's creator is always an IT Admin. IT Admin is an org role, not a Plajah account.
//
//   POST /sync     { orgId }                                 rebuild the lists; anyone signed in, nothing sent can widen them
//   POST /set-role { orgId, membershipId, roleKey, on }      owner or IT Admin; a Finance Director for finance roles only
//   GET  /assets?scopeId=                                    the Content HQ files this caller may see
//   GET  /public-roster?orgId=                               public leadership of an org, safe fields only
//   GET  /shared-with-me                                     org files deliberately shared with this person
//   POST /asset { assetId, access, departments, roles, users }  the file's author, the owner or an IT Admin
//   GET  /org-share?assetId=                                 which orgs hold this file; owner or IT Admin
//   POST /org-share { assetId, targetOrgId, on }             grant or take back, read-only; owner or IT Admin
//   GET  /shared-with-org?orgId=                             files other orgs shared with this org
//
// A restricted file's accessUids is resolved here from its departments, roles and people, and re-resolved whenever
// the roster changes, so rules and downloads check one list. Clients can't write any of these fields.
//
// Mounted in server.ts as:  app.use('/api/elevate/access', express.json({ limit: '8kb' }), elevateAccessRouter)

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { verifyIdTokenDetailed, fsCreate, fsGet, fsPatch, fsSet, fsQuery } from '../services/firebaseAdminRest';
import { canReviewHqSecurity, canSeeBusinessFile, canSeeOrgFile, canUseOrgShare, hqRecordForClient, hqRecordForOrgShare, isOrgShareable, hqWriteUidsFor } from '../services/hqAccessPolicy';
import { getElevateRole } from '../services/elevateRoles';
import { settleDepartures } from '../services/coeditAdmin';
import { FINANCE_ROLE_KEYS, PROTECTED_ROLE_KEYS, getElevateRole } from '../services/elevateRoles';

export const elevateAccessRouter = Router();

export type AssetAccess = 'open' | 'restricted' | 'revoked';

const MAX_MEMBERS = 5000;

async function caller(req: Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(auth.slice(7));
  return t && !t.isAnonymous ? t : null;
}

const badId = (s: string) => !s || s.length > 128 || /[\/]/.test(s);

/** May this person open a restricted or revoked file? Open files keep their existing scope checks. */
export function canOpenLockedAsset(uid: string, asset: Record<string, any>, org: Record<string, any> | null): boolean {
  if (asset.uploadedByUid === uid || (asset.accessUids || []).includes(uid)) return true;
  return !!org && (org.creatorId === uid || (org.itAdminUids || []).includes(uid));
}

function resolveAccessUids(spec: Record<string, any> | undefined, members: Record<string, any>[], org: Record<string, any>): string[] {
  const departments: string[] = spec?.departments || [], roles: string[] = spec?.roles || [];
  const out = new Set<string>((spec?.users || []).map(String));
  for (const m of members) {
    if (m.status !== 'ACTIVE') continue;
    const held = [m.roleKey, ...(m.roleKeys || []), ...(m.ministryRoles || []).map((r: any) => r?.roleKey)];
    const depts = [...(m.ministryIds || []), ...(m.ministryRoles || []).map((r: any) => r?.ministryId),
      ...((org.ministries || []) as any[]).filter(d => (d.headUids || []).includes(m.userId)).map(d => d.id)];
    if (held.some(k => roles.includes(k)) || depts.some(d => departments.includes(d))) out.add(String(m.userId));
  }
  return Array.from(out);
}

/** Write hqWriteUids where it changed. Clients never see or set this field. */
async function stampDepartmentWriters(files: { id: string; data: Record<string, any> }[], org: Record<string, any>, members: Record<string, any>[]): Promise<void> {
  for (const f of files) {
    if (f.data.scopeKind !== 'org') continue;
    const next = hqWriteUidsFor(f.data, org, members);
    if (next === null && f.data.hqWriteUids === undefined) continue;
    if (next && (f.data.hqWriteUids || []).join() === next.join()) continue;
    await fsPatch(`orgAssets/${f.id}`, { hqWriteUids: next ?? undefined });
  }
}

/** Re-derive the access lists on the org doc from the memberships' protected roles. */
export async function rebuildOrgAccessIndex(orgId: string, org: Record<string, any>): Promise<void> {
  const rows = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }], MAX_MEMBERS);
  await settleDepartures(orgId, org, rows.map(r => r.data));
  const restricted = await fsQuery('orgAssets', [{ field: 'scopeId', value: orgId }, { field: 'access', value: 'restricted' }], MAX_MEMBERS);
  for (const a of restricted) {
    const accessUids = resolveAccessUids(a.data.accessSpec, rows.map(r => r.data), org);
    if (accessUids.join() !== (a.data.accessUids || []).join()) await fsPatch(`orgAssets/${a.id}`, { accessUids });
  }
  // Keep each department file's writer list in step with the roster.
  const files = await fsQuery('orgAssets', [{ field: 'scopeId', value: orgId }], MAX_MEMBERS);
  await stampDepartmentWriters(files, org, rows.map(r => r.data));
  const active = rows.map(r => r.data).filter(m => m.status === 'ACTIVE' && Array.isArray(m.protectedRoles) && m.protectedRoles.length);
  const ids = (pred: (key: string) => boolean) => Array.from(new Set(active.filter(m => m.protectedRoles.some(pred)).map(m => String(m.userId))));
  const grants = (p: string) => (key: string) => !!getElevateRole(key)?.permissions.includes(p as any);
  await fsPatch(`organizations/${orgId}`, {
    itAdminUids: Array.from(new Set([String(org.creatorId || ''), ...ids(k => k === 'IT_ADMIN')].filter(Boolean))),
    seniorPastorUids: ids(k => k === 'SENIOR_PASTOR'),
    financeUids: ids(k => k !== 'IT_ADMIN' && k !== 'SENIOR_PASTOR' && grants('MANAGE_GIVING')(k)),
    givingViewUids: ids(k => k !== 'IT_ADMIN' && k !== 'SENIOR_PASTOR' && grants('VIEW_GIVING')(k)),
    accountingUids: ids(k => k !== 'IT_ADMIN' && k !== 'SENIOR_PASTOR' && grants('MANAGE_ACCOUNTING')(k)),
    accountingViewUids: ids(k => k !== 'IT_ADMIN' && k !== 'SENIOR_PASTOR' && grants('VIEW_ACCOUNTING')(k)),
    updatedAt: Date.now(),
  });
}

elevateAccessRouter.post('/sync', async (req: Request, res: Response) => {
  if (!(await caller(req))) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.body?.orgId || '').trim();
  if (badId(orgId)) return res.status(400).json({ error: 'Bad request.' });
  const org = await fsGet(`organizations/${orgId}`);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });
  await rebuildOrgAccessIndex(orgId, org);
  return res.json({ ok: true });
});

// What an org shows the public: its public-role leaders and department heads, never the roster.
elevateAccessRouter.get('/public-roster', async (req: Request, res: Response) => {
  const orgId = String(req.query.orgId || '').trim();
  if (badId(orgId)) return res.status(400).json({ error: 'Bad request.' });
  const [org, rows] = await Promise.all([fsGet(`organizations/${orgId}`), fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }], 500)]);
  if (!org) return res.json({ members: [] });
  const heads = new Set<string>((org.ministries || []).flatMap((m: any) => m.headUids || []));
  const members = rows.map(r => ({ ...r.data, id: r.id })).filter(m => {
    if (m.status !== 'ACTIVE') return false;
    const def = getElevateRole(m.roleKey);
    return heads.has(m.userId) || (def ? !!def.isPublic : !!m.isSenior);
  }).map(m => ({
    id: m.id, orgId, userId: m.userId, status: m.status, role: m.role, roleKey: m.roleKey, title: m.title, rosterGroup: m.rosterGroup,
    displayName: m.displayName, photoUrl: m.photoUrl, orgPhotoUrl: m.orgPhotoUrl, aboutInOrg: m.aboutInOrg, isSenior: m.isSenior, ministryRoles: m.ministryRoles,
  }));
  return res.json({ members });
});

elevateAccessRouter.get('/assets', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const scopeId = String(req.query.scopeId || '').trim();
  if (badId(scopeId)) return res.status(400).json({ error: 'Bad request.' });
  const [org, page, seats, platformAdmin, rows] = await Promise.all([fsGet(`organizations/${scopeId}`), fsGet(`businessPages/${scopeId}`), fsGet(`businessPages/${scopeId}/private/staff`), fsGet(`admins/${t.uid}`), fsQuery('orgAssets', [{ field: 'scopeId', value: scopeId }], MAX_MEMBERS)]);
  const inBusiness = !!page && (page.ownerId === t.uid || (seats?.staffUids || page.staffUids || []).includes(t.uid));
  const inScope = !!platformAdmin || scopeId === t.uid || inBusiness || !!org && (org.creatorId === t.uid || [...(org.admins || []), ...(org.itAdminUids || []), ...(org.staffUids || [])].includes(t.uid));
  const membership = org ? (await fsQuery('orgMemberships', [{ field: 'orgId', value: scopeId }, { field: 'userId', value: t.uid }], 5)).map(r => r.data).find(m => m.status === 'ACTIVE') || null : null;
  // A file uploaded since the last roster sync gets its marker here, the first time anyone lists the folder.
  if (org && rows.some(r => r.data.scopeKind === 'org' && r.data.hqWriteUids === undefined && hqWriteUidsFor(r.data, org, []) !== null)) {
    const fresh = rows.filter(r => r.data.hqWriteUids === undefined);
    void fsQuery('orgMemberships', [{ field: 'orgId', value: scopeId }], MAX_MEMBERS).then(m => stampDepartmentWriters(fresh, org, m.map(x => x.data))).catch(() => {});
  }
  const assets = rows.map(r => r.data).filter(a => {
    if (platformAdmin) return true;
    if (a.scopeKind === 'user') return a.scopeId === t.uid;
    if (a.scopeKind === 'business') return canSeeBusinessFile(t.uid, a, page);
    if (!canSeeOrgFile(t.uid, a, org, membership)) return false;
    return inScope || a.uploadedByUid === t.uid || (a.access || 'open') !== 'open';
  });
  return res.json({ assets: assets.map(hqRecordForClient), inScope });
});

// Files an org deliberately shared with this person. This is the only way an org's file reaches a personal account.
elevateAccessRouter.get('/shared-with-me', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const rows = await fsQuery('orgAssets', [{ field: 'accessUids', op: 'ARRAY_CONTAINS', value: t.uid }], 200);
  const assets = rows.map(r => r.data).filter(a => a.access === 'restricted' && !a.deletedAt && a.uploadedByUid !== t.uid);
  return res.json({ assets: assets.map(({ storagePath: _path, ...a }) => hqRecordForClient(a)) });
});

// Files another org deliberately shared with this org. It's a separate list: /shared-with-me never includes them.
elevateAccessRouter.get('/shared-with-org', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.query.orgId || '').trim();
  if (badId(orgId)) return res.status(400).json({ error: 'Bad request.' });
  if (!canUseOrgShare(t.uid, await fsGet(`organizations/${orgId}`))) return res.status(403).json({ error: 'Forbidden' });
  const rows = await fsQuery('orgAssets', [{ field: 'sharedOrgIds', op: 'ARRAY_CONTAINS', value: orgId }], 500);
  return res.json({ assets: rows.map(r => ({ ...r.data, id: r.id })).filter(isOrgShareable).map(hqRecordForOrgShare) });
});

async function orgShareTarget(req: Request, res: Response, assetId: string) {
  const t = await caller(req);
  if (!t) { res.status(401).json({ error: 'Sign in first.' }); return null; }
  if (badId(assetId)) { res.status(400).json({ error: 'Bad request.' }); return null; }
  const asset = await fsGet(`orgAssets/${assetId}`);
  if (!asset || asset.scopeKind !== 'org') { res.status(404).json({ error: 'File not found.' }); return null; }
  if (!canReviewHqSecurity(t.uid, 'org', await fsGet(`organizations/${asset.scopeId}`))) { res.status(403).json({ error: 'Only the owner or an IT Admin can share a file with another organization.' }); return null; }
  return { uid: t.uid, asset };
}

elevateAccessRouter.get('/org-share', async (req: Request, res: Response) => {
  const ok = await orgShareTarget(req, res, String(req.query.assetId || ''));
  if (!ok) return;
  const orgs = await Promise.all(((ok.asset.sharedOrgIds || []) as string[]).map(async id => ({ id, name: String((await fsGet(`organizations/${id}`))?.name || 'Organization') })));
  return res.json({ orgs });
});

elevateAccessRouter.post('/org-share', async (req: Request, res: Response) => {
  const assetId = String(req.body?.assetId || '').trim();
  const targetOrgId = String(req.body?.targetOrgId || '').trim();
  const on = req.body?.on !== false;
  const ok = await orgShareTarget(req, res, assetId);
  if (!ok) return;
  const { asset, uid } = ok;
  if (badId(targetOrgId) || targetOrgId === asset.scopeId) return res.status(400).json({ error: 'Choose another organization.' });
  if (on && !isOrgShareable(asset)) return res.status(400).json({ error: 'Only an open file that is not in Trash can be shared with another organization.' });
  const target = await fsGet(`organizations/${targetOrgId}`);
  if (on && !target) return res.status(404).json({ error: 'Organization not found.' });
  const current: string[] = asset.sharedOrgIds || [];
  const sharedOrgIds = on ? Array.from(new Set([...current, targetOrgId])) : current.filter(id => id !== targetOrgId);
  if (!(await fsPatch(`orgAssets/${assetId}`, { sharedOrgIds }))) return res.status(500).json({ error: 'Could not save.' });
  const now = Date.now();
  const entry = { assetId, name: String(asset.name || ''), actorUid: uid, targetName: String(target?.name || ''), createdAt: now };
  const kind = on ? 'ORG_SHARED' : 'ORG_SHARE_REVOKED';
  await fsCreate('hqAuditLog', { ...entry, kind, scopeKind: 'org', scopeId: String(asset.scopeId), targetOrgId });
  await fsCreate('hqAuditLog', { ...entry, kind: on ? 'ORG_SHARE_RECEIVED' : 'ORG_SHARE_ENDED', scopeKind: 'org', scopeId: targetOrgId, sourceOrgId: String(asset.scopeId) });
  const entryId = randomUUID();
  await fsSet(`hqActivity/${entryId}`, { id: entryId, assetId, scopeKind: 'org', scopeId: String(asset.scopeId), actorUid: uid, actorName: '', action: on ? 'SHARED_WITH_ORG' : 'ORG_SHARE_ENDED', detail: String(target?.name || targetOrgId), createdAt: now });
  return res.json({ ok: true, sharedOrgIds });
});

elevateAccessRouter.post('/asset', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const assetId = String(req.body?.assetId || '').trim();
  const access = String(req.body?.access || '') as AssetAccess;
  if (badId(assetId) || !['open', 'restricted', 'revoked'].includes(access)) return res.status(400).json({ error: 'Bad request.' });
  const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(String).filter(s => !badId(s)).slice(0, 500);
  const spec = { departments: ids(req.body?.departments), roles: ids(req.body?.roles), users: ids(req.body?.users) };
  if (access === 'restricted' && !spec.departments.length && !spec.roles.length && !spec.users.length) return res.status(400).json({ error: 'Choose at least one department, role or person.' });

  const asset = await fsGet(`orgAssets/${assetId}`);
  if (!asset) return res.status(404).json({ error: 'File not found.' });
  if (asset.scopeKind !== 'org') return res.status(400).json({ error: 'Only organization files can be restricted.' });
  const org = await fsGet(`organizations/${asset.scopeId}`);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });
  if (asset.uploadedByUid !== t.uid && org.creatorId !== t.uid && !(org.itAdminUids || []).includes(t.uid)) return res.status(403).json({ error: 'Only the author or an IT Admin can change who uses this file.' });

  const members = access === 'restricted' ? (await fsQuery('orgMemberships', [{ field: 'orgId', value: asset.scopeId }], MAX_MEMBERS)).map(r => r.data) : [];
  const accessUids = access === 'restricted' ? resolveAccessUids(spec, members, org) : [];
  // A file limited to certain people stops going to other orgs too. Opening it again doesn't bring those shares back.
  const endShares = access !== 'open' && (asset.sharedOrgIds || []).length > 0;
  if (!(await fsPatch(`orgAssets/${assetId}`, { access, accessSpec: spec, accessUids, ...(endShares ? { sharedOrgIds: [] } : {}) }))) return res.status(500).json({ error: 'Could not save.' });
  if (endShares) await fsCreate('hqAuditLog', { kind: 'ORG_SHARE_REVOKED', assetId, name: String(asset.name || ''), scopeKind: 'org', scopeId: String(asset.scopeId), actorUid: t.uid, targetName: 'every organization', createdAt: Date.now() });
  // Links shared outside the org stop working for good; restoring access never brings an old link back.
  if (access !== 'open') {
    const links = await fsQuery('hqShareLinks', [{ field: 'assetId', value: assetId }], 200);
    await Promise.all(links.filter(l => !l.data.revokedAt).map(l => fsPatch(`hqShareLinks/${l.id}`, { revokedAt: Date.now() })));
  }
  const entryId = randomUUID();
  await fsSet(`hqActivity/${entryId}`, { id: entryId, assetId, scopeKind: asset.scopeKind, scopeId: asset.scopeId, actorUid: t.uid, actorName: '', action: access === 'revoked' ? 'ACCESS_REVOKED' : 'ACCESS_CHANGED', detail: access, createdAt: Date.now() });
  return res.json({ ok: true, access, accessUids });
});

elevateAccessRouter.post('/set-role', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.body?.orgId || '').trim();
  const membershipId = String(req.body?.membershipId || '').trim();
  const roleKey = String(req.body?.roleKey || '').trim();
  const on = req.body?.on !== false;
  if (badId(orgId) || badId(membershipId) || !(PROTECTED_ROLE_KEYS as readonly string[]).includes(roleKey)) return res.status(400).json({ error: 'Bad request.' });

  const org = await fsGet(`organizations/${orgId}`);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });
  const target = await fsGet(`orgMemberships/${membershipId}`);
  if (!target || target.orgId !== orgId) return res.status(404).json({ error: 'That person is not on this roster.' });

  const isIt = org.creatorId === t.uid || (Array.isArray(org.itAdminUids) && org.itAdminUids.includes(t.uid));
  let allowed = isIt;
  if (!allowed && (FINANCE_ROLE_KEYS as readonly string[]).includes(roleKey)) {
    const mine = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }, { field: 'userId', value: t.uid }], 5);
    allowed = mine.some(m => m.data.status === 'ACTIVE' && (m.data.protectedRoles || []).includes('FINANCE_DIRECTOR'));
  }
  if (!allowed) return res.status(403).json({ error: 'Only an IT Admin can change this role. A Finance Director can change finance roles.' });

  const protectedRoles = new Set<string>(target.protectedRoles || []);
  const roleKeys = new Set<string>([...(target.roleKeys || []), ...(target.roleKey ? [target.roleKey] : [])]);
  if (on) { protectedRoles.add(roleKey); roleKeys.add(roleKey); } else { protectedRoles.delete(roleKey); roleKeys.delete(roleKey); }
  const def = getElevateRole(roleKey);
  const lowRank = !target.roleKey || ['MEMBER', 'VOLUNTEER', 'DEPARTMENT_VOLUNTEER'].includes(target.roleKey);
  const patch: Record<string, unknown> = { protectedRoles: Array.from(protectedRoles), roleKeys: Array.from(roleKeys) };
  if (on && lowRank && def) Object.assign(patch, { roleKey, role: def.baseRole, rosterGroup: def.rosterGroup, title: def.label });
  if (!on && target.roleKey === roleKey) Object.assign(patch, { roleKey: Array.from(roleKeys)[0] || 'MEMBER' });
  if (!(await fsPatch(`orgMemberships/${membershipId}`, patch))) return res.status(500).json({ error: 'Could not save that role.' });

  await rebuildOrgAccessIndex(orgId, org);
  const entryId = randomUUID();
  await fsSet(`organizations/${orgId}/audit/${entryId}`, {
    id: entryId, orgId, actorUid: t.uid, action: 'ROLE_CHANGED', targetId: membershipId, targetName: target.displayName || '',
    meta: { roleKey, on, protected: true }, timestamp: Date.now(),
  });
  return res.json({ ok: true, protectedRoles: patch.protectedRoles });
});
