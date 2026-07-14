// resumableUpload — background media uploader that RESUMES ACROSS SESSIONS.
//
// The Firebase JS SDK's uploadBytesResumable only resumes within a page session (its session URL is
// internal). To survive reloads / app restarts we drive Firebase Storage's raw resumable protocol
// ourselves (the same X-Goog-Upload-* handshake the SDK uses) and persist the session URL + byte
// offset in IndexedDB. On startup we reload the queue, query each unfinished upload's received-bytes,
// and continue from there until every file is in the cloud. Bytes live in the SAME idb blob the editor
// already stashes (studio:blob:<assetId>), so nothing is duplicated and a local-first edit keeps working
// while the upload finishes in the background.

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { auth, storage } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

const QKEY = 'fabula:resumableQueue:v1';
const CHUNK = 8 * 1024 * 1024;        // 8MB — a multiple of 256KB (GCS requires that for non-final chunks)
const HOST = 'https://firebasestorage.googleapis.com/v0/b';

export interface UpEntry {
  id: string;
  assetId: string;       // Fabula pool asset to stamp cloudUrl on when done
  name: string;
  path: string;          // storage object path
  size: number;
  mime: string;
  blobKey: string;       // idb key holding the bytes (studio:blob:<assetId>)
  sessionUrl?: string;   // persisted resumable session URI
  offset: number;        // bytes confirmed uploaded
  status: 'pending' | 'uploading' | 'done' | 'error';
  cloudUrl?: string;
  error?: string;
  updatedAt: number;
}

let queue: UpEntry[] = [];
let running = false;
let loaded = false;
let onComplete: ((assetId: string, cloudUrl: string | undefined) => void) | null = null;
let listeners: ((q: UpEntry[]) => void)[] = [];

const bucket = () => (storage as any)?.app?.options?.storageBucket || '';
const notify = () => { const snap = queue.map(e => ({ ...e })); listeners.forEach(l => { try { l(snap); } catch { /* */ } }); };
const save = async () => { await idbSet(QKEY, queue); notify(); };
const load = async () => { if (loaded) return; queue = (await idbGet(QKEY)) || []; loaded = true; };

/** Subscribe to queue/progress changes (for a status chip). Returns an unsubscribe fn. */
export function onUploadProgress(cb: (q: UpEntry[]) => void): () => void {
  listeners.push(cb); cb(queue.map(e => ({ ...e })));
  return () => { listeners = listeners.filter(l => l !== cb); };
}
export function pendingCount(): number { return queue.filter(e => e.status !== 'done').length; }

async function idToken(): Promise<string> {
  const u = auth.currentUser; if (!u) throw new Error('sign-in required');
  return u.getIdToken();
}

