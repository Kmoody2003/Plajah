// elevateGroups router — asking to join a ministry / department / sub-group inside an org, and its leaders'
// answer. Department membership lives on the member's orgMemberships row (ministryIds), which only org
// admins may write, so requests and decisions run here with the service account. Requests are server-only
// data (groupJoinRequests has no match in firestore.rules → clients are denied by default).
//
//   POST /request  { orgId, ministryId }            ask to join (you must already be an active member of the org)
//   POST /cancel   { orgId, ministryId }            withdraw your request
//   GET  /mine?orgId=                               your pending requests in this org
//   GET  /pending?orgId=&ministryId=                leaders: requests waiting for this group
//   POST /decide   { orgId, ministryId, uid, approve }  leaders: approve (adds the group to their membership) or decline
//   POST /leave    { orgId, ministryId }            leave a group you're in (people holding a role there ask a leader)
//
// Public groups (allowFollowers) show Follow instead of Join on the page; this route still accepts a request.
// Mounted in server.ts as:  app.use('/api/elevate/groups', apiLimiter, express.json({ limit: '4kb' }), elevateGroupsRouter)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, fsQuery, fsPatch, fsSet, fsDelete, fsCreate } from '../services/firebaseAdminRest';
import { rebuildOrgAccessIndex } from './elevateAccess';

export const elevateGroupsRouter = Router();

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const reqId = (orgId: string, ministryId: string, uid: string) => `${orgId}__${ministryId}__${uid}`;

async function caller(req: Request) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(h.slice(7));
  return t && !t.isAnonymous ? t : null;
}

async function membershipOf(orgId: string, uid: string): Promise<{ id: string; data: Record<string, any> } | null> {
  const rows = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }, { field: 'userId', value: uid }], 5);
  return rows.find(r => r.data.status === 'ACTIVE') || null;
}

/** Org owner/admins, senior pastor/pastor, this group's heads, or someone holding a lead role in it. */
export function isGroupLeader(org: Record<string, any>, ministry: Record<string, any>, uid: string, m: Record<string, any> | null): boolean {
  if (org.creatorId === uid || org.accountUid === uid || (org.admins || []).includes(uid)) return true;
  if ((ministry.headUids || []).includes(uid)) return true;
  if (!m) return false;
  if (['OWNER', 'ADMIN'].includes(m.role) || ['SENIOR_PASTOR', 'PASTOR'].includes(m.roleKey)) return true;
  return (m.ministryRoles || []).some((r: any) => r.ministryId === ministry.id && /HEAD|ADMIN|DIRECTOR|LEAD/i.test(r.roleKey || ''));
}

async function load(orgId: string, ministryId: string) {
  if (!ID.test(orgId) || !ID.test(ministryId)) return null;
  const org = await fsGet(`organizations/${orgId}`);
  const ministry = org && (org.ministries || []).find((x: any) => x.id === ministryId);
  return org && ministry ? { org, ministry } : null;
}

const notify = (userId: string, title: string, message: string, targetId: string) =>
  fsCreate('notifications', { userId, senderId: 'plajah-elevate', senderName: 'Elevate', senderPhoto: '', type: 'SYSTEM', title, message, targetId, link: `ORG:${targetId}`, isRead: false, timestamp: Date.now() }).catch(() => null);

elevateGroupsRouter.post('/request', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  const { orgId, ministryId } = req.body || {};
  const g = await load(String(orgId || ''), String(ministryId || ''));
  if (!g) return res.status(404).json({ error: 'No such group.' });
  if (g.org.isDemo) return res.status(400).json({ error: 'This is a demo church. Create your own to try it.' });
  if (g.ministry.isInternal) return res.status(400).json({ error: 'This team adds people directly. Ask a leader.' });
  const m = await membershipOf(g.org.id || orgId, who.uid);
  if (!m) return res.status(403).json({ error: `Join ${g.org.name || 'the organization'} first.`, needsOrg: true });
  if ((m.data.ministryIds || []).includes(ministryId)) return res.json({ status: 'member' });
  const id = reqId(orgId, ministryId, who.uid);
  const existing = await fsGet(`groupJoinRequests/${id}`);
  if (existing?.status === 'PENDING') return res.json({ status: 'pending' });
  await fsSet(`groupJoinRequests/${id}`, {
    orgId, ministryId, uid: who.uid, status: 'PENDING', at: Date.now(),
    displayName: m.data.displayName || '', photoUrl: m.data.photoUrl || '',
  });
  const name = m.data.displayName || 'A member';
  for (const head of (g.ministry.headUids || []).slice(0, 10)) {
    await notify(head, `${name} asked to join ${g.ministry.name}`, 'Open the group page to approve or decline.', orgId);
  }
  res.json({ status: 'pending' });
});

