// appCheckFetch — attach a Firebase App Check token to same-origin /api calls.
//
// Installed ONCE at startup (services/firebase.ts, browser only). It wraps window.fetch so
// that every request whose URL resolves to THIS origin with a path under /api/ gets an
// `X-Firebase-AppCheck` header — no per-call-site changes needed across the codebase.
//
// Guarantees:
//   • never blocks or fails a request: if App Check is unavailable, slow (>0.8 s) or errors,
//     the request goes out without the header (server is in monitor mode by default);
//   • never touches cross-origin requests (tokens must not leak to third parties);
//   • never overrides a header a caller set explicitly;
//   • uses getToken(appCheck, false) — the SDK's cached token, refreshed automatically.

type TokenFn = () => Promise<string | null>;

// The SDK persists its token (IndexedDB) and refreshes it in the background, so after the very
// first attestation getToken resolves almost instantly; this cap only bounds the first visit.
const TOKEN_WAIT_MS = 800;
let installed = false;

function sameOriginApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin && u.pathname.startsWith('/api/');
  } catch { return false; }
}

// Circuit breaker: if App Check can't produce a token (ad-blocker blocking reCAPTCHA, offline,
// provider misconfigured) we stop waiting for it for a minute — requests go out immediately
// without the header while a background attempt keeps trying. A broken attestation provider
// must never add latency to every API call.
const BREAKER_MS = 60_000;
let brokenUntil = 0;
let lastGood: { token: string; at: number } | null = null;

async function tokenWithin(getToken: TokenFn, ms: number): Promise<string | null> {
  const attempt = getToken().then(t => {
    if (t) { lastGood = { token: t, at: Date.now() }; brokenUntil = 0; }
    else brokenUntil = Date.now() + BREAKER_MS;
    return t;
  }).catch(() => { brokenUntil = Date.now() + BREAKER_MS; return null; });
  if (Date.now() < brokenUntil) {
    // Don't wait; use a recent token if we still have one (tokens live ~1 h; reuse ≤ 30 min).
    return lastGood && Date.now() - lastGood.at < 30 * 60_000 ? lastGood.token : null;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      attempt,
      new Promise<null>(resolve => { timer = setTimeout(() => { brokenUntil = Date.now() + BREAKER_MS; resolve(null); }, ms); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export function installAppCheckFetch(getToken: TokenFn): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);

  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string;
    try {
      url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    } catch { return original(input as any, init); }
    if (!url || !sameOriginApi(url)) return original(input as any, init);

    const token = await tokenWithin(getToken, TOKEN_WAIT_MS);
    if (!token) return original(input as any, init);

    try {
      if (typeof input !== 'string' && !(input instanceof URL)) {
        // A Request object: copy its headers, then let init (if any) override as fetch would.
        const req = input as Request;
        const headers = new Headers(init?.headers ?? req.headers);
        if (!headers.has('X-Firebase-AppCheck')) headers.set('X-Firebase-AppCheck', token);
        return original(new Request(req, { ...init, headers }));
      }
      const headers = new Headers(init?.headers);
      if (!headers.has('X-Firebase-AppCheck')) headers.set('X-Firebase-AppCheck', token);
      return original(input as any, { ...init, headers });
    } catch {
      return original(input as any, init);
    }
  };
  try {
    (wrapped as any).__plajahAppCheck = true;
    window.fetch = wrapped as typeof window.fetch;
  } catch { /* frozen fetch (rare) — monitor mode simply sees 'missing' */ }
}
