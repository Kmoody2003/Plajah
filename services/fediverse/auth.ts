// ─── DecentralizedAuthService ────────────────────────────────────────────────
// SERVER-SIDE ONLY — do not import from browser/React code.
// Uses Node.js crypto for AES-256-GCM credential encryption.
// Handles Mastodon OAuth2 (multi-step, per-instance) and Bluesky App Password
// session creation with in-process refresh token caching.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { bskyCreateSession, bskyRefreshSession } from './bluesky.js';
import { mastodonAdapter } from './mastodon.js';
import type {
  FediverseCredentials, FediverseAccount, FediverseAccountDoc, FediverseProtocol,
} from './types.js';
import { FediverseError } from './types.js';

// ─── Encryption ───────────────────────────────────────────────────────────────
// AES-256-GCM. ENCRYPTION_KEY must be 64 hex chars (32 bytes) in env.
// Wire format: "{iv_hex}:{authTag_hex}:{ciphertext_hex}"

function encKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  if (raw.length < 16) {
    throw new Error('ENCRYPTION_KEY env var must be at least 16 chars (32 hex = 64 chars ideal)');
  }
  return Buffer.from(raw.padEnd(64, '0').slice(0, 64), 'hex');
}

export function encryptCreds(creds: FediverseCredentials): string {
  const key = encKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plain = JSON.stringify(creds);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

export function decryptCreds(raw: string | object): FediverseCredentials {
  // Handle legacy plain-object credentials stored by the browser SDK
  if (typeof raw === 'object' && raw !== null) return raw as FediverseCredentials;

  const str = String(raw);
  // Legacy plain JSON stored before encryption was introduced
  if (!str.includes(':') || str.startsWith('{')) {
    try { return JSON.parse(str); } catch { /* fall through */ }
  }

  const parts = str.split(':');
  if (parts.length < 3) {
    throw new FediverseError('mastodon', 'AUTH_EXPIRED', 'Invalid encrypted credentials format');
  }
  const [ivHex, tagHex, ...rest] = parts;
  const ctHex = rest.join(':');
  const key = encKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8'));
}

// ─── Firestore REST (authenticated) ──────────────────────────────────────────
// Uses the Firebase ID token supplied by the client for all reads/writes.
// Firestore security rules govern access — the server never bypasses them.

const FS_BASE = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents';

async function fsReq(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${FS_BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Firestore ${method} /${path}: ${res.status} — ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function encodeField(v: unknown): unknown {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeField) } };
  if (typeof v === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = encodeField(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function decodeField(v: Record<string, unknown>): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue as string).getTime();
  if ('arrayValue' in v) {
    const arr = (v.arrayValue as Record<string, unknown>);
    return ((arr.values as unknown[]) ?? []).map(i => decodeField(i as Record<string, unknown>));
  }
  if ('mapValue' in v) {
    const map = (v.mapValue as Record<string, unknown>);
    const fields = (map.fields as Record<string, unknown>) ?? {};
    const obj: Record<string, unknown> = {};
    for (const [k, fv] of Object.entries(fields)) {
      obj[k] = decodeField(fv as Record<string, unknown>);
    }
    return obj;
  }
  return null;
}

function decodeDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const fields = (doc.fields as Record<string, unknown>) ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeField(v as Record<string, unknown>);
  }
  return out;
}

async function fsGet(path: string, token: string): Promise<Record<string, unknown> | null> {
  const doc = await fsReq('GET', path, token) as Record<string, unknown> | null;
  return doc ? decodeDoc(doc) : null;
}

async function fsList(path: string, token: string): Promise<Record<string, unknown>[]> {
  const data = await fsReq('GET', path, token) as Record<string, unknown> | null;
  if (!data) return [];
  const docs = (data.documents as Record<string, unknown>[]) ?? [];
  return docs.map(decodeDoc);
}

async function fsSet(path: string, data: Record<string, unknown>, token: string): Promise<void> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = encodeField(v);
  }
  await fsReq('PATCH', path, token, { fields });
}

async function fsDelete(path: string, token: string): Promise<void> {
  const res = await fetch(`${FS_BASE}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore DELETE /${path}: ${res.status}`);
  }
}

// ─── In-process caches ────────────────────────────────────────────────────────

interface MastodonApp {
  clientId: string;
  clientSecret: string;
  instanceUrl: string;
  redirectUri: string;
}

// Mastodon app registrations — performance cache only (not required for correctness)
const mastodonAppCache = new Map<string, MastodonApp>();

