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
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DB_ID}/documents`;

function serviceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

// ── OAuth access token (cloud-platform scope) for Firestore REST ─────────────────
let _token: { token: string; exp: number } | null = null;
export async function getAccessToken(): Promise<string | null> {
  const sa = serviceAccount();
  if (!sa) return null;
  if (_token && Date.now() < _token.exp - 120_000) return _token.token;
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

// ── Firebase custom token (SA-signed JWT) — gives a child a real auth session ─────
export function createCustomToken(uid: string, claims?: Record<string, unknown>): string | null {
  const sa = serviceAccount();
  if (!sa) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid,
  };
  if (claims && Object.keys(claims).length) payload.claims = claims;
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`;
  const signer = nodeCrypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(sa.private_key).toString('base64url')}`;
}

// ── Verify a caller's Firebase ID token → uid (identitytoolkit lookup) ────────────
export async function verifyIdToken(idToken: string): Promise<string | null> {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey || !idToken) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.users?.[0]?.localId ?? null;
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

export const adminConfig = { PROJECT_ID, DB_ID, hasServiceAccount: () => !!serviceAccount() };
