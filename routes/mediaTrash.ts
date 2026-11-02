// Media Library trash: albums, videos and photos stay recoverable for 30 days, then go for good, Storage files too.
//
// A trashed item's whole document moves to the closed mediaTrash collection, untouched, so every public feed and
// query stops seeing it at once and a restore brings back exactly what was there. Its files move to media-trash/, which
// has no client read, so a saved URL stops working at trash time, and move back on restore with their token intact.
//
//   GET  /                  this person's trash
//   POST /      { kind, id }   move to trash
//   POST /restore { id }       put it back
//   POST /purge   { id }       delete for good now
//
// Mounted in server.ts as:  app.use('/api/media/trash', apiLimiter, express.json({ limit: '8kb' }), mediaTrashRouter)
// sweepMediaTrash runs from POST /api/hq/retention/sweep.

import { Router, Request, Response } from 'express';
import { fsCreate, fsDelete, fsGet, fsQuery, getAccessToken, verifyIdTokenDetailed } from '../services/firebaseAdminRest';
import { MEDIA_COLLECTION, MEDIA_TRASH_MS, mediaTrashId, objectBelongsTo, stillUsed, storagePathsIn, trashObjectPath, type MediaKind } from '../services/mediaTrashPolicy';
import { OPS_DATABASE_ID } from '../services/opsCollections';

export const mediaTrashRouter = Router();

const PROJECT = 'gen-lang-client-0665118474';
const PROD_DB = process.env.FIREBASE_DB_ID || 'plajah-prod';
const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const docUrl = (db: string, path: string) => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${db}/documents/${path}`;
const badId = (s: string) => !s || s.length > 200 || /[\/]/.test(s);

async function jsonAuth(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** The document exactly as stored, types and all, so nothing changes on the way back. */
async function readRaw(db: string, path: string): Promise<Record<string, any> | null> {
  const res = await fetch(docUrl(db, path), { headers: await jsonAuth() });
  if (!res.ok) return null;
  return ((await res.json()) as any).fields || {};
}
async function writeRaw(db: string, path: string, fields: Record<string, any>): Promise<boolean> {
  const res = await fetch(docUrl(db, path), { method: 'PATCH', headers: await jsonAuth(), body: JSON.stringify({ fields }) });
  return res.ok;
}
async function deleteRaw(db: string, path: string): Promise<boolean> {
  const res = await fetch(docUrl(db, path), { method: 'DELETE', headers: await jsonAuth() });
  return res.ok;
}

async function callerUid(req: Request, res: Response): Promise<string | null> {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? await verifyIdTokenDetailed(auth.slice(7)) : null;
  if (!t || t.isAnonymous) { res.status(401).json({ error: 'Sign in first.' }); return null; }
  return t.uid;
}

/** A person's own trash row, or nothing. Someone else's reads the same as one that doesn't exist. */
async function ownRow(uid: string, id: string): Promise<Record<string, any> | null> {
  if (badId(id)) return null;
  const row = await fsGet(`mediaTrash/${id}`);
  return row && row.ownerUid === uid ? row : null;
}

/** Same-bucket copy then delete. Missing source counts as done, since another trashed item may have moved it. */
async function moveObject(src: string, dst: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let rewriteToken = '';
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(src)}/rewriteTo/b/${BUCKET}/o/${encodeURIComponent(dst)}${rewriteToken ? `?rewriteToken=${encodeURIComponent(rewriteToken)}` : ''}`, { method: 'POST', headers, body: '{}' });
    if (res.status === 404) return true;
    if (!res.ok) return false;
    const j: any = await res.json();
    if (j.done) {
      const del = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(src)}`, { method: 'DELETE', headers });
      return del.ok || del.status === 404;
    }
    rewriteToken = j.rewriteToken;
  }
  return false;
}

/** What to hide when this item goes to Trash: its owner's files that nothing they kept still uses. */
async function hideObjects(ownerUid: string, trashId: string, raw: Record<string, any>, sourceId: string): Promise<Record<string, string> | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const kept = (await Promise.all(Object.values(MEDIA_COLLECTION).map(c => fsQuery(c, [{ field: 'ownerId', value: ownerUid }], 1000)))).flat().filter(r => r.id !== sourceId).map(r => r.data);
  const moved: Record<string, string> = {};
  for (const path of storagePathsIn({ fields: raw }, BUCKET)) {
    if (path.startsWith('media-trash/') || stillUsed(path, kept, BUCKET)) continue;
    const meta = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (meta.status === 404) continue;
    if (!meta.ok) { await restoreObjects(moved); return null; }
    if (!objectBelongsTo(ownerUid, path, ((await meta.json()) as any)?.metadata?.ownerUid)) continue;
    const dst = trashObjectPath(trashId, path);
    if (!(await moveObject(path, dst))) { await restoreObjects(moved); return null; }
    moved[path] = dst;
  }
  return moved;
}
async function restoreObjects(moved: Record<string, string>): Promise<boolean> {
  const out = await Promise.all(Object.entries(moved).map(([path, dst]) => moveObject(dst, path)));
  return out.every(Boolean);
}

async function deleteOwnedObject(ownerUid: string, path: string, at = path): Promise<'deleted' | 'kept' | 'failed'> {
  const token = await getAccessToken();
  if (!token) return 'failed';
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(at)}`;
  const headers = { Authorization: `Bearer ${token}` };
  const meta = await fetch(url, { headers });
  if (meta.status === 404) return 'deleted';
  if (!meta.ok) return 'failed';
  const info: any = await meta.json();
  if (!objectBelongsTo(ownerUid, path, info?.metadata?.ownerUid)) return 'kept';
  const del = await fetch(url, { method: 'DELETE', headers });
  return del.ok || del.status === 404 ? 'deleted' : 'failed';
}

