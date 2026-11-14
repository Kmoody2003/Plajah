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

async function post<T>(body: object): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to open shared files.');
  const res = await fetch('/api/object-store/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 503 && out.code === 'not_configured') throw new ObjectStoreUnavailable(out.error);
  if (res.status === 404) throw new ObjectStoreUnavailable('File storage route not found.');
  if (!res.ok) throw new Error(out.error || `Couldn’t open that file (${res.status}).`);
  return out as T;
}

const sign = (op: ObjectOp, key: string, extra: { size?: number; contentType?: string } = {}) => post<Signed>({ op, key, ...extra });

/** Links for many keys of one recording at once (playback, deleting a cloud copy). */
export const signMany = (op: 'get' | 'delete', keys: string[]) => post<{ urls: string[]; expiresAt: number }>({ op, keys });

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
