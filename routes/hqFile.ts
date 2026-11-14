// One Content HQ file, through the server, so a department's limit holds on every read. Firestore rules can't
// see departments, so nothing below the file list is open to a direct client read except for the people who
// always may: its author, its grantees, the owner and IT Admins.
//
//   GET    /:id          the record, without its text
//   GET    /:id/text     the document text behind a preview (lives in the closed orgAssetText collection)
//   PUT    /:id/text     { text }  its author or someone who can write the scope
//   DELETE /:id/text     goes with the file
//   GET    /:id/thread   versions, comments, reviews and activity
//
// Mounted in server.ts as:  app.use('/api/hq/file', apiLimiter, express.json({ limit: '1mb' }), hqFileRouter)

import { Router, Request, Response } from 'express';
import { fsCreate, fsDelete, fsGet, fsPatch, fsQuery, fsSet, verifyIdTokenDetailed } from '../services/firebaseAdminRest';
import { canWriteHqFileServer, hqFileAccess, loadScopeOwner } from '../services/hqServerAccess';
import { hqRecordForClient, hqRecordForOrgShare, HQ_TEXT_MAX_CHARS, reviewerCandidates } from '../services/hqAccessPolicy';

export const hqFileRouter = Router();

const badId = (s: string) => !s || s.length > 128 || /[\/]/.test(s);

async function callerUid(req: Request, res: Response): Promise<string | null> {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? await verifyIdTokenDetailed(auth.slice(7)) : null;
  if (!t || t.isAnonymous) { res.status(401).json({ error: 'Sign in first.' }); return null; }
  return t.uid;
}

function logDenied(uid: string, id: string, asset: Record<string, any>) {
  fsCreate('hqAuditLog', { kind: 'ACCESS_DENIED', assetId: id, scopeKind: String(asset.scopeKind || ''), scopeId: String(asset.scopeId || ''), actorUid: uid, createdAt: Date.now() }).catch(() => {});
}

/** The file, if this caller may open it. Otherwise answers for them and logs the try. */
async function openable(req: Request, res: Response): Promise<{ uid: string; id: string; asset: Record<string, any>; via: 'own' | 'org_share' } | null> {
  const uid = await callerUid(req, res);
  if (!uid) return null;
  const id = String(req.params.id || '');
  const asset = badId(id) ? null : await fsGet(`orgAssets/${id}`);
  if (!asset) { res.status(404).json({ error: 'File not found.' }); return null; }
  const via = await hqFileAccess(uid, asset);
  if (!via) {
    logDenied(uid, id, asset);
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  return { uid, id, asset, via };
}

hqFileRouter.get('/:id', async (req: Request, res: Response) => {
  const ok = await openable(req, res);
  if (ok) return res.json({ asset: (ok.via === 'org_share' ? hqRecordForOrgShare : hqRecordForClient)({ ...ok.asset, id: ok.id }) });
});

hqFileRouter.get('/:id/text', async (req: Request, res: Response) => {
  const ok = await openable(req, res);
  if (!ok) return;
  const row = await fsGet(`orgAssetText/${ok.id}`);
  return res.json({ text: String(row?.text ?? ok.asset.rawContentText ?? '') });
});

async function writable(req: Request, res: Response): Promise<{ uid: string; id: string; asset: Record<string, any> } | null> {
  const uid = await callerUid(req, res);
  if (!uid) return null;
  const id = String(req.params.id || '');
  const asset = badId(id) ? null : await fsGet(`orgAssets/${id}`);
  if (!asset) { res.status(404).json({ error: 'File not found.' }); return null; }
  if (!(await canWriteHqFileServer(uid, asset))) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return { uid, id, asset };
}

hqFileRouter.put('/:id/text', async (req: Request, res: Response) => {
  const ok = await writable(req, res);
  if (!ok) return;
  const text = String(req.body?.text ?? '').slice(0, HQ_TEXT_MAX_CHARS);
  if (!(await fsSet(`orgAssetText/${ok.id}`, { assetId: ok.id, scopeKind: String(ok.asset.scopeKind || ''), scopeId: String(ok.asset.scopeId || ''), text, updatedAt: Date.now() }))) return res.status(500).json({ error: 'Could not save.' });
  await fsPatch(`orgAssets/${ok.id}`, { hasText: !!text });
  return res.json({ ok: true });
});

hqFileRouter.delete('/:id/text', async (req: Request, res: Response) => {
  const ok = await writable(req, res);
  if (!ok) return;
  await fsDelete(`orgAssetText/${ok.id}`);
  return res.json({ ok: true });
});

// The people this file's writers can pick as reviewers. Roster details stay inside the org, and only writers get them.
hqFileRouter.get('/:id/reviewers', async (req: Request, res: Response) => {
  const ok = await writable(req, res);
  if (!ok) return;
  res.setHeader('Cache-Control', 'private, no-store');
  const kind = String(ok.asset.scopeKind), scopeId = String(ok.asset.scopeId);
  if (kind === 'user') return res.json({ people: [] });
  const owner = await loadScopeOwner(kind, scopeId);
  const members = kind === 'org' ? (await fsQuery('orgMemberships', [{ field: 'orgId', value: scopeId }], 5000)).map(r => r.data) : [];
  return res.json({ people: reviewerCandidates(ok.asset, owner, members, ok.uid) });
});

hqFileRouter.get('/:id/thread', async (req: Request, res: Response) => {
  const ok = await openable(req, res);
  if (!ok) return;
  // Another org receives the file. The conversation around it stays with the org that owns it.
  if (ok.via === 'org_share') return res.json({ versions: [], comments: [], reviews: [], activity: [] });
  const [versions, comments, reviews, activity] = await Promise.all(['hqAssetVersions', 'hqComments', 'hqReviewRequests', 'hqActivity']
    .map(c => fsQuery(c, [{ field: 'assetId', value: ok.id }], 300).then(rows => rows.map(r => ({ ...r.data, id: r.id }) as Record<string, any>))));
  const at = (x: Record<string, any>) => Number(x.createdAt || 0);
  return res.json({
    versions: versions.sort((a, b) => Number(b.version || 0) - Number(a.version || 0)),
    comments: comments.sort((a, b) => at(a) - at(b)),
    reviews: reviews.sort((a, b) => at(b) - at(a)).slice(0, 25),
    activity: activity.sort((a, b) => at(b) - at(a)).slice(0, 100),
  });
});
