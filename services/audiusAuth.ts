// "Log in with Audius" — OAuth 2.0 Authorization Code flow with PKCE.
//
// This is the real flow (verified against the Audius SDK source + live endpoints), not the
// stub that used to live in audiusService.ts:
//
//   1. GET  https://api.audius.co/v1/oauth/authorize?scope=…&api_key=…&redirect_uri=…
//           &state=…&origin=…&response_mode=query&response_type=code
//           &code_challenge=…&code_challenge_method=S256&display=popup
//      (302s to the audius.co consent screen)
//   2. Audius redirects the popup to OUR redirect_uri with ?code&state. A tiny inline script
//      at the top of index.html postMessages {code,state} back to the opener and closes.
//   3. POST https://api.audius.co/v1/oauth/token
//           {grant_type:'authorization_code', code, code_verifier, client_id, redirect_uri}
//        → {access_token, refresh_token, expires_in, refresh_expires_in}
//   4. GET  https://api.audius.co/v1/me  (Bearer)  → the connected Audius profile.
//
// PKCE means NO client secret is needed, so the whole flow is safe to run in the browser.
// `read` scope only needs app_name/api_key; `write` REQUIRES the api_key.
//
// SETUP (one-time, on the Audius developer dashboard): the redirect URI below must be
// registered on the Plajah developer app, or Audius rejects the authorize request. See
// docs/AUDIUS_OUTREACH_AND_INTEGRATION.md § "Developer app setup".

import { auth, updateUserProfile } from './backendService';

export const AUDIUS_API_BASE = 'https://api.audius.co/v1';

/** Public app identifier (an app address, not a secret). Overridable per-environment. */
export const AUDIUS_API_KEY =
  (import.meta as any).env?.VITE_AUDIUS_API_KEY || '9504e71d3b7450c321850ca4451aff09e72d6b01';

const SESSION_KEY = 'plajah_audius_session';
const CSRF_KEY = 'plajah_audius_state';
const VERIFIER_KEY = 'plajah_audius_verifier';
const REDIRECT_KEY = 'plajah_audius_redirect';
const SCOPE_KEY = 'plajah_audius_scope';

/** Fired on the window whenever the connection is established or cleared. */
export const AUDIUS_SESSION_EVENT = 'audius:session-changed';

export type AudiusScope = 'read' | 'write';

export interface AudiusSession {
  userId: string;          // encoded Audius user id (e.g. "eJ57D")
  handle: string;
  name: string;
  profilePicture?: string;
  verified: boolean;
  scope: AudiusScope;
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt?: number;
  refreshExpiresAt?: number;
  connectedAt: number;
}

export function audiusRedirectUri(): string {
  return `${window.location.origin}/audius/callback`;
}

// ─── Session storage ──────────────────────────────────────────────────────────

export function getAudiusSession(): AudiusSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AudiusSession;
    return s?.userId ? s : null;
  } catch { return null; }
}

function setAudiusSession(s: AudiusSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(AUDIUS_SESSION_EVENT, { detail: s }));
}

/** Mirror the connection onto the Plajah profile so it survives a new device / reinstall.
 *  Tokens stay device-local (localStorage) — only the public identity is persisted. */
async function persistToProfile(s: AudiusSession | null) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await updateUserProfile(uid, {
      audiusAccount: s
        ? {
            userId: s.userId,
            handle: s.handle,
            name: s.name,
            profilePicture: s.profilePicture ?? '',
            verified: s.verified,
            connectedAt: s.connectedAt,
          }
        : null,
    } as any);
  } catch (err) {
    console.error('[Audius] Failed to persist connection to profile:', err);
  }
}

