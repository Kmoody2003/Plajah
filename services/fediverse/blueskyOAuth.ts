// ─── Bluesky OAuth (AT Protocol OAuth: PAR + PKCE + DPoP) — SERVER-ONLY ────────
// The successor to app passwords. The user approves Plajah on bsky.social's own consent screen; Plajah never sees
// their password, the grant is scoped (`atproto transition:generic transition:chat.bsky` = posting, graph, and DMs),
// and the user can revoke it from Bluesky at any time.
//
// Shape:
//   • Production is a CONFIDENTIAL client: client_id is the URL of our client-metadata.json, and we authenticate to the
//     token endpoint with a private_key_jwt signed by BSKY_OAUTH_PRIVATE_JWK (an ES256 JWK, kept in Secret Manager).
//     Our public key is served at jwks.json.
//   • Local development uses the spec's LOOPBACK client (client_id = http://localhost?...), so the whole flow can be
//     exercised without a public URL or a key.
//   • Sessions (tokens + the DPoP key that binds them) live in Firestore, AES-256-GCM encrypted with ENCRYPTION_KEY
//     (the same vault as every other fediverse credential). OAuth state is short-lived and stored the same way.
//   • The adapter in bluesky.ts never imports this file; it asks for an Agent through the restorer registered below,
//     so the browser bundle stays free of OAuth code.

import { NodeOAuthClient, buildAtprotoLoopbackClientMetadata } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { Agent } from '@atproto/api';
import { fsGet, fsSet, fsDelete } from '../firebaseAdminRest';
import { encryptCreds, decryptCreds } from './auth';
import { setBlueskyOAuthRestorer } from './bluesky';

export const BSKY_OAUTH_SCOPE = 'atproto transition:generic transition:chat.bsky';
const STATE_TTL_MS = 15 * 60_000;

const appUrl = () => (process.env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, '');
const isLoopback = () => { try { const h = new URL(appUrl()).hostname; return h === 'localhost' || h === '127.0.0.1'; } catch { return false; } };

export const oauthPaths = {
  clientMetadata: '/api/fediverse/bluesky/oauth/client-metadata.json',
  jwks: '/api/fediverse/bluesky/oauth/jwks.json',
  callback: '/api/fediverse/bluesky/oauth/callback',
};

/** Is OAuth usable here? Production needs the signing key; local development (loopback) does not. */
export function blueskyOAuthConfigured(): boolean {
  return isLoopback() || !!process.env.BSKY_OAUTH_PRIVATE_JWK;
}

// ─── Encrypted Firestore stores ───────────────────────────────────────────────

const docId = (key: string) => Buffer.from(key, 'utf8').toString('base64url').slice(0, 400);

function makeStore<V>(collection: string, ttlMs?: number) {
  return {
    async get(key: string): Promise<V | undefined> {
      const row = await fsGet(`${collection}/${docId(key)}`);
      if (!row?.enc) return undefined;
      if (ttlMs && Date.now() - Number(row.at || 0) > ttlMs) { await fsDelete(`${collection}/${docId(key)}`); return undefined; }
      try { return JSON.parse((decryptCreds(String(row.enc)) as any).v) as V; } catch { return undefined; }
    },
    async set(key: string, value: V): Promise<void> {
      await fsSet(`${collection}/${docId(key)}`, { enc: encryptCreds({ v: JSON.stringify(value) } as any), at: Date.now() });
    },
    async del(key: string): Promise<void> { await fsDelete(`${collection}/${docId(key)}`); },
  };
}

// One in-process lock per key so two requests in this instance never refresh the same DPoP session at once
// (refresh tokens are single-use). Across Cloud Run instances this is best-effort — see the note in the memory file.
const locks = new Map<string, Promise<unknown>>();
async function requestLock<T>(name: string, fn: () => T | PromiseLike<T>): Promise<T> {
  const next = (locks.get(name) ?? Promise.resolve()).catch(() => undefined).then(() => fn());
  locks.set(name, next.catch(() => undefined)); // bounded by the number of linked accounts
  return next;
}

