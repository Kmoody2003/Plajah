// services/hq/b2Store.ts — Content HQ files on B2 (Drive's storage engine folded into HQ). SERVER ONLY.
//
// A B2-held HQ file is an ordinary orgAssets record whose storagePath is `b2:hq/{kind}/{scopeId}/{assetId}/v{n}`
// (`b2:` marks the backend; no `//`, which hqObjectPathInScope rightly refuses). Everything that already
// reads HQ objects — protected streaming, the scan gate, share links, versions — switches on that prefix,
// so access rules, audit and quarantine stay exactly as they are. Older files stay on Firebase Storage.
//
//   begin     → may this person write the scope? does the file fit the cap (incl. other uploads in flight)?
//               reserve it (an hqUploads row), then hand back a signed single PUT or a multipart id
//   parts     → signed part links (resumable; ≤100 per call)
//   complete  → finish multipart, HEAD the object for its TRUE size, write orgAssets + hqAssetVersions
//               exactly as the browser upload does (scanStatus PENDING; the client then asks for the scan)
//   abort     → drop the object/parts, free the reservation
// The cap is HQ's own (contentHqEntitlements) plus any Drive storage add-ons (services/drive/plans).

import { abortMultipart, completeMultipart, createMultipart, deleteObjectServer, getUrl, headSize, partUrl, putUrl, type S3Config } from '../objectStore/s3ops';
import { planUpload, MAX_PARTS } from '../drive/transfers';

type Doc = Record<string, any>;
type Fetch = typeof fetch;
export type HqScopeKind = 'user' | 'org' | 'business';

export const B2_PREFIX = 'b2:';
export const RESERVATION_TTL_MS = 24 * 3600_000;
const PART_BATCH = 100;
const SCOPE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MIME_RE = /^[\w.+-]{1,40}\/[\w.+-]{1,120}$/;
// eslint-disable-next-line no-control-regex
const BAD_NAME = /[\u0000-\u001f\u007f/\\]/;
const FOLDER_MAX = 120;
/** Mirrors HQ_MAX_BYTES in server.ts (and storage.rules' 25 GB cap). */
export const HQ_MAX_FILE_BYTES = 25 * 1024 ** 3;

export const isB2Path = (p: unknown): p is string => typeof p === 'string' && p.startsWith(B2_PREFIX);
export const b2KeyOf = (p: string) => p.slice(B2_PREFIX.length);
export const hqB2Key = (kind: HqScopeKind, scopeId: string, assetId: string, version = 1) => `hq/${kind}/${scopeId}/${assetId}/v${version}`;

/** Signed GET (and Range passthrough) for a `b2:` object — for streaming and scanning. */
export function b2ObjectRequest(cfg: S3Config, path: string, range?: string, now?: Date): { url: string; headers: Record<string, string> } {
  return { url: getUrl(cfg, b2KeyOf(path), 300, undefined, now), headers: range ? { Range: range } : {} };
}

export class HqUploadError extends Error {
  constructor(public code: string, msg: string, public status = 400) { super(msg); }
}

export interface HqB2Deps {
  enabled: () => boolean;
  s3: () => S3Config | null;
  fetch?: Fetch;
  get: (path: string) => Promise<Doc | null>;
  set: (path: string, data: Doc) => Promise<boolean>;
  remove: (path: string) => Promise<boolean>;
  /** Pending uploads for a scope (hqUploads where scopeId == id). */
  pendingFor: (scopeId: string) => Promise<Array<{ id: string; data: Doc }>>;
  canWrite: (uid: string, kind: HqScopeKind, scopeId: string) => Promise<boolean>;
  /** Bytes the scope already holds (live, not trashed — same rule as /api/hq/quota-check). */
  usedBytes: (kind: HqScopeKind, scopeId: string) => Promise<number>;
  /** Cap in bytes; 0 = no cap. */
  capBytes: (kind: HqScopeKind, scopeId: string, uid: string) => Promise<number>;
  now: () => number;
  newId: () => string;
}

