// telaAssets — image upload for the Tela Image device (P2).
//
// A document's media goes to `tela-media/{pid}/…`, which no client can read. It is served by /api/tela-media after a
// check against the document's members, so revoking someone ends what they can load. Uploads with no document open
// (Notes pages, Stage backgrounds) keep their durable `users/{uid}/tela/` link. Guests have no account to write to, so
// they get a session-only object: URL, gone on reload (the caller flags the layer `sessionOnly` and the UI says so).
//
// Mirrors the resumable-upload + fresh-token recipe used across the app
// (orgAssets / backendService): getIdToken(true) first so a hot-switched
// account doesn't 401 with a stale token.

import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth } from './firebase';
import { ensureTelaMediaSession } from './tela/telaMediaSession';

export interface TelaUploadResult {
  src: string;
  storagePath?: string;
  sessionOnly: boolean;
}

const uid = () => `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function contentTypeFor(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp',
    lottie: 'application/zip+dotlottie', json: 'application/json',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  } as Record<string, string>)[ext] || 'application/octet-stream';
}

let activeDoc: { pid: string; orgId?: string } | null = null;
/** The document open in the editor; what's uploaded while it's open belongs to it. */
export function setActiveTelaMediaDoc(doc: { pid: string; orgId?: string } | null) { activeDoc = doc; }

/**
 * Upload one image for an Image device. Guests get a session-only object URL;
 * signed-in users get a durable Storage URL under their own `users/{uid}/tela/`.
 */
export async function uploadTelaImage(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<TelaUploadResult> {
  const u = auth.currentUser;
  if (!u) {
    // Guest — session only. No account to persist against.
    return { src: URL.createObjectURL(file), sessionOnly: true };
  }
  try { await u.getIdToken(true); } catch { /* the write below surfaces a real auth error */ }
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-64) || 'image';
  const contentType = contentTypeFor(file);
  const doc = activeDoc;
  const pid = doc ? doc.pid.replace(/[^\w.\-]+/g, '_') : '';
  const name = `${uid()}_${safe}`;
  const relative = doc ? (doc.orgId ? `${pid}/org/${encodeURIComponent(doc.orgId)}/${u.uid}/${name}` : `${pid}/user/${u.uid}/${name}`) : '';
  const storagePath = doc ? `tela-media/${doc.orgId ? `${pid}/org/${doc.orgId}/${u.uid}/${name}` : `${pid}/user/${u.uid}/${name}`}` : `users/${u.uid}/tela/${name}`;
  const storageRef = ref(storage, storagePath);
  if (doc) await ensureTelaMediaSession();
  const durable = await new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType });
    task.on(
      'state_changed',
      s => onProgress?.((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100),
      err => reject(err),
      async () => { try { resolve(doc ? '' : await getDownloadURL(task.snapshot.ref)); } catch (e) { reject(e); } },
    );
  });
  const src = doc ? `/api/tela-media/${relative}` : durable;
  return { src, storagePath, sessionOnly: false };
}

/** Media-neutral name used by the document canvas. Kept as an alias so older
 * image-device call sites and stored boards remain fully compatible. */
export const uploadTelaAsset = uploadTelaImage;
