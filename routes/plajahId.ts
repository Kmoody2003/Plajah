// plajahId router — Plajah ID phase 1 (docs/plajah-id.md): every account and every org gets a permanent
// identity number with a hash-chained history. Identity data is server-only (services/plajahId/store.ts).
//
//   POST /me                  signed in → your person ID (minted on first call) + sets the `pjid` auth claim
//   GET  /me/history          your identity's full history, with the chain verified
//   GET  /org/:orgId          public: the org's ID, or null if it doesn't have one yet
//   POST /org/:orgId          org owner / admin → mint the org's ID; the caller becomes its first controller
//   GET  /org/:orgId/history  the org identity's controllers and the org's owner/admins → its history
//
// Mounted in server.ts as:  app.use('/api/plajah-id', apiLimiter, express.json({ limit: '4kb' }), plajahIdRouter)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, getCustomClaims, setCustomClaims } from '../services/firebaseAdminRest';
import { ensurePersonId, ensureOrgId, orgIdForOrg, personIdForUid, getIdentity, readHistory } from '../services/plajahId/store';

export const plajahIdRouter = Router();

async function caller(req: Request) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(h.slice(7));
  return t && !t.isAnonymous ? t : null;
}

const ORG_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** May this uid manage the org's identity? (creator, linked account, or an admin listed on the org) */
function isOrgAdmin(org: Record<string, any>, uid: string): boolean {
  return org.creatorId === uid || org.accountUid === uid || (Array.isArray(org.admins) && org.admins.includes(uid));
}

plajahIdRouter.post('/me', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  try {
    const { id, created } = await ensurePersonId(who.uid, who.provider || 'unknown');
    // The claim lets firestore.rules recognise the person across all their logins (phase 2+).
    let claimUpdated = false;
    const claims = await getCustomClaims(who.uid);
    if (claims.pjid !== id) claimUpdated = await setCustomClaims(who.uid, { pjid: id });
    const rec = await getIdentity(id);
    res.json({ id, created, createdAt: rec?.createdAt ?? null, claimUpdated });
  } catch (e: any) {
    console.error('[plajah-id] /me', e?.message || e);
    res.status(503).json({ error: 'Plajah ID is unavailable right now.' });
  }
});

plajahIdRouter.get('/me/history', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  try {
    const id = await personIdForUid(who.uid);
    if (!id) return res.json({ id: null, events: [], verified: true });
    res.json({ id, ...(await readHistory(id)) });
  } catch (e: any) {
    console.error('[plajah-id] /me/history', e?.message || e);
    res.status(503).json({ error: 'History is unavailable right now.' });
  }
});

plajahIdRouter.get('/org/:orgId', async (req: Request, res: Response) => {
  const orgId = String(req.params.orgId || '');
  if (!ORG_ID.test(orgId)) return res.status(400).json({ error: 'Bad organization id.' });
  try {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ id: await orgIdForOrg(orgId) });
  } catch {
    res.status(503).json({ error: 'Unavailable.' });
  }
});

plajahIdRouter.post('/org/:orgId', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.params.orgId || '');
  if (!ORG_ID.test(orgId)) return res.status(400).json({ error: 'Bad organization id.' });
  try {
    const org = await fsGet(`organizations/${orgId}`);
    if (!org) return res.status(404).json({ error: 'No such organization.' });
    if (org.isDemo) return res.status(400).json({ error: 'Demo organizations don’t get a Plajah ID.' });
    if (!isOrgAdmin(org, who.uid)) return res.status(403).json({ error: 'Only the organization’s owner or admins can do this.' });
    const me = await ensurePersonId(who.uid, who.provider || 'unknown');
    const { id, created } = await ensureOrgId(orgId, me.id, me.id);
    res.json({ id, created });
  } catch (e: any) {
    console.error('[plajah-id] POST /org', e?.message || e);
    res.status(503).json({ error: 'Plajah ID is unavailable right now.' });
  }
});

plajahIdRouter.get('/org/:orgId/history', async (req: Request, res: Response) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.params.orgId || '');
  if (!ORG_ID.test(orgId)) return res.status(400).json({ error: 'Bad organization id.' });
  try {
    const id = await orgIdForOrg(orgId);
    if (!id) return res.json({ id: null, events: [], verified: true });
    const [rec, org, mine] = await Promise.all([getIdentity(id), fsGet(`organizations/${orgId}`), personIdForUid(who.uid)]);
    const controller = !!mine && !!rec?.controllers?.includes(mine);
    if (!controller && !(org && isOrgAdmin(org, who.uid))) return res.status(403).json({ error: 'Only the organization’s controllers and admins can see its history.' });
    res.json({ id, controllers: rec?.controllers || [], ...(await readHistory(id)) });
  } catch (e: any) {
    console.error('[plajah-id] org history', e?.message || e);
    res.status(503).json({ error: 'History is unavailable right now.' });
  }
});
