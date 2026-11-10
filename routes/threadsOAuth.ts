// threadsOAuth router — "Continue with Threads" (Meta Threads OAuth). Mounted at /api/fediverse/threads/oauth.
//
//   GET  /status      — public; { configured }
//   GET  /start       — Bearer; → { url } for the popup
//   GET  /callback    — public browser redirect from threads.net; stores the linked account, closes the popup
//   POST /deauthorize — Meta "Uninstall callback" (signed_request): the user removed Plajah in Threads settings
//   POST /delete      — Meta "Delete callback" (signed_request): data-deletion request → { url, confirmation_code }
//   GET  /deletion-status?code= — public page Meta links people to after a deletion request
//
// Same shape as routes/blueskyOAuth.ts: a single-use nonce in `state` binds the Firebase uid to the flow, and the
// popup reports back via postMessage + BroadcastChannel (Meta's COOP can sever window.opener).
//
// Meta dashboard setup (Use cases → Threads API → Settings):
//   Redirect callback URL  = <API base>/api/fediverse/threads/oauth/callback
//   Uninstall callback URL = <API base>/api/fediverse/threads/oauth/deauthorize
//   Delete callback URL    = <API base>/api/fediverse/threads/oauth/delete

import { Router, type Request, type Response } from 'express';
import express from 'express';
import nodeCrypto from 'node:crypto';
import { verifyIdToken, fsGet, fsSet, fsDelete, adminConfig } from '../services/firebaseAdminRest';
import { encryptCreds } from '../services/fediverse/auth';
import { threadsAppConfig, threadsScopes, threadsExchangeCode, threadsGetMe } from '../services/fediverse/threads';

export const threadsOAuthRouter = Router();

const PENDING = (n: string) => `threadsOauthPending/${n}`;
const INDEX = (threadsUserId: string) => `threadsUserIndex/${threadsUserId}`;
const PENDING_TTL_MS = 15 * 60_000;