elevateGroupsRouter.post('/cancel', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  const { orgId, ministryId } = req.body || {};
  if (!ID.test(String(orgId || '')) || !ID.test(String(ministryId || ''))) return res.status(400).json({ error: 'Bad request.' });
  await fsDelete(`groupJoinRequests/${reqId(orgId, ministryId, who.uid)}`);
  res.json({ status: 'none' });
});

elevateGroupsRouter.get('/mine', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.query.orgId || '');
  if (!ID.test(orgId)) return res.status(400).json({ error: 'Bad request.' });
  const rows = await fsQuery('groupJoinRequests', [{ field: 'uid', value: who.uid }, { field: 'orgId', value: orgId }], 100);
  res.json({ pending: rows.filter(r => r.data.status === 'PENDING').map(r => r.data.ministryId) });
});

elevateGroupsRouter.get('/pending', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.query.orgId || ''), ministryId = String(req.query.ministryId || '');
  const g = await load(orgId, ministryId);
  if (!g) return res.status(404).json({ error: 'No such group.' });
  if (!isGroupLeader(g.org, g.ministry, who.uid, (await membershipOf(orgId, who.uid))?.data || null)) return res.status(403).json({ error: 'Only this group’s leaders can see requests.' });
  const rows = await fsQuery('groupJoinRequests', [{ field: 'orgId', value: orgId }, { field: 'ministryId', value: ministryId }], 200);
  res.json({ requests: rows.filter(r => r.data.status === 'PENDING').map(r => ({ uid: r.data.uid, displayName: r.data.displayName, photoUrl: r.data.photoUrl, at: r.data.at })).sort((a, b) => a.at - b.at) });
});

elevateGroupsRouter.post('/decide', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  const { orgId, ministryId, uid, approve } = req.body || {};
  if (!ID.test(String(uid || ''))) return res.status(400).json({ error: 'Bad request.' });
  const g = await load(String(orgId || ''), String(ministryId || ''));
  if (!g) return res.status(404).json({ error: 'No such group.' });
  if (!isGroupLeader(g.org, g.ministry, who.uid, (await membershipOf(orgId, who.uid))?.data || null)) return res.status(403).json({ error: 'Only this group’s leaders can decide.' });
  const id = reqId(orgId, ministryId, uid);
  const request = await fsGet(`groupJoinRequests/${id}`);
  if (!request || request.status !== 'PENDING') return res.status(404).json({ error: 'That request is no longer waiting.' });
  if (approve) {
    const m = await membershipOf(orgId, uid);
    if (!m) { await fsDelete(`groupJoinRequests/${id}`); return res.status(409).json({ error: 'They are no longer a member of the organization.' }); }
    const ids = Array.from(new Set([...(m.data.ministryIds || []), ministryId]));
    if (!(await fsPatch(`orgMemberships/${m.id}`, { ministryIds: ids }))) return res.status(503).json({ error: 'Could not add them right now.' });
    await rebuildOrgAccessIndex(orgId, g.org).catch(e => console.warn('[groups] index rebuild', e?.message || e));
    await notify(uid, `You’re in ${g.ministry.name}`, `${g.org.name || 'Your organization'} approved your request.`, orgId);
  } else {
    await notify(uid, `About ${g.ministry.name}`, 'Your request wasn’t approved this time. You can talk with a leader.', orgId);
  }
  await fsDelete(`groupJoinRequests/${id}`);
  res.json({ status: approve ? 'approved' : 'declined' });
});

elevateGroupsRouter.post('/leave', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  const { orgId, ministryId } = req.body || {};
  const g = await load(String(orgId || ''), String(ministryId || ''));
  if (!g) return res.status(404).json({ error: 'No such group.' });
  const m = await membershipOf(orgId, who.uid);
  if (!m) return res.json({ status: 'none' });
  if ((g.ministry.headUids || []).includes(who.uid) || (m.data.ministryRoles || []).some((r: any) => r.ministryId === ministryId)) {
    return res.status(409).json({ error: 'You hold a role in this group. Ask a leader to change it first.' });
  }
  const ids = (m.data.ministryIds || []).filter((x: string) => x !== ministryId);
  if (!(await fsPatch(`orgMemberships/${m.id}`, { ministryIds: ids }))) return res.status(503).json({ error: 'Could not update right now.' });
  await rebuildOrgAccessIndex(orgId, g.org).catch(e => console.warn('[groups] index rebuild', e?.message || e));
  res.json({ status: 'none' });
});
