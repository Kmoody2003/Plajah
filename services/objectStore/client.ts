// services/objectStore/client.ts — upload to and download from the private bucket through signed links.
//
// Each call asks /api/object-store/sign for a link (the server checks who you are and what the file
// belongs to), then talks to the bucket directly, so file bytes never pass through our server.
// ObjectStoreUnavailable means the server has no bucket configured; callers fall back to Firebase Storage.

import { auth } from '../firebase';
import type { ObjectOp } from './objectKeys';

export class ObjectStoreUnavailable extends Error {}

interface Signed {
  url: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: number;
}

async function sign(op: ObjectOp, key: string, extra: { size?: number; contentType?: string } = {}): Promise<Signed> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to open shared files.');
  const res = await fetch('/api/object-store/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ op, key, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 503 && body.code === 'not_configured') throw new ObjectStoreUnavailable(body.error);
  if (res.status === 404) throw new ObjectStoreUnavailable('File storage route not found.');
  if (!res.ok) throw new Error(body.error || `Couldn’t open that file (${res.status}).`);
  return body as Signed;
}

/** Uploads a blob to `key`, reporting progress 0–1. */
export async function putObject(key: string, blob: Blob, contentType: string, onProgress?: (fraction: number) => void): Promise<void> {
  const s = await sign('put', key, { size: blob.size, contentType });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', s.url);
    for (const [k, v] of Object.entries(s.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Upload interrupted.'));
    xhr.send(blob);
  });
}

export async function getObject(key: string): Promise<Blob> {
  const s = await sign('get', key);
  const res = await fetch(s.url);
  if (!res.ok) throw new Error(`Couldn’t download that file (${res.status}).`);
  return res.blob();
}

export async function deleteObject(key: string): Promise<void> {
  const s = await sign('delete', key);
  const res = await fetch(s.url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Couldn’t remove that file (${res.status}).`);
}
