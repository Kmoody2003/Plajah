// coeditSecurity routers — the server side of who can reach a shared document.
//
// Membership, the paper trail and deleting all pass through here, so firestore.ops.rules can close those writes to
// clients. Names come from the account, never from the request.
//
//   POST /api/coedit/projects                 { kind, localId, title, orgId? }   make the shared project; orgId is checked
//   POST /api/coedit/projects/:pid/access     { action, ... }                    invite, role, revoke, revoke_all, leave, expiry, self_expire
//   POST /api/coedit/projects/:pid/delete                                        owner only; removes everything but the paper trail
//   POST /api/coedit/audit                    { pid, action, detail, ownerId? }  opened, exported, blocked, copy removed
//   POST /api/coedit/sweep                    x-cron-key                         ends access whose date has passed
//   GET  /api/coedit/assets?path=                                                project media, live members only
//
//   POST   /api/tela-media/session    an <img> can't send a Bearer token, so a signed-in browser holds a short HttpOnly cookie
//   DELETE /api/tela-media/session
//   POST   /api/tela-media/release    { pid, public? | roomId? }   let a chat room or the public see a document's media
//   GET    /api/tela-media/:pid/user/:uid/:file  and  /:pid/org/:orgId/:uid/:file
//
// Access is checked on every byte request, so revoking takes effect at once. The cookie is named __session because
// Firebase Hosting strips every other cookie before Cloud Run.
//
// Mounted in server.ts:  app.use('/api/coedit', express.json({ limit: '64kb' }), coeditRouter)
//                        app.use('/api/tela-media', express.json({ limit: '8kb' }), telaMediaRouter)

import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { Readable } from 'stream';
import { fsDelete, fsGet, fsPatch, fsQuery, fsSet, getAccessToken, verifyIdTokenDetailed } from '../services/firebaseAdminRest';
import { addToChat, cascadeDeleteDoc, nameOf, revokeFromProject, writeAudit } from '../services/coeditAdmin';
import {
  canManageAccess, canReadProjectAsset, canReadTelaMedia, canReleaseMedia, expiredMembers, isClientAuditAction, nextExpiryOf,
  orgInviteDecision, parseCoeditAssetPath, parseTelaMediaPath, safeMediaHeaders,
} from '../services/telaDocPolicy';

const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const ROLES = ['editor', 'commenter', 'viewer'];
const MAX_PEOPLE = 200;

export const coeditRouter = Router();
export const telaMediaRouter = Router();

const badId = (s: unknown): boolean => typeof s !== 'string' || !s || s.length > 200 || /[/\\]/.test(s) || s === '.' || s === '..';

async function caller(req: Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(auth.slice(7));
  return t && !t.isAnonymous ? t : null;
}

const orgOf = (orgId: string | undefined) => (orgId ? fsGet(`organizations/${orgId}`) : Promise.resolve(null));

async function isActiveMember(orgId: string, uid: string): Promise<boolean> {
  const rows = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }, { field: 'userId', value: uid }], 5);
  return rows.some(r => r.data.status === 'ACTIVE');
}