/** Where Meta sends the browser back. Must match the dashboard exactly, so it's pinned by env, not the request host. */
export function threadsRedirectUri(): string {
  if (process.env.THREADS_REDIRECT_URI) return process.env.THREADS_REDIRECT_URI.trim();
  const base = (process.env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, ''); // same origin as the app (hosting rewrites /api), like Bluesky
  return `${base}/api/fediverse/threads/oauth/callback`;
}
const configured = () => !!threadsAppConfig();

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function page(p: { ok: boolean; error?: string; handle?: string }): string {
  const title = p.ok ? 'Threads connected' : 'Connection failed';
  const detail = p.ok ? `${p.handle ? `@${p.handle}` : 'Your account'} is linked to Plajah.` : (p.error || 'Something went wrong.');
  const msg = JSON.stringify({ type: 'plajah-threads-oauth', ...p }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020202;color:#fff;font-family:Inter,system-ui,sans-serif}
.c{max-width:360px;padding:32px;text-align:center}h1{font-size:19px;margin:0 0 10px}p{margin:0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.62)}.h{margin-top:20px;font-size:12px;color:rgba(255,255,255,.35)}</style></head>
<body><div class="c"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><div class="h">${p.ok ? 'You can close this window.' : 'Close this window and try again.'}</div></div>
<script>(function(){var m=${msg};try{if(window.opener&&!window.opener.closed){window.opener.postMessage(m,window.location.origin)}}catch(e){}
try{var bc=new BroadcastChannel('plajah-threads-oauth');bc.postMessage(m);setTimeout(function(){bc.close()},500)}catch(e){}
if(m.ok){setTimeout(function(){try{window.close()}catch(e){}},1200)}})();</script></body></html>`;
}

threadsOAuthRouter.get('/status', (_req, res) => res.json({ configured: configured() }));

threadsOAuthRouter.get('/start', async (req: Request, res: Response) => {
  try {
    const cfg = threadsAppConfig();
    if (!cfg) return res.status(503).json({ configured: false, error: 'Continue with Threads is not set up on this server yet.' });
    if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Connections are temporarily unavailable.' });
    const authz = req.headers.authorization;
    const uid = authz?.startsWith('Bearer ') ? await verifyIdToken(authz.slice(7)) : null;
    if (!uid) return res.status(401).json({ error: 'Sign in to connect Threads.' });

    const nonce = nodeCrypto.randomBytes(24).toString('base64url');
    if (!(await fsSet(PENDING(nonce), { uid, createdAt: Date.now() }))) return res.status(503).json({ error: 'Could not start the connection. Try again.' });

    const url = `https://threads.net/oauth/authorize?${new URLSearchParams({
      client_id: cfg.appId, redirect_uri: threadsRedirectUri(), scope: threadsScopes(), response_type: 'code', state: nonce,
    })}`;
    res.json({ url });
  } catch (e: any) {
    console.error('[threads-oauth] start failed:', e?.message || e);
    res.status(502).json({ error: 'Could not reach Threads. Try again.' });
  }
});

threadsOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const fail = (error: string) => res.status(200).type('html').send(page({ ok: false, error }));
  try {
    const q = req.query as Record<string, string | undefined>;
    const state = typeof q.state === 'string' ? q.state : '';
    const pending = state && /^[\w-]{20,64}$/.test(state) ? await fsGet(PENDING(state)) : null;
    if (state) await fsDelete(PENDING(state)).catch(() => false); // single use
    if (q.error) return fail(q.error === 'access_denied' || q.error_reason === 'user_denied' ? 'You cancelled the Threads sign-in.' : String(q.error_description || q.error));
    if (!pending?.uid || Date.now() - Number(pending.createdAt || 0) > PENDING_TTL_MS) return fail('This connection link expired. Try connecting again.');
    // Meta appends "#_" to the code in some clients.
    const code = String(q.code ?? '').replace(/#_$/, '');
    if (!code) return fail('Threads did not return a sign-in code.');
    const uid = String(pending.uid);

    const { userId, creds } = await threadsExchangeCode(code, threadsRedirectUri());
    const me = await threadsGetMe(creds);
    const username = me.handle.replace(/^@/, '');
    const threadsUserId = userId || me.id;
    creds.did = threadsUserId;
    creds.handle = username;

    // Deterministic id so reconnecting the same Threads account replaces it instead of duplicating it.
    const id = `threads-${nodeCrypto.createHash('sha256').update(`threads|${threadsUserId}`).digest('hex').slice(0, 24)}`;
    const saved = await fsSet(`users/${uid}/fediverseAccounts/${id}`, {
      id, protocol: 'threads', handle: me.handle, displayName: me.displayName || username,
      avatarUrl: me.avatarUrl ?? '', instanceUrl: '', profileUrl: me.url,
      credentials: encryptCreds(creds), connectedAt: Date.now(), isActive: true,
    });
    if (!saved) return fail('Could not save this account. Please try again.');
    // Reverse index so Meta's uninstall / delete callbacks (which only carry the Threads user id) can find the row.
    await fsSet(INDEX(threadsUserId), { uid, accountId: id, at: Date.now() }).catch(() => false);
    res.status(200).type('html').send(page({ ok: true, handle: username }));
  } catch (e: any) {
    console.error('[threads-oauth] callback failed:', e?.message || e);
    fail('Threads could not complete the sign-in. Please try again.');
  }
});

// ─── Meta signed_request callbacks ───────────────────────────────────────────

/** Verify a Meta signed_request (HMAC-SHA256 with the app secret) and return its payload. */
export function parseSignedRequest(signed: string, appSecret: string): Record<string, any> | null {
  const [sig, payload] = String(signed || '').split('.', 2);
  if (!sig || !payload) return null;
  const expected = nodeCrypto.createHmac('sha256', appSecret).update(payload).digest();
  const got = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (got.length !== expected.length || !nodeCrypto.timingSafeEqual(got, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return data?.algorithm && String(data.algorithm).toUpperCase() !== 'HMAC-SHA256' ? null : data;
  } catch { return null; }
}

async function unlinkThreadsUser(threadsUserId: string): Promise<boolean> {
  const idx = await fsGet(INDEX(threadsUserId));
  if (!idx?.uid || !idx?.accountId) return false;
  await fsDelete(`users/${idx.uid}/fediverseAccounts/${idx.accountId}`).catch(() => false);
  await fsDelete(INDEX(threadsUserId)).catch(() => false);
  return true;
}

const formBody = express.urlencoded({ extended: false, limit: '16kb' });

threadsOAuthRouter.post('/deauthorize', formBody, async (req: Request, res: Response) => {
  const cfg = threadsAppConfig();
  const data = cfg ? parseSignedRequest(req.body?.signed_request, cfg.appSecret) : null;
  if (!data?.user_id) return res.status(400).json({ error: 'invalid signed_request' });
  await unlinkThreadsUser(String(data.user_id)).catch(() => false);
  res.json({ success: true });
});

threadsOAuthRouter.post('/delete', formBody, async (req: Request, res: Response) => {
  const cfg = threadsAppConfig();
  const data = cfg ? parseSignedRequest(req.body?.signed_request, cfg.appSecret) : null;
  if (!data?.user_id) return res.status(400).json({ error: 'invalid signed_request' });
  // Plajah keeps only the token + profile pointer for a Threads account, so deletion is immediate.
  await unlinkThreadsUser(String(data.user_id)).catch(() => false);
  const code = nodeCrypto.randomBytes(9).toString('hex');
  await fsSet(`threadsDeletions/${code}`, { at: Date.now(), status: 'complete' }).catch(() => false);
  res.json({ url: `${threadsRedirectUri().replace(/\/callback$/, '')}/deletion-status?code=${code}`, confirmation_code: code });
});

threadsOAuthRouter.get('/deletion-status', async (req: Request, res: Response) => {
  const code = String(req.query.code ?? '');
  const row = /^[a-f0-9]{18}$/.test(code) ? await fsGet(`threadsDeletions/${code}`) : null;
  const msg = row ? 'Your Threads data has been removed from Plajah.' : 'We could not find that deletion request.';
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Threads data deletion</title><body style="font-family:system-ui;background:#020202;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center"><div style="max-width:380px;text-align:center"><h1 style="font-size:18px">Threads data deletion</h1><p style="color:#aaa">${escapeHtml(msg)}</p><p style="color:#666;font-size:12px">Confirmation code: ${escapeHtml(code)}</p></div>`);
});
