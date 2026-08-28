/**
 * Story worker — self-contained helpers. Deliberately imports NOTHING from the main app:
 * this service ships as its own image (see Dockerfile) and must never grow a dependency on
 * server.ts. Patterns mirror server.ts / services/firebaseAdminRest.ts:
 *   - auth: GOOGLE_SERVICE_ACCOUNT_JSON key (local) OR the Cloud Run metadata server (deployed)
 *   - Firestore over REST with an updateMask (merge semantics)
 *   - GCS upload over the JSON API
 *   - ffmpeg/ffprobe via child_process.spawn with captured stderr + wall-clock kill
 */
import nodeCrypto from 'node:crypto';
import { spawn } from 'node:child_process';

// ── Identity / project ────────────────────────────────────────────────────────

export const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';

// Same defaults as services/firebaseAdminRest.ts — the Firestore database is the NON-default
// 'plajah-prod' database; writing to '(default)' would land in a database nothing reads.
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474';
const DB_ID = process.env.FIREBASE_DB_ID || 'plajah-prod';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DB_ID}/documents`;

function serviceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** OAuth access token (cloud-platform scope): SA key when provided, else Cloud Run metadata. */
let _token: { token: string; exp: number } | null = null;
export async function getAccessToken(): Promise<string | null> {
  if (_token && Date.now() < _token.exp - 120_000) return _token.token;
  const sa = serviceAccount();
  if (sa) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now, exp: now + 3600,
      }))}`;
      const signer = nodeCrypto.createSign('RSA-SHA256');
      signer.update(unsigned);
      const jwt = `${unsigned}.${signer.sign(sa.private_key).toString('base64url')}`;
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      });
      const data = await res.json() as any;
      if (!data.access_token) return null;
      _token = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
      return _token.token;
    } catch (e: any) {
      console.error('[auth] SA token mint failed:', e?.message || e);
      return null;
    }
  }
  // Cloud Run: the metadata server hands out tokens for the runtime service account.
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data.access_token) return null;
    _token = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return _token.token;
  } catch { return null; }
}

// ── Firestore REST (merge writes; INTEGERS ONLY — the REST layer must never emit a
//    doubleValue, and undefined must be dropped, or the write 400s / poisons the doc) ─

function toValue(v: unknown): any {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  // NO floats: every number is rounded to an integerValue. Money travels as integer
  // microdollars, timestamps as ms, percentages as whole numbers — by construction.
  if (typeof v === 'number') return { integerValue: String(Math.round(v)) };
  if (Array.isArray(v)) return { arrayValue: { values: v.filter(x => x !== undefined).map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  return { stringValue: String(v) };
}

function toFields(obj: Record<string, unknown>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = toValue(v);
  return out;
}

function fromValue(v: any): any {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) {
    const out: Record<string, any> = {};
    for (const [k, mv] of Object.entries(v.mapValue.fields || {})) out[k] = fromValue(mv);
    return out;
  }
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

/** Merge-patch specific fields on a doc (creates it if absent), like fsPatch in the main app. */
export async function firestorePatch(path: string, fields: Record<string, unknown>): Promise<boolean> {
  try {
    const mask = Object.keys(fields).filter(k => fields[k] !== undefined)
      .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const token = await getAccessToken();
    const res = await fetch(`${FS_BASE}/${path}?${mask}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ fields: toFields(fields) }),
    });
    if (!res.ok) console.error(`[firestore] patch ${path} failed: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res.ok;
  } catch (e: any) {
    console.error(`[firestore] patch ${path} threw:`, e?.message || e);
    return false;
  }
}

/** Read a doc (nested maps/arrays included); null if missing/unreadable. */
export async function firestoreGet(path: string): Promise<Record<string, any> | null> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${FS_BASE}/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(json.fields || {})) out[k] = fromValue(v);
    return out;
  } catch { return null; }
}

// ── Cloud Storage upload (Firebase default bucket) ────────────────────────────

export async function storageUpload(bucketPath: string, buf: Buffer, contentType: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) { console.error('[gcs] no access token — upload skipped:', bucketPath); return false; }
  try {
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(bucketPath)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      body: buf as any,
    });
    if (!res.ok) console.error(`[gcs] upload ${bucketPath} failed: HTTP ${res.status}`);
    return res.ok;
  } catch (e: any) {
    console.error(`[gcs] upload ${bucketPath} threw:`, e?.message || e);
    return false;
  }
}

// ── ffmpeg / ffprobe ──────────────────────────────────────────────────────────

/**
 * Run ffmpeg; capture stderr with a configurable cap (shot detection via showinfo needs the
 * WHOLE stderr — the main app's 6KB tail cap would drop most boundaries of a feature film).
 */
export function runFfmpeg(
  args: string[], timeoutMs = 10 * 60 * 1000, stderrCap = 8_000,
): Promise<{ ok: boolean; err: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    let ff: ReturnType<typeof spawn>;
    try { ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e: any) { return resolve({ ok: false, err: `spawn failed: ${e?.message || e}` }); }
    ff.stderr?.on('data', (d) => { stderr += d.toString(); if (stderr.length > stderrCap) stderr = stderr.slice(-stderrCap); });
    const killer = setTimeout(() => { stderr += '\n[timeout — killed]'; try { ff.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    ff.on('error', (e: any) => { clearTimeout(killer); resolve({ ok: false, err: `${stderr}\nerror: ${e?.message || e}` }); });
    ff.on('close', (code) => { clearTimeout(killer); resolve({ ok: code === 0, err: code === 0 ? stderr : `${stderr}\n[exit ${code}]` }); });
  });
}

export function runFfprobe(input: string, timeoutMs = 60_000): Promise<{ ok: boolean; json: any; err: string }> {
  return new Promise((resolve) => {
    let out = ''; let err = '';
    let ff: ReturnType<typeof spawn>;
    try {
      ff = spawn('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', input], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) { return resolve({ ok: false, json: null, err: `spawn failed: ${e?.message || e}` }); }
    ff.stdout?.on('data', (d) => { out += d.toString(); });
    ff.stderr?.on('data', (d) => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
    const killer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    ff.on('error', (e: any) => { clearTimeout(killer); resolve({ ok: false, json: null, err: `${err}\n${e?.message || e}` }); });
    ff.on('close', (code) => {
      clearTimeout(killer);
      let json: any = null;
      try { json = JSON.parse(out); } catch { /* */ }
      resolve({ ok: code === 0 && !!json, json, err });
    });
  });
}

// ── misc ──────────────────────────────────────────────────────────────────────

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function secretsEqual(provided: unknown, expected: unknown): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
}