async function streamObject(req: Request, res: Response, path: string, filename: string) {
  const token = await getAccessToken();
  if (!token) return res.status(503).json({ error: 'Storage is unavailable.' });
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (req.headers.range) headers.Range = String(req.headers.range);
  const upstream = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`, { headers });
  if (!upstream.ok || !upstream.body) return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'File unavailable.' });
  res.status(upstream.status);
  for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  for (const [k, v] of Object.entries(safeMediaHeaders(upstream.headers.get('content-type'), filename))) res.setHeader(k, v);
  // A minute of browser cache keeps a canvas from refetching on every repaint; the CDN never holds it.
  res.setHeader('Cache-Control', 'private, max-age=60');
  Readable.fromWeb(upstream.body as any).pipe(res);
}

// ── Projects ────────────────────────────────────────────────────────────────

coeditRouter.post('/projects', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in to share this project.' });
  const { kind, localId, title } = req.body || {};
  const orgId = req.body?.orgId ? String(req.body.orgId) : undefined;
  if (badId(kind) || badId(localId) || (orgId && badId(orgId))) return res.status(400).json({ error: 'Bad request.' });
  const pid = `${kind}__${localId}`;
  const existing = await fsGet(`coedit/${pid}`);
  if (existing) return (existing.memberIds || []).includes(t.uid) ? res.json({ project: existing }) : res.status(403).json({ error: 'This project belongs to someone else.' });
  // The id comes from the client, so nobody may claim a document another account already holds.
  const head = await fsGet(`creativeProjects/${pid}`);
  if (head && head.ownerId !== t.uid) return res.status(403).json({ error: 'This project belongs to someone else.' });
  if (orgId) {
    const org = await orgOf(orgId);
    if (!org) return res.status(404).json({ error: 'Organization not found.' });
    if (org.creatorId !== t.uid && !(org.itAdminUids || []).includes(t.uid) && !(await isActiveMember(orgId, t.uid))) return res.status(403).json({ error: 'You are not a member of that organization.' });
  }
  const name = await nameOf(t.uid);
  const now = Date.now();
  const project = {
    id: pid, kind, localId, title: String(title || 'Untitled').slice(0, 300), ownerId: t.uid,
    members: { [t.uid]: 'owner' }, memberIds: [t.uid], names: { [t.uid]: name },
    ...(orgId ? { orgId } : {}), createdAt: now, updatedAt: now,
  };
  if (!(await fsSet(`coedit/${pid}`, project))) return res.status(500).json({ error: 'Could not save.' });
  return res.json({ project });
});

coeditRouter.post('/projects/:pid/access', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const pid = String(req.params.pid);
  if (badId(pid)) return res.status(400).json({ error: 'Bad request.' });
  const p = await fsGet(`coedit/${pid}`);
  if (!p) return res.status(404).json({ error: 'Project not found.' });
  const org = await orgOf(p.orgId);
  const action = String(req.body?.action || '');
  const byName = await nameOf(t.uid);
  const audit = (a: string, detail: string) => writeAudit(pid, p as any, a, t.uid, byName, detail);
  const nameIn = (uid: string) => p.names?.[uid] || 'Collaborator';

  // Anyone may leave. An expired member's own app reports it, and the server checks the date.
  if (action === 'leave') {
    if (t.uid === p.ownerId) return res.status(400).json({ error: 'The owner cannot leave.' });
    await revokeFromProject(pid, p, [t.uid], null);
    await audit('left', byName);
    return res.json({ ok: true });
  }
  if (action === 'self_expire') {
    if (!expiredMembers(p as any).includes(t.uid)) return res.status(409).json({ error: 'Your access has not ended.' });
    await revokeFromProject(pid, p, [t.uid], { by: 'system', byName: 'Your access period', reason: 'The date set for your access has passed.' });
    await writeAudit(pid, p as any, 'access_revoked', 'system', 'Plajah', `${nameIn(t.uid)}: access period ended`);
    return res.json({ ok: true });
  }

  if (!canManageAccess(t.uid, p as any, org)) return res.status(403).json({ error: 'Only the owner can change who has access.' });

  if (action === 'invite') {
    const role = String(req.body?.role || '');
    const uids = [...new Set(((req.body?.uids || []) as unknown[]).map(String).filter(u => !badId(u) && u !== p.ownerId))];
    if (!ROLES.includes(role) || !uids.length) return res.status(400).json({ error: 'Bad request.' });
    if (new Set([...(p.memberIds || []), ...uids]).size > MAX_PEOPLE) return res.status(400).json({ error: `A project holds ${MAX_PEOPLE} people at most.` });
    let outsiders: string[] = [];
    if (p.orgId) {
      const rows = await fsQuery('orgMemberships', [{ field: 'orgId', value: p.orgId }], 5000);
      const decision = orgInviteDecision({
        callerUid: t.uid, org, invitees: uids, outsideConfirmed: req.body?.outside === true,
        activeMemberUids: new Set(rows.filter(r => r.data.status === 'ACTIVE').map(r => String(r.data.userId))),
      });
      if (!decision.ok) {
        const names = await Promise.all(decision.outside.map(nameOf));
        return res.status(409).json({ code: 'OUTSIDE_ORG', canOverride: decision.canOverride, names, error: decision.canOverride ? `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} outside this organization.` : `Only the organization's owner or an IT Admin can share this document outside the organization (${names.join(', ')}).` });
      }
      outsiders = decision.outside;
    }
    const people = await Promise.all(uids.map(async u => ({ uid: u, name: await nameOf(u), photo: (await fsGet(`users/${u}`))?.photoURL as string | undefined })));
    const members = { ...(p.members || {}) }, names = { ...(p.names || {}) }, photos = { ...(p.photos || {}) };
    for (const x of people) { members[x.uid] = role; names[x.uid] = x.name; if (x.photo) photos[x.uid] = x.photo; }
    const memberIds = [...new Set([...(p.memberIds || []), ...uids])];
    if (!(await fsPatch(`coedit/${pid}`, { members, memberIds, names, photos, updatedAt: Date.now() }))) return res.status(500).json({ error: 'Could not save.' });
    await Promise.all(uids.map(u => fsDelete(`coedit/${pid}/revocations/${u}`)));
    await addToChat(p.chatRoomId, uids);
    await audit('shared', `${people.map(x => x.name).join(', ')}: ${role}`);
    if (outsiders.length) await audit('shared_outside_org', people.filter(x => outsiders.includes(x.uid)).map(x => x.name).join(', '));
    return res.json({ ok: true });
  }

  if (action === 'revoke_all') {
    const reason = String(req.body?.reason || '').slice(0, 300);
    const gone = await revokeFromProject(pid, p, (p.memberIds || []).filter((u: string) => u !== p.ownerId), { by: t.uid, byName, reason });
    await audit('all_access_revoked', `${gone.length} people${reason ? `: ${reason}` : ''}`);
    return res.json({ ok: true });
  }

  const uid = String(req.body?.uid || '');
  if (badId(uid) || uid === p.ownerId || !(p.memberIds || []).includes(uid)) return res.status(400).json({ error: 'Bad request.' });

  if (action === 'role') {
    const role = String(req.body?.role || '');
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Bad request.' });
    await fsPatch(`coedit/${pid}`, { members: { ...p.members, [uid]: role }, updatedAt: Date.now() });
    await audit('role_changed', `${nameIn(uid)}: ${role}`);
    return res.json({ ok: true });
  }
  if (action === 'revoke') {
    const reason = String(req.body?.reason || '').slice(0, 300);
    await revokeFromProject(pid, p, [uid], { by: t.uid, byName, reason });
    await audit('access_revoked', reason ? `${nameIn(uid)}: ${reason}` : nameIn(uid));
    return res.json({ ok: true });
  }
  if (action === 'expiry') {
    const at = req.body?.at == null ? null : Number(req.body.at);
    if (at !== null && !(at > 0)) return res.status(400).json({ error: 'Bad request.' });
    const expires = { ...(p.expires || {}) };
    if (at) expires[uid] = at; else delete expires[uid];
    await fsPatch(`coedit/${pid}`, { expires, nextExpiry: nextExpiryOf(expires), updatedAt: Date.now() });
    await audit('access_expiry_set', `${nameIn(uid)}: ${at ? new Date(at).toISOString() : 'no end date'}`);
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: 'Bad request.' });
});