function contentKind(mime: string, name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('text/') || mime.includes('word') || mime.includes('document') ||
      ['doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'pages', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'key', 'numbers'].includes(ext)) return 'doc';
  return 'other';
}

export interface HqBeginInput { scopeKind: unknown; scopeId: unknown; name: unknown; size: unknown; mime: unknown; folder?: unknown }
export type HqBeginResult =
  | { uploadId: string; assetId: string; mode: 'single'; url: string; headers: Record<string, string> }
  | { uploadId: string; assetId: string; mode: 'multipart'; partSize: number; parts: number };

export async function beginHqUpload(uid: string, input: HqBeginInput, deps: HqB2Deps): Promise<HqBeginResult> {
  if (!deps.enabled()) throw new HqUploadError('b2_off', 'Large-file storage isn’t switched on yet.', 503);
  const cfg = deps.s3();
  if (!cfg) throw new HqUploadError('not_configured', 'Storage isn’t set up on this server.', 503);
  const kind = String(input.scopeKind) as HqScopeKind;
  const scopeId = String(input.scopeId ?? '');
  if (!['user', 'org', 'business'].includes(kind) || !SCOPE_ID_RE.test(scopeId)) throw new HqUploadError('bad_scope', 'Choose where the file goes.');
  const name = String(input.name ?? '').trim();
  if (!name || name.length > 255 || BAD_NAME.test(name)) throw new HqUploadError('bad_name', 'File names can be 1–255 characters, without slashes.');
  const mime = String(input.mime ?? '');
  if (!MIME_RE.test(mime)) throw new HqUploadError('bad_type', 'Unknown file type.');
  const size = Number(input.size);
  if (!Number.isSafeInteger(size) || size <= 0) throw new HqUploadError('bad_size', 'Unknown file size.');
  if (size > HQ_MAX_FILE_BYTES) throw new HqUploadError('too_large', 'Files can be up to 25 GB.', 413);
  const folder = input.folder === undefined || input.folder === null || input.folder === '' ? undefined : String(input.folder).trim().slice(0, FOLDER_MAX);
  if (folder !== undefined && BAD_NAME.test(folder)) throw new HqUploadError('bad_folder', 'Unknown folder.');

  if (!(await deps.canWrite(uid, kind, scopeId))) throw new HqUploadError('forbidden', 'You can’t add files here.', 403);

  const now = deps.now();
  const pending = (await deps.pendingFor(scopeId)).filter(r => r.data.status === 'pending' && now - Number(r.data.createdAt) < RESERVATION_TTL_MS);
  const reserved = pending.reduce((t, r) => t + Number(r.data.size || 0), 0);
  const [used, cap] = await Promise.all([deps.usedBytes(kind, scopeId), deps.capBytes(kind, scopeId, uid)]);
  if (cap > 0 && used + reserved + size > cap) {
    throw new HqUploadError('over_cap', 'Your Content HQ storage is full. Free up space or add storage to keep uploading.', 413);
  }

  const uploadId = deps.newId(), assetId = deps.newId();
  const key = hqB2Key(kind, scopeId, assetId, 1);
  const plan = planUpload(size);
  const multipartId = plan.mode === 'multipart' ? await createMultipart(cfg, key, mime, deps.fetch) : null;
  await deps.set(`hqUploads/${uploadId}`, {
    uid, scopeKind: kind, scopeId, assetId, key, name, mime, size, folder: folder ?? null,
    mode: plan.mode, multipartId, parts: plan.mode === 'multipart' ? plan.parts : 1,
    partSize: plan.mode === 'multipart' ? plan.partSize : size, status: 'pending', createdAt: now,
  });
  if (plan.mode === 'single') {
    return { uploadId, assetId, mode: 'single', url: putUrl(cfg, key, size, mime, 900, new Date(now)), headers: { 'Content-Type': mime } };
  }
  return { uploadId, assetId, mode: 'multipart', partSize: plan.partSize, parts: plan.parts };
}

async function loadUpload(uid: string, uploadId: string, deps: HqB2Deps): Promise<Doc> {
  if (!ID_RE.test(uploadId)) throw new HqUploadError('not_found', 'Upload not found.', 404);
  const up = await deps.get(`hqUploads/${uploadId}`);
  if (!up || up.uid !== uid) throw new HqUploadError('not_found', 'Upload not found.', 404);
  if (up.status !== 'pending') throw new HqUploadError('not_pending', 'This upload already finished.', 409);
  if (deps.now() - Number(up.createdAt) >= RESERVATION_TTL_MS) throw new HqUploadError('expired', 'This upload expired. Start it again.', 410);
  return up;
}

export async function signHqParts(uid: string, uploadId: string, partNumbers: unknown, deps: HqB2Deps): Promise<Array<{ partNumber: number; url: string }>> {
  const cfg = deps.s3();
  if (!cfg) throw new HqUploadError('not_configured', 'Storage isn’t set up on this server.', 503);
  const up = await loadUpload(uid, uploadId, deps);
  if (up.mode !== 'multipart') throw new HqUploadError('not_multipart', 'This upload is a single file.');
  if (!Array.isArray(partNumbers) || !partNumbers.length || partNumbers.length > PART_BATCH) throw new HqUploadError('bad_parts', `Ask for 1–${PART_BATCH} parts at a time.`);
  const max = Math.min(Number(up.parts), MAX_PARTS);
  if (partNumbers.some(n => !Number.isInteger(n) || n < 1 || n > max)) throw new HqUploadError('bad_parts', 'Unknown part number.');
  const at = new Date(deps.now());
  return (partNumbers as number[]).map(n => ({ partNumber: n, url: partUrl(cfg, up.key, up.multipartId, n, 3600, at) }));
}

export async function completeHqUpload(uid: string, uploadId: string, parts: unknown, deps: HqB2Deps): Promise<Doc> {
  const cfg = deps.s3();
  if (!cfg) throw new HqUploadError('not_configured', 'Storage isn’t set up on this server.', 503);
  const up = await loadUpload(uid, uploadId, deps);
  if (up.mode === 'multipart') {
    if (!Array.isArray(parts) || parts.length !== up.parts || parts.some((p: any) => !Number.isInteger(p?.partNumber) || typeof p?.etag !== 'string' || p.etag.length > 200)) {
      throw new HqUploadError('bad_parts', 'Some parts are missing.');
    }
    await completeMultipart(cfg, up.key, up.multipartId, parts as Array<{ partNumber: number; etag: string }>, deps.fetch);
  }
  const size = await headSize(cfg, up.key, deps.fetch);
  if (size === null || size !== up.size) {
    await deleteObjectServer(cfg, up.key, deps.fetch);
    await deps.set(`hqUploads/${uploadId}`, { ...up, status: 'failed', error: size === null ? 'missing' : 'size_mismatch' });
    throw new HqUploadError('verify_failed', 'The upload didn’t arrive complete. Please try again.', 422);
  }
  const now = deps.now();
  const storagePath = B2_PREFIX + up.key;
  const versionId = deps.newId();
  const asset: Doc = {
    id: up.assetId, scopeKind: up.scopeKind, scopeId: up.scopeId, uploadedByUid: uid, name: up.name,
    kind: contentKind(up.mime, up.name), mimeType: up.mime,
    url: `/api/hq/assets/${encodeURIComponent(up.assetId)}/download`, storagePath, storageBackend: 'b2', sizeBytes: size,
    ...(up.folder ? { folder: up.folder } : {}),
    status: 'DRAFT', scanStatus: 'PENDING', versionCount: 1, uploadedAt: now, currentVersionId: versionId,
  };
  await deps.set(`orgAssets/${up.assetId}`, asset);
  await deps.set(`hqAssetVersions/${versionId}`, {
    id: versionId, assetId: up.assetId, version: 1, storagePath, name: up.name, mimeType: up.mime, sizeBytes: size, uploadedByUid: uid, createdAt: now,
  });
  await deps.set(`hqUploads/${uploadId}`, { ...up, status: 'done', finishedAt: now });
  return asset;
}

export async function abortHqUpload(uid: string, uploadId: string, deps: HqB2Deps): Promise<void> {
  const up = await loadUpload(uid, uploadId, deps).catch(e => { if (e?.code === 'expired') return null; throw e; });
  if (!up) return;
  const cfg = deps.s3();
  if (cfg) {
    if (up.mode === 'multipart' && up.multipartId) await abortMultipart(cfg, up.key, up.multipartId, deps.fetch);
    else await deleteObjectServer(cfg, up.key, deps.fetch);
  }
  await deps.set(`hqUploads/${uploadId}`, { ...up, status: 'aborted' });
}

/** Delete a B2-held file's objects (every B2 version). The caller has already checked write access. */
export async function deleteHqB2Objects(paths: string[], deps: Pick<HqB2Deps, 's3' | 'fetch'>): Promise<number> {
  const cfg = deps.s3();
  if (!cfg) throw new HqUploadError('not_configured', 'Storage isn’t set up on this server.', 503);
  let n = 0;
  for (const p of new Set(paths.filter(isB2Path))) { await deleteObjectServer(cfg, b2KeyOf(p), deps.fetch); n++; }
  return n;
}
