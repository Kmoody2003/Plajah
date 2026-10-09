/**
 * safetyServerIo — SERVER-ONLY Firestore + Cloud Storage plumbing for the content-safety pipeline.
 *
 * Uses the same service-account access token as the rest of the backend (services/firebaseAdminRest),
 * so every call here BYPASSES firestore.rules / storage.rules. Callers authorise for themselves.
 * Never import this from client code.
 */
import { getAccessToken, fsGet, fsPatch, adminConfig } from '../firebaseAdminRest';

export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const FS_DOC_ROOT = `projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents`;
const FS_BASE = `https://firestore.googleapis.com/v1/${FS_DOC_ROOT}`;
const GCS = 'https://storage.googleapis.com/storage/v1';

export { fsGet, fsPatch };

// ── Firestore value codec (undefined dropped — Firestore rejects it) ──────────

function toValue(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.filter(x => x !== undefined).map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  return { stringValue: String(v) };
}
export function toFields(o: Record<string, unknown>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = toValue(v);
  return out;
}
function fromValue(v: any): any {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}
export function fromFields(f: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(f || {})) out[k] = fromValue(v);
  return out;
}

async function authHeaders(json = true): Promise<Record<string, string>> {
  const t = await getAccessToken();
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

/** Create a doc only if absent. 'exists' on 409. */
export async function fsCreateOnce(collection: string, id: string, data: Record<string, unknown>): Promise<'created' | 'exists' | 'error'> {
  try {
    const res = await fetch(`${FS_BASE}/${collection}?documentId=${encodeURIComponent(id)}`, {
      method: 'POST', headers: await authHeaders(), body: JSON.stringify({ fields: toFields(data) }),
    });
    if (res.ok) return 'created';
    if (res.status === 409) return 'exists';
    console.error(`[safety] createOnce ${collection}/${id} HTTP ${res.status}`);
    return 'error';
  } catch { return 'error'; }
}

/** Merge-patch (updateMask) with deep values; logs failures. */
export async function fsMerge(path: string, data: Record<string, unknown>): Promise<boolean> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) clean[k] = v;
  const ok = await fsPatch(path, clean);
  if (!ok) console.error(`[safety] patch ${path} failed`);
  return ok;
}