coeditRouter.post('/projects/:pid/delete', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const pid = String(req.params.pid);
  if (badId(pid)) return res.status(400).json({ error: 'Bad request.' });
  const project = await fsGet(`coedit/${pid}`);
  if (project ? project.ownerId !== t.uid : ((await fsGet(`creativeProjects/${pid}`))?.ownerId ?? t.uid) !== t.uid) return res.status(403).json({ error: 'Only the owner can delete this document.' });
  const byName = await nameOf(t.uid);
  await writeAudit(pid, project ? project as any : { ownerId: t.uid }, 'deleted', t.uid, byName, String(project?.title || '').slice(0, 300));
  return res.json({ ok: true, ...(await cascadeDeleteDoc(pid, project, t.uid)) });
});

// ── The paper trail ─────────────────────────────────────────────────────────

coeditRouter.post('/audit', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const { pid, action } = req.body || {};
  if (badId(pid) || !isClientAuditAction(action)) return res.status(400).json({ error: 'Bad request.' });
  const project = await fsGet(`coedit/${pid}`);
  // A document nobody shared has only its author. Otherwise you log only documents you're in.
  if (project && !(project.memberIds || []).includes(t.uid)) return res.status(403).json({ error: 'Forbidden' });
  await writeAudit(pid, project ? project as any : { ownerId: t.uid }, action, t.uid, await nameOf(t.uid), String(req.body?.detail || ''));
  return res.json({ ok: true });
});

// ── Dates that passed ───────────────────────────────────────────────────────

coeditRouter.post('/sweep', async (req: Request, res: Response) => {
  const key = String(req.headers['x-cron-key'] || '');
  const ok = [process.env.ADMIN_SEED_KEY, process.env.CRON_SECRET].some(s => {
    if (!s || s.length !== key.length) return false;
    return timingSafeEqual(Buffer.from(key), Buffer.from(s));
  });
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });
  const now = Date.now();
  let ended = 0;
  for (const { id, data: p } of await fsQuery('coedit', [{ field: 'nextExpiry', op: 'LESS_THAN_OR_EQUAL', value: now }], 200)) {
    const gone = await revokeFromProject(id, p, expiredMembers(p as any, now), { by: 'system', byName: 'Your access period', reason: 'The date set for your access has passed.' });
    if (gone.length) await writeAudit(id, p as any, 'access_revoked', 'system', 'Plajah', `${gone.map(u => p.names?.[u] || 'Collaborator').join(', ')}: access period ended`);
    ended += gone.length;
  }
  return res.json({ ok: true, ended });
});

// ── Project media (coedit-assets) ───────────────────────────────────────────

