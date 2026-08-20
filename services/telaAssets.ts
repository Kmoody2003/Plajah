// telaAssets — image upload for the Tela Image device (P2).
//
// Signed-in users: the file is uploaded to Firebase Storage under
// `users/{uid}/tela/{id}_{safe}` (the existing owner-write rule covers this
// path) and the durable download URL is returned. Guests: no account to write
// to, so we hand back a session-only object: URL — usable this session, gone on
// reload (the caller flags the layer `sessionOnly` and the UI says so).
//
// Mirrors the resumable-upload + fresh-token recipe used across the app
// (orgAssets / backendService): getIdToken(true) first so a hot-switched
// account doesn't 401 with a stale token.

import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth } from './firebase';

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
  } as Record<string, string>)[ext] || 'application/octet-stream';
}

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
  const storagePath = `users/${u.uid}/tela/${uid()}_${safe}`;
  const storageRef = ref(storage, storagePath);
  const contentType = contentTypeFor(file);
  const src = await new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType });
    task.on(
      'state_changed',
      s => onProgress?.((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100),
      err => reject(err),
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
  return { src, storagePath, sessionOnly: false };
}
