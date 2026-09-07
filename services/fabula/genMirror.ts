// ─── Generation result mirroring ─────────────────────────────────────────────
// SERVER-SIDE ONLY.
//
// Providers hand back results as URLs on their own hosts. Those are not ours and not permanent — a
// bin asset pointing at one is a broken thumbnail waiting to happen. When a job completes we copy the
// bytes into Plajah Storage and rewrite the result URLs, so what lands in the media pool is ours.
//
// Objects go to `fabula/{uid}/gen/{projectId}/{jobId}/{n}.{ext}`, which is inside the existing
// `fabula/{uid}/**` storage rule (owner read/write, 50MB) — no rules change, no dry-run needed.
//
// The read URL is deliberately the SAME shape Fabula's own resumable uploader produces:
//   https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={downloadToken}
// so a mirrored asset is indistinguishable from an uploaded one everywhere downstream — viewer,
// grade, export.
//
// Mirroring is best-effort by design. If it fails, the job still completes with the provider's URLs
// and carries a note saying they may expire. A broken mirror must never turn a finished generation
// into a lost one.

export const FIREBASE_STORAGE_HOST = 'https://firebasestorage.googleapis.com/v0/b';

/** Storage size ceiling, matching the `fabula/{uid}/**` rule. */
export const MIRROR_MAX_BYTES = 50 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export function extForMime(mime?: string): string {
  const key = String(mime || '').split(';')[0].trim().toLowerCase();
  if (MIME_EXT[key]) return MIME_EXT[key];
  const slash = key.indexOf('/');
  // A subtype we don't know is still a better guess than a wrong hardcoded one.
  const sub = slash >= 0 ? key.slice(slash + 1).replace(/[^a-z0-9]/g, '') : '';
  return sub || 'bin';
}

/** Path segments come from user-controlled ids; keep them to a safe alphabet so nothing can climb
 *  out of the uid prefix and write into another user's space. */
export function safeSegment(s: string, fallback: string): string {
  const clean = String(s ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '')   // separators gone, so a segment can never split
    .replace(/\.{2,}/g, '.')           // and no `..` survives anywhere, not just at the start —
    .replace(/^\.+|\.+$/g, '')         // which makes "the path contains no .." checkable at a glance
    .slice(0, 64);
  return clean || fallback;
}

export function mirrorPath(
  uid: string, projectId: string, jobId: string, index: number, mime?: string,
): string {
  return [
    'fabula',
    safeSegment(uid, 'anon'),
    'gen',
    safeSegment(projectId, 'local'),
    safeSegment(jobId, 'job'),
    `${index + 1}.${extForMime(mime)}`,
  ].join('/');
}

export function firebaseDownloadUrl(bucket: string, path: string, token: string): string {
  return `${FIREBASE_STORAGE_HOST}/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

export interface GenResult { url: string; name: string; mime: string }

export interface MirrorDeps {
  bucket: string;
  /** Read the provider's result. Should reject rather than return partial bytes. */
  fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType?: string }>;
  /** Store the bytes and register `token` as the Firebase download token. */
  upload(path: string, bytes: Uint8Array, contentType: string, token: string): Promise<boolean>;
  makeToken(): string;
  maxBytes?: number;
}

export interface MirrorOutcome {
  results: GenResult[];       // rewritten where mirroring succeeded, original URL where it didn't
  mirrored: number;
  failed: number;
  note?: string;              // set only when something stayed on the provider's host
}

/** Copy every result into Plajah Storage, rewriting the URLs that make it.
 *  Never throws: a failure downgrades to the provider URL plus a note. */
export async function mirrorResults(
  results: GenResult[],
  ctx: { uid: string; projectId: string; jobId: string },
  deps: MirrorDeps,
): Promise<MirrorOutcome> {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return { results: [], mirrored: 0, failed: 0 };

  const cap = deps.maxBytes ?? MIRROR_MAX_BYTES;
  const out: GenResult[] = [];
  let mirrored = 0, failed = 0;

  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r?.url) { failed++; continue; }
    // Already ours (a retry, or a provider that handed back a Plajah URL) — leave it alone.
    if (r.url.startsWith(FIREBASE_STORAGE_HOST)) { out.push(r); mirrored++; continue; }
    try {
      const { bytes, contentType } = await deps.fetchBytes(r.url);
      if (!bytes?.length) throw new Error('empty response');
      if (bytes.length > cap) throw new Error(`result is ${(bytes.length / 1e6).toFixed(1)}MB, over the ${(cap / 1e6).toFixed(0)}MB limit`);
      // Trust the provider's declared type over ours: the result name is a guess we made.
      const mime = contentType?.split(';')[0].trim() || r.mime || 'image/png';
      const path = mirrorPath(ctx.uid, ctx.projectId, ctx.jobId, i, mime);
      const token = deps.makeToken();
      if (!await deps.upload(path, bytes, mime, token)) throw new Error('storage upload failed');
      out.push({ url: firebaseDownloadUrl(deps.bucket, path, token), name: r.name, mime });
      mirrored++;
    } catch {
      out.push(r);   // keep the provider URL — a usable-but-temporary result beats none
      failed++;
    }
  }

  return {
    results: out,
    mirrored,
    failed,
    note: failed
      ? `${failed} of ${list.length} result${list.length === 1 ? '' : 's'} could not be copied into Plajah Storage and still point at the provider — those links may expire. Re-run the job or download them now.`
      : undefined,
  };
}
