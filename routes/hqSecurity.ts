// Content HQ's security view. The audit log has no client read at all; this route is the only way to it, and
// it answers only an org's owner or IT Admins (or a person, about their own files).
//
//   GET  /alerts?scopeKind=&scopeId=   what needs attention, plus how many are new
//   POST /seen    { scopeKind, scopeId }           the badge goes away
//   POST /dismiss { scopeKind, scopeId, alertId }  this one is dealt with
//
// Mounted in server.ts as:  app.use('/api/hq/security', apiLimiter, express.json({ limit: '8kb' }), hqSecurityRouter)

import { Router, Request, Response } from 'express';
import { fsGet, fsPatch, fsQuery, verifyIdTokenDetailed } from '../services/firebaseAdminRest';
import { mayReviewSecurity } from '../services/hqServerAccess';
import { countNewHqAlerts, summarizeHqAlerts, type HqAuditEntry, type HqLinkRow } from '../services/hqSecurityAlerts';

export const hqSecurityRouter = Router();

const badId = (s: string) => !s || s.length > 128 || /[\/]/.test(s);
const MAX_DISMISSED = 300;

async function gate(req: Request, res: Response, kind: string, id: string): Promise<string | null> {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? await verifyIdTokenDetailed(auth.slice(7)) : null;
  if (!t || t.isAnonymous) { res.status(401).json({ error: 'Sign in first.' }); return null; }
  if (badId(kind) || badId(id) || !(await mayReviewSecurity(t.uid, kind, id))) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return t.uid;
}

const stateId = (uid: string, kind: string, id: string) => `${kind}_${id}_${uid}`;

hqSecurityRouter.get('/alerts', async (req: Request, res: Response) => {
  const kind = String(req.query.scopeKind || ''), id = String(req.query.scopeId || '');
  const uid = await gate(req, res, kind, id);
  if (!uid) return;
  res.setHeader('Cache-Control', 'private, no-store');
  const filter = [{ field: 'scopeId', value: id }];
  // Newest first needs the (scopeId, createdAt) index. Until it has built, read without the order.
  let rows = await fsQuery('hqAuditLog', filter, 500, { field: 'createdAt', direction: 'DESCENDING' });
  if (!rows.length) rows = await fsQuery('hqAuditLog', filter, 500);
  const entries = rows.map(r => ({ ...r.data, id: r.id }) as HqAuditEntry & { scopeKind?: string }).filter(e => e.scopeKind === kind);
  const links = (await fsQuery('hqShareLinks', filter, 200)).map(r => ({ ...r.data, id: r.id }) as HqLinkRow & { scopeKind?: string }).filter(l => l.scopeKind === kind);
  const state = (await fsGet(`hqAlertState/${stateId(uid, kind, id)}`)) || {};

  const assetIds = new Set([...entries.map(e => e.assetId), ...links.map(l => l.assetId)].filter(Boolean) as string[]);
  const uids = new Set([...entries.map(e => e.actorUid), ...links.map(l => l.createdByUid)].filter(Boolean) as string[]);
  const assetNames: Record<string, string> = {}, personNames: Record<string, string> = {};
  await Promise.all(Array.from(assetIds).slice(0, 100).map(async a => { const row = await fsGet(`orgAssets/${a}`); if (row?.name) assetNames[a] = String(row.name); }));
  await Promise.all(Array.from(uids).slice(0, 50).map(async u => { const row = await fsGet(`users/${u}`); const n = row?.displayName || row?.name; if (n) personNames[u] = String(n); }));

  const alerts = summarizeHqAlerts({ entries, links, assetNames, personNames, viewerUid: uid, dismissed: state.dismissed || [], now: Date.now() });
  return res.json({ alerts, newCount: countNewHqAlerts(alerts, state.seenAt) });
});

hqSecurityRouter.post('/seen', async (req: Request, res: Response) => {
  const kind = String(req.body?.scopeKind || ''), id = String(req.body?.scopeId || '');
  const uid = await gate(req, res, kind, id);
  if (!uid) return;
  await fsPatch(`hqAlertState/${stateId(uid, kind, id)}`, { seenAt: Date.now() });
  return res.json({ ok: true });
});

hqSecurityRouter.post('/dismiss', async (req: Request, res: Response) => {
  const kind = String(req.body?.scopeKind || ''), id = String(req.body?.scopeId || '');
  const alertId = String(req.body?.alertId || '').slice(0, 200);
  const uid = await gate(req, res, kind, id);
  if (!uid) return;
  if (!alertId) return res.status(400).json({ error: 'Bad request.' });
  const path = `hqAlertState/${stateId(uid, kind, id)}`;
  const state = (await fsGet(path)) || {};
  await fsPatch(path, { dismissed: Array.from(new Set([...(state.dismissed || []), alertId])).slice(-MAX_DISMISSED) });
  return res.json({ ok: true });
});