export interface QueryFilter { field: string; op: 'EQUAL' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN' | 'GREATER_THAN'; value: unknown }

/** Single-collection structured query. One range filter + orderBy on the same field needs no composite index. */
export async function fsQuery(
  collection: string,
  opts: { where?: QueryFilter[]; orderBy?: { field: string; direction: 'ASCENDING' | 'DESCENDING' }; limit?: number },
): Promise<Array<{ id: string; path: string; data: Record<string, any> }>> {
  const filters = (opts.where || []).map(f => ({ fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: toValue(f.value) } }));
  const structuredQuery: any = { from: [{ collectionId: collection }], limit: opts.limit ?? 100 };
  if (filters.length === 1) structuredQuery.where = filters[0];
  else if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters } };
  if (opts.orderBy) structuredQuery.orderBy = [{ field: { fieldPath: opts.orderBy.field }, direction: opts.orderBy.direction }];
  try {
    const res = await fetch(`${FS_BASE}:runQuery`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ structuredQuery }) });
    if (!res.ok) { console.error(`[safety] query ${collection} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); return []; }
    const rows = await res.json() as any[];
    return rows.filter(r => r.document).map(r => {
      const name = String(r.document.name);
      return { id: name.split('/').pop()!, path: name.slice(name.indexOf('/documents/') + 11), data: fromFields(r.document.fields || {}) };
    });
  } catch { return []; }
}

/** Page through a collection by document id (for the rotating avatar sweep). */
export async function fsListPage(collection: string, pageSize: number, pageToken?: string): Promise<{ docs: Array<{ id: string; data: Record<string, any> }>; next: string | null }> {
  try {
    const qs = `pageSize=${pageSize}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}&mask.fieldPaths=photoURL&mask.fieldPaths=avatarScannedUrl&mask.fieldPaths=avatarModerationStatus`;
    const res = await fetch(`${FS_BASE}/${collection}?${qs}`, { headers: await authHeaders() });
    if (!res.ok) return { docs: [], next: null };
    const json = await res.json() as any;
    return {
      docs: (json.documents || []).map((d: any) => ({ id: String(d.name).split('/').pop()!, data: fromFields(d.fields || {}) })),
      next: json.nextPageToken || null,
    };
  } catch { return { docs: [], next: null }; }
}

// ── Cloud Storage ─────────────────────────────────────────────────────────────

/**
 * Map a media URL to an object path in OUR bucket, or null if it lives elsewhere.
 * Handles firebasestorage.googleapis.com/v0/b/{bucket}/o/{enc}?alt=media&token=… and
 * storage.googleapis.com/{bucket}/{path} (and the JSON API form).
 */
export function storagePathFromUrl(url: string, bucket = STORAGE_BUCKET): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname === 'firebasestorage.googleapis.com') {
    const m = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(u.pathname);
    return m && m[1] === bucket ? decodeURIComponent(m[2]) : null;
  }
  if (u.hostname === 'storage.googleapis.com') {
    const api = /^\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/.exec(u.pathname);
    if (api) return api[1] === bucket ? decodeURIComponent(api[2]) : null;
    const m = /^\/([^/]+)\/(.+)$/.exec(u.pathname);
    return m && m[1] === bucket ? decodeURIComponent(m[2]) : null;
  }
  if (u.hostname === `${bucket}.storage.googleapis.com`) return decodeURIComponent(u.pathname.slice(1)) || null;
  return null;
}

export interface GcsObjectMeta { name: string; size: number; contentType: string | null; md5Hash: string | null; metadata: Record<string, string> }

export async function gcsMeta(objectPath: string): Promise<GcsObjectMeta | null> {
  try {
    const res = await fetch(`${GCS}/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`, { headers: await authHeaders(false) });
    if (!res.ok) return null;
    const j = await res.json() as any;
    return { name: j.name, size: Number(j.size) || 0, contentType: j.contentType || null, md5Hash: j.md5Hash || null, metadata: j.metadata || {} };
  } catch { return null; }
}

export async function gcsDownload(objectPath: string, maxBytes: number): Promise<{ bytes: Buffer; contentType: string | null } | null> {
  const meta = await gcsMeta(objectPath);
  if (!meta || meta.size > maxBytes) return null;
  try {
    const res = await fetch(`${GCS}/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`, { headers: await authHeaders(false) });
    if (!res.ok) return null;
    return { bytes: Buffer.from(await res.arrayBuffer()), contentType: meta.contentType };
  } catch { return null; }
}

/** Server-side copy (rewrite loops until done). */
export async function gcsCopy(src: string, dst: string): Promise<boolean> {
  try {
    let token: string | undefined;
    for (let i = 0; i < 20; i++) {
      const url = `${GCS}/b/${STORAGE_BUCKET}/o/${encodeURIComponent(src)}/rewriteTo/b/${STORAGE_BUCKET}/o/${encodeURIComponent(dst)}${token ? `?rewriteToken=${encodeURIComponent(token)}` : ''}`;
      const res = await fetch(url, { method: 'POST', headers: await authHeaders(), body: '{}' });
      if (!res.ok) { console.error(`[safety] gcs rewrite HTTP ${res.status}`); return false; }
      const j = await res.json() as any;
      if (j.done) return true;
      token = j.rewriteToken;
    }
    return false;
  } catch { return false; }
}

/**
 * Lock an object: remove the Firebase download token (kills every ?token= URL) and set a
 * temporary hold (the object cannot be deleted or overwritten until the hold is released).
 */
export async function gcsLock(objectPath: string, extraMetadata: Record<string, string> = {}): Promise<boolean> {
  try {
    const res = await fetch(`${GCS}/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`, {
      method: 'PATCH', headers: await authHeaders(),
      body: JSON.stringify({ temporaryHold: true, metadata: { firebaseStorageDownloadTokens: null, ...extraMetadata } }),
    });
    if (!res.ok) console.error(`[safety] gcs lock HTTP ${res.status}`);
    return res.ok;
  } catch { return false; }
}

export async function gcsDelete(objectPath: string): Promise<boolean> {
  try {
    const res = await fetch(`${GCS}/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`, { method: 'DELETE', headers: await authHeaders(false) });
    return res.ok || res.status === 404;
  } catch { return false; }
}

/** Remove only the download token (soft-remove: the object stays, public URLs stop working). */
export async function gcsRevokeToken(objectPath: string): Promise<boolean> {
  try {
    const res = await fetch(`${GCS}/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`, {
      method: 'PATCH', headers: await authHeaders(),
      body: JSON.stringify({ metadata: { firebaseStorageDownloadTokens: null } }),
    });
    return res.ok;
  } catch { return false; }
}
