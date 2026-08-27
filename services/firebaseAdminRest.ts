// firebaseAdminRest — server-side Firebase primitives WITHOUT firebase-admin, matching the
// rest of the Plajah backend (server.ts already signs service-account JWTs for OAuth + writes
// Firestore over REST). Side-effect free and reusable so routers can import it.
//
// Provides: a service-account OAuth access token, Firestore REST get/set/create/patch/delete,
// Firebase CUSTOM TOKEN minting (an SA-signed JWT — how child accounts get a real session),
// Firebase ID-token verification, and scrypt password hashing. Requires GOOGLE_SERVICE_ACCOUNT_JSON
// (full SA key JSON) and FIREBASE_API_KEY in the environment, exactly like server.ts.

import nodeCrypto from 'node:crypto';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474';
const DB_ID = process.env.FIREBASE_DB_ID || 'plajah-prod';
const FS_DOC_ROOT = `projects/${PROJECT_ID}/databases/${DB_ID}/documents`;
const FS_BASE = `https://firestore.googleapis.com/v1/${FS_DOC_ROOT}`;

function serviceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

// ── Credentials: a service-account key (env) OR Cloud Run's runtime identity (ADC) ─
// Locally we use GOOGLE_SERVICE_ACCOUNT_JSON. On Cloud Run there's no key file — we use the
// metadata server for access tokens and the IAM signJwt API (as the runtime service account) to
// mint Firebase custom tokens, so no private key is ever stored. Requires the runtime SA to have
// roles/iam.serviceAccountTokenCreator on itself and the IAM Credentials API enabled.
const onManagedPlatform = () => !!(process.env.K_SERVICE || process.env.GAE_SERVICE || process.env.GOOGLE_CLOUD_PROJECT);

async function metadata(path: string): Promise<string | null> {
  try {
    const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/${path}`, { headers: { 'Metadata-Flavor': 'Google' } });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

let _signerEmail: string | null = null;
async function signerEmail(): Promise<string | null> {
  const sa = serviceAccount();
  if (sa) return sa.client_email;
  if (_signerEmail) return _signerEmail;
  _signerEmail = await metadata('email');
  return _signerEmail;
}

// ── OAuth access token (cloud-platform scope) — SA key, else ADC metadata ─────────
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
    } catch { return null; }
  }
  // ADC: Cloud Run runtime service account via the metadata server.
  const raw = await metadata('token');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as any;
    if (!data.access_token) return null;
    _token = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return data.access_token;
  } catch { return null; }
}

// ── Firebase custom token — local SA-key signing, else IAM signJwt (ADC) ──────────
export async function createCustomToken(uid: string, claims?: Record<string, unknown>): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const sa = serviceAccount();
  const email = sa?.client_email || await signerEmail();
  if (!email) return null;
  const payload: Record<string, unknown> = {
    iss: email, sub: email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, uid,
  };
  if (claims && Object.keys(claims).length) payload.claims = claims;

  if (sa) {
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`;
    const signer = nodeCrypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    return `${unsigned}.${signer.sign(sa.private_key).toString('base64url')}`;
  }
  // No key file — have the runtime SA sign the custom-token JWT via the IAM Credentials API.
  const at = await getAccessToken();
  if (!at) return null;
  try {
    const res = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:signJwt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
    });
    if (!res.ok) { console.error('[admin] signJwt failed:', res.status, (await res.text().catch(() => '')).slice(0, 180)); return null; }
    const data = await res.json() as any;
    return data.signedJwt || null;
  } catch (e) { console.error('[admin] signJwt error:', e); return null; }
}

// ── Verify a caller's Firebase ID token → uid (API-key lookup, else public certs) ─
let _certs: { keys: Record<string, string>; exp: number } | null = null;
async function secureTokenCerts(): Promise<Record<string, string>> {
  if (_certs && Date.now() < _certs.exp) return _certs.keys;
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const keys = await res.json() as Record<string, string>;
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  _certs = { keys, exp: Date.now() + (m ? parseInt(m[1], 10) : 3600) * 1000 };
  return keys;
}
export async function verifyIdToken(idToken: string): Promise<string | null> {
  if (!idToken) return null;
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
      });
      if (res.ok) { const data = await res.json() as any; if (data.users?.[0]?.localId) return data.users[0].localId; }
    } catch { /* fall through to cert verification */ }
  }
  // Cert-based verification (no API key needed) — validates signature + standard claims.
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'RS256' || !header.kid) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!(typeof payload.exp === 'number' && payload.exp > now)) return null;
    if (payload.aud !== PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) return null;
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    const cert = (await secureTokenCerts())[header.kid];
    if (!cert) return null;
    const ok = nodeCrypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), cert, Buffer.from(parts[2], 'base64url'));
    return ok ? payload.sub : null;
  } catch { return null; }
}

// ── Firestore REST value (de)serialization ───────────────────────────────────────
function toValue(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
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
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}
function fromFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromValue(v);
  return out;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** Get a document by path (e.g. 'learnerCredentials/maya.r'); null if missing. */
export async function fsGet(path: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`${FS_BASE}/${path}`, { headers: await authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.fields ? fromFields(data.fields) : {};
  } catch { return null; }
}

