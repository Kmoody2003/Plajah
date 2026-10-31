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
//   POST /asset { assetId, access, departments, roles, users }  the file's author, the owner or an IT Admin
//
// A restricted file's accessUids is resolved here from its departments, roles and people, and re-resolved whenever
// the roster changes, so rules and downloads check one list. Clients can't write any of these fields.
//
// Mounted in server.ts as:  app.use('/api/elevate/access', express.json({ limit: '8kb' }), elevateAccessRouter)

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { verifyIdTokenDetailed, fsGet, fsPatch, fsSet, fsQuery } from '../services/firebaseAdminRest';
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

/** Re-derive the access lists on the org doc from the memberships' protected roles. */
/** Someone whose seat in the org ended loses the org's shared documents too. Outside collaborators, who never held a seat, are left alone. */
async function revokeDepartedFromDocs(orgId: string, members: Record<string, any>[]) {
  const active = new Set(members.filter(m => m.status === 'ACTIVE').map(m => String(m.userId)));
  const departed = new Set(members.filter(m => m.status !== 'ACTIVE' && !active.has(String(m.userId))).map(m => String(m.userId)));
  if (!departed.size) return;
  for (const { id, data: p } of await fsQuery('coedit', [{ field: 'orgId', value: orgId }], MAX_MEMBERS)) {
    const leaving: string[] = (p.memberIds || []).filter((u: string) => departed.has(u) && u !== p.ownerId);
    if (!leaving.length) continue;
    const without = (map: Record<string, any> = {}) => Object.fromEntries(Object.entries(map).filter(([u]) => !leaving.includes(u)));
    const now = Date.now();
    await Promise.all(leaving.map(u => fsSet(`coedit/${id}/revocations/${u}`, { at: now, by: 'system', byName: 'Your organization', reason: 'Your seat in the organization ended.' })));
    await fsPatch(`coedit/${id}`, { memberIds: (p.memberIds || []).filter((u: string) => !leaving.includes(u)), members: without(p.members), names: without(p.names), photos: without(p.photos), expires: without(p.expires), updatedAt: now });
    if (p.chatRoomId) {
      const room = await fsGet(`chat_rooms/${p.chatRoomId}`);
      if (room) await fsPatch(`chat_rooms/${p.chatRoomId}`, { participants: (room.participants || []).filter((u: string) => !leaving.includes(u)), updatedAt: now });
    }
    await fsSet(`docAudit/${id}/events/${randomUUID()}`, { pid: id, action: 'access_revoked', by: 'system', byName: 'Plajah', at: now, detail: `${leaving.map(u => p.names?.[u] || 'Collaborator').join(', ')}: seat in the organization ended`, ownerId: p.ownerId, orgId });
  }
}

export async function rebuildOrgAccessIndex(orgId: string, org: Record<string, any>): Promise<void> {
  const rows = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }], MAX_MEMBERS);
  await revokeDepartedFromDocs(orgId, rows.map(r => r.data));
  const restricted = await fsQuery('orgAssets', [{ field: 'scopeId', value: orgId }, { field: 'access', value: 'restricted' }], MAX_MEMBERS);
  for (const a of restricted) {
    const accessUids = resolveAccessUids(a.data.accessSpec, rows.map(r => r.data), org);
    if (accessUids.join() !== (a.data.accessUids || []).join()) await fsPatch(`orgAssets/${a.id}`, { accessUids });
  }
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

elevateAccessRouter.get('/assets', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const scopeId = String(req.query.scopeId || '').trim();
  if (badId(scopeId)) return res.status(400).json({ error: 'Bad request.' });
  const [org, platformAdmin, rows] = await Promise.all([fsGet(`organizations/${scopeId}`), fsGet(`admins/${t.uid}`), fsQuery('orgAssets', [{ field: 'scopeId', value: scopeId }], MAX_MEMBERS)]);
  const inScope = !!platformAdmin || scopeId === t.uid || !!org && (org.creatorId === t.uid || [...(org.admins || []), ...(org.itAdminUids || []), ...(org.staffUids || [])].includes(t.uid));
  const assets = rows.map(r => r.data).filter(a => (a.access || 'open') === 'open' ? inScope || a.uploadedByUid === t.uid : !!platformAdmin || canOpenLockedAsset(t.uid, a, org));
  return res.json({ assets });
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
  if (!(await fsPatch(`orgAssets/${assetId}`, { access, accessSpec: spec, accessUids }))) return res.status(500).json({ error: 'Could not save.' });
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
