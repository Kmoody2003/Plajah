// mediaDedup.ts — don't re-upload the same photo/video twice.
//
// Before uploading an attachment we fingerprint it and check a per-user index of media the
// person has already uploaded. If it's there, we reuse the existing URL (instant, no storage
// churn, one canonical asset). If not, we upload and record it. The fingerprint is a cheap,
// good-enough content signature (byte size + a hash of the head of the file) — full-file hashing
// a 500 MB video in the browser would be wasteful, and collisions on {size + head-hash} are
// vanishingly unlikely for real media.

import { db } from './backendService';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const HEAD_BYTES = 2 * 1024 * 1024; // hash the first 2 MB

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** A stable, cheap fingerprint for a file: size + SHA-256 of its first 2 MB. */
export async function fingerprintFile(file: File | Blob): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const head = file.slice(0, Math.min(file.size, HEAD_BYTES));
    const hash = await sha256Hex(await head.arrayBuffer());
    return `${file.size}_${hash}`;
  } catch { return null; }
}

export interface DedupHit { url: string; type?: string; title?: string; }

/** Look up whether this user has already uploaded a file with this fingerprint. */
export async function lookupMedia(uid: string, fingerprint: string): Promise<DedupHit | null> {
  if (!uid || !fingerprint) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'mediaIndex', fingerprint));
    if (snap.exists()) { const d = snap.data() as any; return d?.url ? { url: d.url, type: d.type, title: d.title } : null; }
  } catch { /* best-effort */ }
  return null;
}

/** Record a newly-uploaded asset so future identical uploads reuse it. Best-effort. */
export async function recordMedia(uid: string, fingerprint: string, url: string, type?: string, title?: string): Promise<void> {
  if (!uid || !fingerprint || !url) return;
  try {
    await setDoc(doc(db, 'users', uid, 'mediaIndex', fingerprint), {
      url, ...(type ? { type } : {}), ...(title ? { title } : {}),
    });
  } catch { /* best-effort */ }
}

/**
 * Upload a file, or reuse the user's existing identical upload. Returns the url + whether it was
 * reused. Set `forceNew` to skip the dedup check and always upload a fresh copy.
 */
export async function uploadOrReuse(
  uid: string, path: string, file: File,
  uploadFile: (p: string, f: File) => Promise<string>,
  opts?: { forceNew?: boolean; type?: string; title?: string },
): Promise<{ url: string; reused: boolean }> {
  const fp = opts?.forceNew ? null : await fingerprintFile(file);
  if (fp) {
    const hit = await lookupMedia(uid, fp);
    if (hit?.url) return { url: hit.url, reused: true };
  }
  const url = await uploadFile(path, file);
  if (fp && !opts?.forceNew) void recordMedia(uid, fp, url, opts?.type, opts?.title);
  else if (!opts?.forceNew) {
    // fingerprint failed but still index by a fresh fingerprint attempt post-upload (cheap retry)
    const fp2 = await fingerprintFile(file);
    if (fp2) void recordMedia(uid, fp2, url, opts?.type, opts?.title);
  }
  return { url, reused: false };
}