/** Create-or-replace a document at a known id. Returns success. */
export async function fsSet(path: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${FS_BASE}/${path}`, { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ fields: toFields(data) }) });
    return res.ok;
  } catch { return false; }
}

/** Patch specific fields only (updateMask), leaving others intact. */
export async function fsPatch(path: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const res = await fetch(`${FS_BASE}/${path}?${mask}`, { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ fields: toFields(data) }) });
    return res.ok;
  } catch { return false; }
}

/** Append a doc with an auto id to a collection. Returns new id or null. */
export async function fsCreate(collection: string, data: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`${FS_BASE}/${collection}`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ fields: toFields(data) }) });
    if (!res.ok) return null;
    const json = await res.json() as any;
    return json.name?.split('/').pop() ?? null;
  } catch { return null; }
}

export async function fsDelete(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${FS_BASE}/${path}`, { method: 'DELETE', headers: await authHeaders() });
    return res.ok;
  } catch { return false; }
}

/** Non-transactional bulk create-or-replace, chunked at the API's 500-write cap.
 *  Returns how many docs landed. Unlike fsSet, the doc id travels in the request
 *  BODY as a full resource name, so ids containing `:` (e.g. `detroit:1234.`)
 *  need no URL-path encoding — and per-write failures are logged, not swallowed,
 *  because "saved 0, silently" is exactly the bug class this replaced. */
export async function fsBatchWrite(docs: { path: string; data: Record<string, unknown> }[]): Promise<number> {
  // ⚠️ Firestore's batchWrite REJECTS the whole request (HTTP 400) if it
  // contains two writes to the same document path. A caller that passes
  // duplicate paths would otherwise lose entire 500-doc chunks silently — the
  // exact bug that dropped ~90% of a rental-compliance run. Collapse to the
  // last write per path (idempotent create-or-replace, so last wins).
  if (docs.length) {
    const byPath = new Map<string, { path: string; data: Record<string, unknown> }>();
    for (const d of docs) byPath.set(d.path, d);
    if (byPath.size !== docs.length) docs = [...byPath.values()];
  }
  let ok = 0;
  for (let start = 0; start < docs.length; start += 500) {
    const chunk = docs.slice(start, start + 500);
    try {
      const res = await fetch(`${FS_BASE}:batchWrite`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          writes: chunk.map(d => ({ update: { name: `${FS_DOC_ROOT}/${d.path}`, fields: toFields(d.data) } })),
        }),
      });
      if (!res.ok) {
        console.warn('[fsBatchWrite] HTTP', res.status, (await res.text()).slice(0, 300));
        continue;
      }
      const payload = await res.json() as any;
      const statuses: any[] = Array.isArray(payload?.status) ? payload.status : [];
      // google.rpc.Status serializes OK (code 0) with the code field omitted.
      for (let i = 0; i < chunk.length; i++) if (!statuses[i]?.code) ok++;
      const firstErr = statuses.find(s => s?.code);
      if (firstErr) console.warn('[fsBatchWrite] partial failure:', firstErr.code, firstErr.message);
    } catch (err: any) {
      console.warn('[fsBatchWrite] chunk failed:', err?.message || err);
    }
  }
  return ok;
}

/** List a collection's documents (id + data), following pagination. Server-side only — this
 *  bypasses security rules, so callers must do their own authorization. */
export async function fsList(
  collection: string,
  opts: { pageSize?: number; maxDocs?: number } = {},
): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const pageSize = opts.pageSize ?? 100;
  const maxDocs = opts.maxDocs ?? 1000;
  const out: Array<{ id: string; data: Record<string, any> }> = [];
  let pageToken: string | undefined;
  try {
    do {
      const qs = `pageSize=${pageSize}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await fetch(`${FS_BASE}/${collection}?${qs}`, { headers: await authHeaders() });
      if (!res.ok) break;
      const json = await res.json() as any;
      for (const d of json.documents ?? []) {
        out.push({ id: String(d.name).split('/').pop()!, data: d.fields ? fromFields(d.fields) : {} });
        if (out.length >= maxDocs) return out;
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
  } catch { /* return whatever we got */ }
  return out;
}

// ── Custom auth claims (Identity Toolkit) ────────────────────────────────────────
// Claims are how a server-side decision reaches firestore.rules: the rules can read
// request.auth.token.<claim> but cannot call out. Note the propagation cost — a client keeps
// its old ID token for up to an hour, so callers should force getIdToken(true) after a change.

export async function getCustomClaims(uid: string): Promise<Record<string, unknown>> {
  const at = await getAccessToken();
  if (!at) return {};
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: [uid] }),
    });
    if (!res.ok) return {};
    const data = await res.json() as any;
    const raw = data.users?.[0]?.customAttributes;
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Merge-set custom claims. Reads the existing set first so unrelated claims survive. */
export async function setCustomClaims(uid: string, claims: Record<string, unknown>): Promise<boolean> {
  const at = await getAccessToken();
  if (!at) return false;
  try {
    const merged = { ...(await getCustomClaims(uid)), ...claims };
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(merged) }),
    });
    if (!res.ok) console.error('[admin] setCustomClaims failed:', res.status, (await res.text().catch(() => '')).slice(0, 180));
    return res.ok;
  } catch (e) { console.error('[admin] setCustomClaims error:', e); return false; }
}

// ── Password hashing (scrypt — built-in, no dependency) ──────────────────────────
export function hashPassword(password: string): string {
  const salt = nodeCrypto.randomBytes(16);
  const derived = nodeCrypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const derived = nodeCrypto.scryptSync(password, salt, expected.length);
    return derived.length === expected.length && nodeCrypto.timingSafeEqual(derived, expected);
  } catch { return false; }
}

export const adminConfig = {
  PROJECT_ID, DB_ID,
  hasServiceAccount: () => !!serviceAccount(),                       // literal SA key (needed by the local seeder)
  hasCredentials: () => !!serviceAccount() || onManagedPlatform(),  // SA key OR Cloud Run ADC (for the API endpoints)
};