/** Deletes one trashed item and its files. If a file can't be deleted the row stays, so the next sweep retries. */
async function purgeRow(id: string, row: Record<string, any>): Promise<boolean> {
  const raw = await readRaw(OPS_DATABASE_ID, `mediaTrash/${id}`);
  if (!raw) return false;
  const ownerUid = String(row.ownerUid || '');
  const paths = storagePathsIn(raw.data, BUCKET);
  const moved: Record<string, string> = row.movedObjects || {};
  const kept = (await Promise.all(Object.values(MEDIA_COLLECTION).map(c => fsQuery(c, [{ field: 'ownerId', value: ownerUid }], 1000)))).flat().map(r => r.data);
  const otherTrash = (await fsQuery('mediaTrash', [{ field: 'ownerUid', value: ownerUid }], 1000)).filter(r => r.id !== id).map(r => r.data);
  let deleted = 0, skipped = 0, failed = 0;
  for (const path of paths) {
    if (stillUsed(path, [...kept, ...otherTrash], BUCKET)) { skipped++; continue; }
    const out = await deleteOwnedObject(ownerUid, path, moved[path] || path);
    if (out === 'deleted') deleted++; else if (out === 'kept') skipped++; else failed++;
  }
  if (failed) return false;
  await fsCreate('hqAuditLog', { kind: 'MEDIA_PURGED', scopeKind: 'user', scopeId: ownerUid, actorUid: ownerUid, name: String(row.title || ''), mediaKind: String(row.kind || ''), objectCount: deleted, objectsLeft: skipped, createdAt: Date.now() });
  return fsDelete(`mediaTrash/${id}`);
}

/** Items whose 30 days are up. Bounded per run, like the Content HQ sweep. */
export async function sweepMediaTrash(now: number, cap: number): Promise<{ purged: number; failed: number }> {
  const due = await fsQuery('mediaTrash', [{ field: 'retentionDeleteAt', op: 'LESS_THAN_OR_EQUAL', value: now }], cap);
  let purged = 0, failed = 0;
  for (const { id, data } of due) { if (await purgeRow(id, data)) purged++; else failed++; }
  return { purged, failed };
}

mediaTrashRouter.get('/', async (req: Request, res: Response) => {
  const uid = await callerUid(req, res);
  if (!uid) return;
  res.setHeader('Cache-Control', 'private, no-store');
  const rows = await fsQuery('mediaTrash', [{ field: 'ownerUid', value: uid }], 500);
  const items = rows.map(({ id, data: d }) => ({ id, kind: d.kind, sourceId: d.sourceId, title: d.title, cover: d.cover, deletedAt: d.deletedAt, retentionDeleteAt: d.retentionDeleteAt }));
  return res.json({ items: items.sort((a, b) => Number(b.deletedAt || 0) - Number(a.deletedAt || 0)) });
});