async function startSession(e: UpEntry): Promise<string> {
  const token = await idToken();
  const url = `${HOST}/${bucket()}/o?name=${encodeURIComponent(e.path)}&uploadType=resumable`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Firebase ${token}`,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(e.size),
      'X-Goog-Upload-Header-Content-Type': e.mime || 'application/octet-stream',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ name: e.path, contentType: e.mime || 'application/octet-stream' }),
  });
  const sessionUrl = res.headers.get('X-Goog-Upload-URL');
  if (!sessionUrl) throw new Error(`start failed (${res.status})`);
  return sessionUrl;
}

async function queryOffset(sessionUrl: string): Promise<{ offset: number; final: boolean }> {
  const res = await fetch(sessionUrl, { method: 'POST', headers: { 'X-Goog-Upload-Command': 'query' } });
  return {
    offset: parseInt(res.headers.get('X-Goog-Upload-Size-Received') || '0', 10) || 0,
    final: (res.headers.get('X-Goog-Upload-Status') || '') === 'final',
  };
}

// Upload from e.offset to the end in CHUNKs, persisting the offset after each so a crash resumes cleanly.
async function pushChunks(e: UpEntry, blob: Blob): Promise<any> {
  let meta: any = {};
  while (e.offset < e.size) {
    const end = Math.min(e.offset + CHUNK, e.size);
    const isLast = end >= e.size;
    const res = await fetch(e.sessionUrl!, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload', 'X-Goog-Upload-Offset': String(e.offset) },
      body: blob.slice(e.offset, end),
    });
    if (!res.ok && res.status !== 308) throw new Error(`chunk ${res.status}`);
    e.offset = end; e.updatedAt = Date.now(); await save();
    if (isLast) meta = await res.json().catch(() => ({}));
  }
  return meta;
}

async function processOne(e: UpEntry): Promise<void> {
  const blob: Blob | undefined = await idbGet(e.blobKey);
  if (!blob || !blob.size) { e.status = 'error'; e.error = 'local media unavailable'; await save(); return; }
  if (blob.size !== e.size) { e.size = blob.size; }
  e.status = 'uploading'; e.error = undefined; await save();

  if (e.sessionUrl) {
    // resume: ask the server how much it already has
    try { const q = await queryOffset(e.sessionUrl); e.offset = q.offset; if (q.final) { e.status = 'done'; await save(); onComplete?.(e.assetId, e.cloudUrl); return; } }
    catch { e.sessionUrl = undefined; e.offset = 0; }
  }
  if (!e.sessionUrl) { e.sessionUrl = await startSession(e); e.offset = 0; await save(); }

  const meta = await pushChunks(e, blob);
  const token = (meta?.downloadTokens || '').split(',')[0];
  e.cloudUrl = token ? `${HOST}/${bucket()}/o/${encodeURIComponent(e.path)}?alt=media&token=${token}` : undefined;
  e.status = 'done'; await save();
  onComplete?.(e.assetId, e.cloudUrl);
}

async function runQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await load();
    // Only run when signed in (uploads are owner-scoped). Auth listener re-kicks us otherwise.
    while (auth.currentUser && queue.some(e => e.status === 'pending' || e.status === 'uploading' || (e.status === 'error'))) {
      const e = queue.find(x => x.status === 'pending' || x.status === 'uploading') || queue.find(x => x.status === 'error');
      if (!e) break;
      try { await processOne(e); }
      catch (err) { e.status = 'error'; e.error = (err as Error)?.message || 'upload error'; await save(); await new Promise(r => setTimeout(r, 4000)); /* backoff, then loop retries */ }
      // stop retry-storming a permanently-broken entry
      if (e.status === 'error' && (Date.now() - e.updatedAt) < 3000) { await new Promise(r => setTimeout(r, 4000)); }
    }
  } finally { running = false; }
}

/** Queue a local media file for background upload. `blobKey` must already hold the bytes in idb. */
export async function enqueueUpload(opts: { assetId: string; name: string; mime: string; size: number; blobKey: string; uid: string }): Promise<void> {
  await load();
  if (queue.some(e => e.assetId === opts.assetId && e.status !== 'error')) return; // already queued/done
  const safe = (opts.name || opts.assetId).replace(/[^\w.\-]+/g, '_');
  queue.push({
    id: `up_${opts.assetId}`, assetId: opts.assetId, name: opts.name,
    path: `fabula-media/${opts.uid}/${opts.assetId}_${safe}`, size: opts.size, mime: opts.mime || 'application/octet-stream',
    blobKey: opts.blobKey, offset: 0, status: 'pending', updatedAt: Date.now(),
  });
  await save();
  runQueue();
}

let inited = false;
/** Call once at app/Fabula start: reload the queue and resume any unfinished uploads across sessions. */
export function initResumableUploads(complete?: (assetId: string, cloudUrl: string | undefined) => void): void {
  if (complete) onComplete = complete;
  if (inited) { runQueue(); return; }
  inited = true;
  // Reset any 'uploading' left mid-flight by a previous session back to resumable state.
  load().then(() => { queue.forEach(e => { if (e.status === 'uploading') e.status = 'pending'; }); return save(); }).then(() => runQueue());
  onAuthStateChanged(auth, (u) => { if (u) runQueue(); });   // resume once the user signs in
  if (typeof window !== 'undefined') window.addEventListener('online', () => runQueue());
}