// ─── Client ───────────────────────────────────────────────────────────────────

let client: NodeOAuthClient | null = null;

// Resolve handles through bsky.social's XRPC instead of per-handle DNS/HTTPS lookups — more reliable from a server.
const HANDLE_RESOLVER = 'https://bsky.social';

/**
 * The PUBLIC key set Bluesky fetches from jwks.json. Built field-by-field on purpose: in this SDK version both
 * `client.jwks` and `JoseKey.publicJwk` still carry `d` (the private scalar), so serving either would publish the
 * signing key. Only kty/crv/x/y/kid (+ use/alg) ever leave this function.
 */
export function publicJwksFromPrivate(jwk: { kty?: string; crv?: string; x?: string; y?: string; kid?: string }): { keys: Record<string, string>[] } {
  return { keys: [{ kty: String(jwk.kty), crv: String(jwk.crv), x: String(jwk.x), y: String(jwk.y), kid: String(jwk.kid || 'plajah-1'), use: 'sig', alg: 'ES256' }] };
}

let publicJwks: { keys: Record<string, string>[] } | null = null;
/** Public key set for the jwks.json route (never the SDK's own `client.jwks`). */
export async function blueskyPublicJwks(): Promise<{ keys: Record<string, string>[] }> {
  if (!publicJwks) {
    const raw = process.env.BSKY_OAUTH_PRIVATE_JWK;
    if (!raw) return { keys: [] };
    publicJwks = publicJwksFromPrivate(JSON.parse(raw));
  }
  return publicJwks;
}

export async function getBlueskyOAuthClient(): Promise<NodeOAuthClient> {
  if (client) return client;
  const base = appUrl();
  const stateStore = makeStore<any>('bskyOauthState', STATE_TTL_MS);
  const sessionStore = makeStore<any>('bskyOauthSessions');

  if (isLoopback()) {
    const port = new URL(base).port || '3000';
    client = new NodeOAuthClient({
      clientMetadata: buildAtprotoLoopbackClientMetadata({
        scope: BSKY_OAUTH_SCOPE,
        redirect_uris: [`http://127.0.0.1:${port}${oauthPaths.callback}`],
      }),
      stateStore, sessionStore, requestLock, handleResolver: HANDLE_RESOLVER,
    });
    return client;
  }

  const raw = process.env.BSKY_OAUTH_PRIVATE_JWK;
  if (!raw) throw new Error('BSKY_OAUTH_PRIVATE_JWK is not set');
  const jwk = JSON.parse(raw);
  const key = await JoseKey.fromImportable(jwk, jwk.kid || 'plajah-1');
  client = new NodeOAuthClient({
    clientMetadata: {
      client_id: `${base}${oauthPaths.clientMetadata}`,
      client_name: 'Plajah',
      client_uri: base,
      logo_uri: `${base}/plajah-app-icon-512.png`,
      tos_uri: `${base}/policies/terms.html`,
      policy_uri: `${base}/policies/privacy.html`,
      redirect_uris: [`${base}${oauthPaths.callback}`],
      scope: BSKY_OAUTH_SCOPE,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true,
      jwks_uri: `${base}${oauthPaths.jwks}`,
    },
    keyset: [key],
    stateStore, sessionStore, requestLock, handleResolver: HANDLE_RESOLVER,
  });
  return client;
}

/** An authenticated Agent for a stored OAuth session (refreshes tokens as needed). */
export async function blueskyOAuthAgent(did: string): Promise<Agent> {
  const c = await getBlueskyOAuthClient();
  return new Agent(await c.restore(did));
}

/** Revoke the grant at Bluesky and drop our copy. Best effort. */
export async function revokeBlueskyOAuth(did: string): Promise<void> {
  try { await (await getBlueskyOAuthClient()).revoke(did); } catch { /* already gone */ }
  try { await fsDelete(`bskyOauthSessions/${docId(did)}`); } catch { /* ignore */ }
}

// Let the adapter obtain OAuth-backed agents without importing this module.
setBlueskyOAuthRestorer(blueskyOAuthAgent);