// ─── PKCE ─────────────────────────────────────────────────────────────────────

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomUrlSafe(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function stashPkce(state: string, verifier: string, redirectUri: string, scope: AudiusScope) {
  try {
    sessionStorage.setItem(CSRF_KEY, state);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(REDIRECT_KEY, redirectUri);
    // The scope has to survive a full-page redirect too, or a popup-blocked `write` login
    // would come back recorded as read-only and the publish flow would ask again forever.
    sessionStorage.setItem(SCOPE_KEY, scope);
  } catch { /* ignore */ }
}

function readPkce() {
  try {
    return {
      state: sessionStorage.getItem(CSRF_KEY),
      verifier: sessionStorage.getItem(VERIFIER_KEY),
      redirectUri: sessionStorage.getItem(REDIRECT_KEY),
      scope: (sessionStorage.getItem(SCOPE_KEY) as AudiusScope | null),
    };
  } catch { return { state: null, verifier: null, redirectUri: null, scope: null }; }
}

function clearPkce() {
  try {
    [CSRF_KEY, VERIFIER_KEY, REDIRECT_KEY, SCOPE_KEY].forEach(k => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

async function buildAuthorizeUrl(scope: AudiusScope, redirectUri: string, display: 'popup' | 'fullScreen') {
  const state = randomUrlSafe(24);
  const verifier = randomUrlSafe(48);
  const challenge = await codeChallengeFor(verifier);
  stashPkce(state, verifier, redirectUri, scope);
  const params = new URLSearchParams({
    scope,
    state,
    redirect_uri: redirectUri,
    origin: window.location.origin,
    // `query` (not the `fragment` default) so the callback works even if a host strips hashes.
    response_mode: 'query',
    api_key: AUDIUS_API_KEY,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    display,
  });
  return { url: `${AUDIUS_API_BASE}/oauth/authorize?${params}`, state };
}

// ─── Token exchange ───────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}

async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(`${AUDIUS_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: AUDIUS_API_KEY,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    // The overwhelmingly likely first-run failure: the redirect URI isn't registered
    // on the Audius developer app. Say so instead of a bare OAuth error code.
    const hint = /redirect/i.test(err.error_description ?? err.error ?? '')
      ? ` — register "${redirectUri}" as a redirect URI on the Plajah app at audius.co (Settings → Developer Apps).`
      : '';
    throw new Error((err.error_description ?? err.error ?? 'Audius token exchange failed') + hint);
  }
  return res.json();
}

function sessionFromTokens(tokens: TokenResponse, me: any, scope: AudiusScope): AudiusSession {
  const now = Date.now();
  return {
    userId: me?.id ?? '',
    handle: me?.handle ?? '',
    name: me?.name ?? me?.handle ?? 'Audius user',
    profilePicture: me?.profile_picture?.['480x480'] ?? me?.profile_picture?.['150x150'] ?? undefined,
    verified: !!me?.is_verified,
    scope,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: tokens.expires_in ? now + tokens.expires_in * 1000 : undefined,
    refreshExpiresAt: tokens.refresh_expires_in ? now + tokens.refresh_expires_in * 1000 : undefined,
    connectedAt: now,
  };
}

async function fetchAudiusMe(accessToken: string): Promise<any> {
  const res = await fetch(`${AUDIUS_API_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Could not read your Audius profile (${res.status}).`);
  const json = await res.json();
  return json?.data ?? json;
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Opens the Audius consent screen and resolves with the connected session.
 * Uses a popup on desktop; falls back to a full-page redirect when the popup is blocked
 * (common in the Capacitor WebView) — in that case the promise never resolves because the
 * page navigates away, and `completeAudiusRedirect()` finishes the job on the way back.
 */
export async function loginWithAudius(opts: { scope?: AudiusScope } = {}): Promise<AudiusSession> {
  const scope: AudiusScope = opts.scope ?? 'read';
  const redirectUri = audiusRedirectUri();
  const { url, state } = await buildAuthorizeUrl(scope, redirectUri, 'popup');

  const popup = window.open(
    url, 'audius_oauth',
    'toolbar=no,location=no,menubar=no,scrollbars=yes,width=420,height=760,top=80,left=120',
  );

  if (!popup) {
    // Popup blocked — do it as a full-page redirect instead.
    window.location.href = url;
    return new Promise<AudiusSession>(() => { /* navigating away */ });
  }

  return new Promise<AudiusSession>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closedTimer);
      try { if (!popup.closed) popup.close(); } catch { /* ignore */ }
      clearPkce();
      fn();
    };

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data: any = e.data;
      if (!data || data.source !== 'plajah-audius-oauth') return;
      if (data.error) { finish(() => reject(new Error(data.error_description || data.error))); return; }
      if (!data.code || !data.state) return;
      if (data.state !== state) { finish(() => reject(new Error('Audius login state mismatch — please try again.'))); return; }

      const { verifier } = readPkce();
      if (!verifier) { finish(() => reject(new Error('Audius login state was lost. Please try again.'))); return; }
      try {
        const tokens = await exchangeCode(data.code, verifier, redirectUri);
        const me = await fetchAudiusMe(tokens.access_token);
        const session = sessionFromTokens(tokens, me, scope);
        setAudiusSession(session);
        void persistToProfile(session);
        finish(() => resolve(session));
      } catch (err: any) {
        finish(() => reject(err instanceof Error ? err : new Error('Audius login failed.')));
      }
    };

    window.addEventListener('message', onMessage);
    const closedTimer = setInterval(() => {
      if (popup.closed) finish(() => reject(new Error('The Audius login window was closed.')));
    }, 500);
  });
}

/**
 * Completes a FULL-PAGE Audius redirect (popup-blocked / native path). Call once on app
 * mount. No-op unless the current URL carries an OAuth `code`+`state` for us.
 * Returns the session if one was established.
 */
export async function completeAudiusRedirect(): Promise<AudiusSession | null> {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = q.get('code') ?? h.get('code');
  const state = q.get('state') ?? h.get('state');
  if (!code || !state) return null;

  const { state: expected, verifier, redirectUri, scope } = readPkce();
  if (!expected || !verifier) return null;          // not our redirect — leave other flows alone
  if (expected !== state) { clearPkce(); return null; }

  clearPkce();
  // Strip the OAuth params so a refresh/bookmark can't replay them.
  try {
    const clean = new URL(window.location.href);
    ['code', 'state', 'origin', 'error', 'error_description'].forEach(k => clean.searchParams.delete(k));
    clean.hash = '';
    window.history.replaceState(null, '', clean.pathname === '/audius/callback' ? '/' : clean.toString());
  } catch { /* best effort */ }

  try {
    const tokens = await exchangeCode(code, verifier, redirectUri ?? audiusRedirectUri());
    const me = await fetchAudiusMe(tokens.access_token);
    const session = sessionFromTokens(tokens, me, scope ?? 'read');
    setAudiusSession(session);
    void persistToProfile(session);
    return session;
  } catch (err) {
    console.error('[Audius] redirect login failed:', err);
    return null;
  }
}

// ─── Token lifecycle ──────────────────────────────────────────────────────────

async function refreshAudiusToken(session: AudiusSession): Promise<AudiusSession | null> {
  if (!session.refreshToken) return null;
  try {
    const res = await fetch(`${AUDIUS_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
        client_id: AUDIUS_API_KEY,
      }),
    });
    if (!res.ok) return null;
    const tokens: TokenResponse = await res.json();
    if (!tokens.access_token) return null;
    const now = Date.now();
    const next: AudiusSession = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: tokens.expires_in ? now + tokens.expires_in * 1000 : undefined,
      refreshExpiresAt: tokens.refresh_expires_in ? now + tokens.refresh_expires_in * 1000 : undefined,
    };
    setAudiusSession(next);
    return next;
  } catch { return null; }
}

/** A usable access token, refreshing silently when the current one has expired. */
export async function getAudiusAccessToken(): Promise<string | null> {
  const session = getAudiusSession();
  if (!session) return null;
  if (session.accessExpiresAt && Date.now() >= session.accessExpiresAt - 30_000) {
    const refreshed = await refreshAudiusToken(session);
    return refreshed?.accessToken ?? null;
  }
  return session.accessToken;
}

/** Disconnect: revoke server-side (best effort per RFC 7009) and clear everything locally. */
export async function logoutAudius(): Promise<void> {
  const session = getAudiusSession();
  if (session?.refreshToken) {
    try {
      await fetch(`${AUDIUS_API_BASE}/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: session.refreshToken, client_id: AUDIUS_API_KEY }),
      });
    } catch { /* revocation errors are non-fatal */ }
  }
  clearPkce();
  setAudiusSession(null);
  void persistToProfile(null);
}