mediaTrashRouter.post('/', async (req: Request, res: Response) => {
  const uid = await callerUid(req, res);
  if (!uid) return;
  const kind = String(req.body?.kind || '') as MediaKind;
  const id = String(req.body?.id || '');
  const collection = MEDIA_COLLECTION[kind];
  if (!collection || badId(id)) return res.status(400).json({ error: 'Bad request.' });
  const source = await fsGet(`${collection}/${id}`);
  if (!source) return res.status(404).json({ error: 'Not found.' });
  if (source.ownerId !== uid) return res.status(403).json({ error: 'Forbidden' });
  if (source.oerTextbook === true) return res.status(403).json({ error: 'This open textbook cannot be deleted.' });
  const raw = await readRaw(PROD_DB, `${collection}/${id}`);
  if (!raw) return res.status(500).json({ error: 'Could not move it to Trash.' });
  const now = Date.now();
  const str = (v: unknown) => ({ stringValue: String(v ?? '') });
  const num = (v: number) => ({ integerValue: String(v) });
  const fields = {
    kind: str(kind), sourceId: str(id), ownerUid: str(uid),
    title: str(source.title || 'Untitled'), cover: str(source.coverImage || source.coverImageUrl || source.thumbnailUrl || (kind === 'photo' && source.mediaType !== 'VIDEO' ? source.url : '') || ''),
    deletedAt: num(now), retentionDeleteAt: num(now + MEDIA_TRASH_MS),
    data: { mapValue: { fields: raw } },
  };
  const trashId = mediaTrashId(kind, id);
  const trashPath = `mediaTrash/${trashId}`;
  const moved = await hideObjects(uid, trashId, raw, id);
  if (!moved) return res.status(500).json({ error: 'Could not move it to Trash.' });
  const movedFields: Record<string, any> = {};
  for (const [k, v] of Object.entries(moved)) movedFields[k] = { stringValue: v };
  if (!(await writeRaw(OPS_DATABASE_ID, trashPath, { ...fields, movedObjects: { mapValue: { fields: movedFields } } }))) {
    await restoreObjects(moved);
    return res.status(500).json({ error: 'Could not move it to Trash.' });
  }
  if (!(await deleteRaw(PROD_DB, `${collection}/${id}`))) {
    await deleteRaw(OPS_DATABASE_ID, trashPath);
    await restoreObjects(moved);
    return res.status(500).json({ error: 'Could not move it to Trash.' });
  }
  return res.json({ ok: true, retentionDeleteAt: now + MEDIA_TRASH_MS });
});

mediaTrashRouter.post('/restore', async (req: Request, res: Response) => {
  const uid = await callerUid(req, res);
  if (!uid) return;
  const id = String(req.body?.id || '');
  const row = await ownRow(uid, id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  const collection = MEDIA_COLLECTION[row.kind as MediaKind];
  const raw = await readRaw(OPS_DATABASE_ID, `mediaTrash/${id}`);
  const fields = raw?.data?.mapValue?.fields;
  if (!collection || !fields) return res.status(500).json({ error: 'Could not restore it.' });
  if (!(await restoreObjects(row.movedObjects || {}))) return res.status(500).json({ error: 'Could not restore its files. Try again in a moment.' });
  if (!(await writeRaw(PROD_DB, `${collection}/${row.sourceId}`, fields))) return res.status(500).json({ error: 'Could not restore it.' });
  await fsDelete(`mediaTrash/${id}`);
  return res.json({ ok: true });
});

mediaTrashRouter.post('/purge', async (req: Request, res: Response) => {
  const uid = await callerUid(req, res);
  if (!uid) return;
  const id = String(req.body?.id || '');
  const row = await ownRow(uid, id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  if (!(await purgeRow(id, row))) return res.status(500).json({ error: 'Could not finish deleting it. Try again in a moment.' });
  return res.json({ ok: true });
});