// Bluesky session refresh cache keyed by DID
const blueskySessionCache = new Map<string, FediverseCredentials>();

// ─── Encrypted OAuth state token ──────────────────────────────────────────────
// All OAuth state is encoded in an encrypted+authenticated token passed through
// the Mastodon redirect flow. This makes the flow fully stateless — no server-side
// Map is needed, so Cloud Run scale-out (multiple container instances) works correctly.

interface StatePayload {
  instanceUrl: string;
  uid: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  expiresAt: number;
}

function encryptState(payload: StatePayload): string {
  const key = encKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64url');
}

function decryptState(token: string): StatePayload | null {
  try {
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const key = encKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    const payload: StatePayload = JSON.parse(plain.toString('utf8'));
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── DecentralizedAuthService ─────────────────────────────────────────────────

export class DecentralizedAuthService {

  // ── Mastodon OAuth2 ─────────────────────────────────────────────────────────

  /**
   * Register (or retrieve a cached) OAuth2 application on a Mastodon instance.
   * The clientSecret is kept server-side and never sent to the browser.
   */
  async registerMastodonApp(instanceUrl: string, redirectUri: string): Promise<MastodonApp> {
    const base = this.normalizeInstance(instanceUrl);
    const cached = mastodonAppCache.get(base);
    if (cached) return cached;

    const res = await fetch(`${base}/api/v1/apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Plajah Social Mesh',
        redirect_uris: redirectUri,
        scopes: 'read write follow',
        website: process.env.VITE_APP_URL ?? 'https://plajah.com',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
      throw new FediverseError(
        'mastodon', 'API_ERROR',
        `App registration on ${base} failed: ${String(err.error ?? res.statusText)}`,
      );
    }

    const data = await res.json() as { client_id: string; client_secret: string };
    const app: MastodonApp = {
      clientId: data.client_id,
      clientSecret: data.client_secret,
      instanceUrl: base,
      redirectUri,
    };
    mastodonAppCache.set(base, app);
    return app;
  }

  /**
   * Build the Mastodon OAuth2 authorization URL.
   * All OAuth state (including client credentials) is encrypted into the `state`
   * parameter — no server-side Map is required, making the flow stateless across
   * Cloud Run container instances.
   */
  buildMastodonAuthUrl(app: MastodonApp, uid: string): { authUrl: string; state: string } {
    const state = encryptState({
      instanceUrl: app.instanceUrl,
      uid,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      redirectUri: app.redirectUri,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: app.redirectUri,
      response_type: 'code',
      scope: 'read write follow',
      state,
    });

    return {
      authUrl: `${app.instanceUrl}/oauth/authorize?${params}`,
      state,
    };
  }

  /**
   * Decrypt and validate a Mastodon OAuth state token.
   * Returns the full payload (including client credentials) or null if expired/tampered.
   */
  consumeOAuthState(state: string): StatePayload | null {
    return decryptState(state);
  }

  /**
   * Exchange a Mastodon OAuth2 authorization code for an access token.
   * Uses application/x-www-form-urlencoded as required by the OAuth2 spec —
   * Mastodon rejects JSON bodies with "client authentication failed".
   */
  async exchangeMastodonCode(
    instanceUrl: string,
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
  ): Promise<FediverseCredentials> {
    const base = this.normalizeInstance(instanceUrl);

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
      scope: 'read write follow',
    });

    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
      throw new FediverseError('mastodon', 'AUTH_EXPIRED', `Token exchange failed: ${String(err.error_description ?? err.error ?? res.statusText)}`);
    }

    const data = await res.json() as { access_token: string };
    return { accessToken: data.access_token, instanceUrl: base };
  }

  // ── Bluesky Session Management ──────────────────────────────────────────────

  /**
   * Create a new Bluesky session from a handle and App Password.
   * Caches the session in memory for fast subsequent access.
   */
  async createBlueskySession(handle: string, appPassword: string): Promise<FediverseCredentials> {
    const cleanHandle = handle.trim().replace(/^@/, '');
    const creds = await bskyCreateSession(cleanHandle, appPassword);
    if (creds.did) blueskySessionCache.set(creds.did, creds);
    return creds;
  }

  /**
   * Refresh an expired Bluesky session using its refresh JWT.
   * Updates the cache entry automatically.
   */
  async refreshBlueskySession(creds: FediverseCredentials): Promise<FediverseCredentials> {
    const fresh = await bskyRefreshSession(creds);
    if (fresh.did) blueskySessionCache.set(fresh.did, fresh);
    return fresh;
  }

  /**
   * Get a cached Bluesky session by DID, or null if not cached.
   */
  getCachedBlueskySession(did: string): FediverseCredentials | null {
    return blueskySessionCache.get(did) ?? null;
  }

  // ── Credential Encryption ───────────────────────────────────────────────────

  encrypt(creds: FediverseCredentials): string { return encryptCreds(creds); }
  decrypt(raw: string | object): FediverseCredentials { return decryptCreds(raw); }

  // ── Firestore Account Persistence ───────────────────────────────────────────
  // All operations require the user's Firebase ID token for authentication.

  async saveAccount(
    uid: string,
    accountId: string,
    accountData: Omit<FediverseAccountDoc, 'credentials'> & { credentials: FediverseCredentials },
    authToken: string,
  ): Promise<void> {
    const encrypted = this.encrypt(accountData.credentials);
    await fsSet(`users/${uid}/fediverseAccounts/${accountId}`, {
      ...accountData,
      credentials: encrypted,
    }, authToken);
  }

  async loadAccounts(uid: string, authToken: string): Promise<FediverseAccount[]> {
    const docs = await fsList(`users/${uid}/fediverseAccounts`, authToken);
    return docs.flatMap(raw => {
      if (!raw.id) return [];
      const creds = this.safeDecrypt(raw.credentials);
      if (!creds) return [];
      return [{
        id: String(raw.id),
        protocol: raw.protocol as FediverseProtocol,
        handle: String(raw.handle),
        displayName: String(raw.displayName),
        avatarUrl: raw.avatarUrl ? String(raw.avatarUrl) : undefined,
        instanceUrl: raw.instanceUrl ? String(raw.instanceUrl) : undefined,
        credentials: creds,
        connectedAt: Number(raw.connectedAt ?? 0),
        isActive: Boolean(raw.isActive ?? true),
        profileUrl: String(raw.profileUrl ?? ''),
      } satisfies FediverseAccount];
    });
  }

  async loadAccount(uid: string, accountId: string, authToken: string): Promise<FediverseAccount | null> {
    const raw = await fsGet(`users/${uid}/fediverseAccounts/${accountId}`, authToken);
    if (!raw || !raw.id) return null;
    const creds = this.safeDecrypt(raw.credentials);
    if (!creds) return null;
    return {
      id: String(raw.id),
      protocol: raw.protocol as FediverseProtocol,
      handle: String(raw.handle),
      displayName: String(raw.displayName),
      avatarUrl: raw.avatarUrl ? String(raw.avatarUrl) : undefined,
      instanceUrl: raw.instanceUrl ? String(raw.instanceUrl) : undefined,
      credentials: creds,
      connectedAt: Number(raw.connectedAt ?? 0),
      isActive: Boolean(raw.isActive ?? true),
      profileUrl: String(raw.profileUrl ?? ''),
    };
  }

  async removeAccount(uid: string, accountId: string, authToken: string): Promise<void> {
    await fsDelete(`users/${uid}/fediverseAccounts/${accountId}`, authToken);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private normalizeInstance(url: string): string {
    const trimmed = url.trim().replace(/\/$/, '');
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  }

  private safeDecrypt(raw: unknown): FediverseCredentials | null {
    try {
      return this.decrypt(raw as string | object);
    } catch {
      return null;
    }
  }

  /**
   * Create a full FediverseAccount object and persist it, then return
   * the account metadata (no raw credentials) safe to send to the browser.
   */
  async buildAndSaveAccount(
    uid: string,
    protocol: FediverseProtocol,
    creds: FediverseCredentials,
    authToken: string,
  ): Promise<Omit<FediverseAccount, 'credentials'>> {
    const adapters = await import('./service.js').then(m => m.ADAPTERS_MAP);
    const adapter = adapters[protocol];
    const profile = await adapter.verifyCredentials(creds);

    const accountId = uuidv4();
    const accountDoc: FediverseAccountDoc = {
      id: accountId,
      protocol,
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? '',
      instanceUrl: creds.instanceUrl ?? '',
      profileUrl: profile.url,
      credentials: creds,
      connectedAt: Date.now(),
      isActive: true,
    };

    await this.saveAccount(uid, accountId, accountDoc, authToken);

    const { credentials: _creds, ...meta } = accountDoc;
    return meta;
  }
}

export const decentralizedAuth = new DecentralizedAuthService();