coeditRouter.get('/assets', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const path = String(req.query.path || '');
  const parsed = parseCoeditAssetPath(path);
  if (!parsed) return res.status(400).json({ error: 'Bad request.' });
  const project = await fsGet(`coedit/${parsed.pid}`);
  if (!canReadProjectAsset(t.uid, project as any, await orgOf(project?.orgId))) return res.status(403).json({ error: 'Forbidden' });
  return streamObject(req, res, path, path.split('/').pop() || 'file');
});

// ── Document media (tela-media) ─────────────────────────────────────────────

const mediaSecret = () => process.env.TELA_MEDIA_SECRET || process.env.HQ_STREAM_SECRET || process.env.ADMIN_SEED_KEY || process.env.CRON_SECRET || '';
const signSession = (uid: string, exp: string) => createHmac('sha256', mediaSecret()).update(`tela-media|${uid}|${exp}`).digest('hex');
const SESSION_MS = 24 * 60 * 60 * 1000;
const cookieOpts = (req: Request) => ({ httpOnly: true, sameSite: 'lax' as const, path: '/', secure: req.secure || req.headers['x-forwarded-proto'] === 'https' });

function sessionUid(req: Request): string | null {
  const [uid, exp, sig] = String((req as any).cookies?.__session || '').split('.');
  if (!uid || !exp || !sig || !mediaSecret() || !(Number(exp) > Date.now())) return null;
  const want = Buffer.from(signSession(uid, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? uid : null;
}

telaMediaRouter.post('/session', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  if (!mediaSecret()) return res.status(503).json({ error: 'Not configured.' });
  const exp = String(Date.now() + SESSION_MS);
  res.cookie('__session', `${t.uid}.${exp}.${signSession(t.uid, exp)}`, { ...cookieOpts(req), maxAge: SESSION_MS });
  return res.json({ ok: true, expiresAt: Number(exp) });
});

telaMediaRouter.delete('/session', (req: Request, res: Response) => {
  res.clearCookie('__session', cookieOpts(req));
  return res.json({ ok: true });
});

telaMediaRouter.post('/release', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const pid = req.body?.pid;
  const roomId = req.body?.roomId;
  const toPublic = req.body?.public === true;
  if (badId(pid) || (!toPublic && badId(roomId))) return res.status(400).json({ error: 'Bad request.' });
  const project = await fsGet(`coedit/${pid}`);
  if (!canReleaseMedia(t.uid, project as any, await orgOf(project?.orgId), { uploaderUid: t.uid })) return res.status(403).json({ error: 'Forbidden' });
  const prior = await fsGet(`telaMediaRelease/${pid}`);
  let uids: string[] = prior?.uids || [];
  if (!toPublic) {
    const room = await fsGet(`chat_rooms/${roomId}`);
    const participants: string[] = room?.participants || [];
    if (!participants.includes(t.uid)) return res.status(403).json({ error: 'Forbidden' });
    uids = [...new Set([...uids, ...participants])].slice(0, 2000);
  }
  await fsSet(`telaMediaRelease/${pid}`, { pid, public: toPublic || prior?.public === true, uids, by: t.uid, at: Date.now() });
  if (project) await writeAudit(pid, project as any, toPublic ? 'media_published' : 'media_sent_to_chat', t.uid, await nameOf(t.uid), toPublic ? 'Images became public with a publication' : 'Images shared with a chat');
  return res.json({ ok: true });
});

async function serveMedia(req: Request, res: Response, path: string) {
  const media = parseTelaMediaPath(path);
  if (!media) return res.status(400).json({ error: 'Bad request.' });
  const uid = sessionUid(req);
  const [project, release] = await Promise.all([fsGet(`coedit/${media.pid}`), fsGet(`telaMediaRelease/${media.pid}`)]);
  const orgId = project?.orgId || (media.scope === 'org' ? media.orgId : undefined);
  const org = await orgOf(orgId);
  const seated = !project && media.scope === 'org' && !!uid && !!orgId ? await isActiveMember(orgId, uid) : false;
  if (!canReadTelaMedia({ uid, media, project: project as any, org, isActiveOrgMember: seated, release: release as any })) return res.status(uid ? 403 : 401).json({ error: 'Forbidden' });
  return streamObject(req, res, path, media.file);
}

telaMediaRouter.get('/:pid/user/:uid/:file', (req: Request, res: Response) => serveMedia(req, res, `tela-media/${req.params.pid}/user/${req.params.uid}/${req.params.file}`));
telaMediaRouter.get('/:pid/org/:orgId/:uid/:file', (req: Request, res: Response) => serveMedia(req, res, `tela-media/${req.params.pid}/org/${req.params.orgId}/${req.params.uid}/${req.params.file}`));
