// blueskyOAuth router — "Sign in with Bluesky" (AT Protocol OAuth) for the fediverse mesh.
// Mounted in server.ts at /api/fediverse/bluesky/oauth.
//
//   GET /status                — public; { configured }
//   GET /client-metadata.json  — public; the OAuth client metadata Bluesky fetches (its URL IS our client_id)
//   GET /jwks.json             — public; the public half of our client-auth key
//   GET /start?handle=         — Bearer; begins the flow → { url } for the popup
//   GET /callback              — public browser redirect from Bluesky; stores the linked account, closes the popup
//
// The Firebase uid is bound to the flow by a single-use nonce passed as the OAuth `state`, so the public callback
// knows whose account to attach — the same pattern as routes/socialConnect.ts and routes/postman.ts.

import { Router, Request, Response } from 'express';
import nodeCrypto from 'node:crypto';
import { Agent } from '@atproto/api';
import { verifyIdToken, fsGet, fsSet, fsDelete, adminConfig } from '../services/firebaseAdminRest';
import { encryptCreds } from '../services/fediverse/auth';
import { getBlueskyOAuthClient, blueskyPublicJwks, blueskyOAuthConfigured, BSKY_OAUTH_SCOPE } from '../services/fediverse/blueskyOAuth';

export const blueskyOAuthRouter = Router();

const PENDING = (n: string) => `bskyOauthPending/${n}`;
const PENDING_TTL_MS = 15 * 60_000;
const ENTRYWAY = 'https://bsky.social';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function page(p: { ok: boolean; error?: string; handle?: string }): string {
  const title = p.ok ? 'Bluesky connected' : 'Connection failed';
  const detail = p.ok ? `${p.handle || 'Your account'} is linked to Plajah.` : (p.error || 'Something went wrong.');
  const msg = JSON.stringify({ type: 'plajah-bsky-oauth', ...p }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020202;color:#fff;font-family:Inter,system-ui,sans-serif}
.c{max-width:360px;padding:32px;text-align:center}h1{font-size:19px;margin:0 0 10px}p{margin:0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.62)}.h{margin-top:20px;font-size:12px;color:rgba(255,255,255,.35)}</style></head>
<body><div class="c"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><div class="h">${p.ok ? 'You can close this window.' : 'Close this window and try again.'}</div></div>
<script>(function(){var m=${msg};try{if(window.opener&&!window.opener.closed){window.opener.postMessage(m,window.location.origin)}}catch(e){}
if(m.ok){setTimeout(function(){try{window.close()}catch(e){}},1200)}})();</script></body></html>`;
}

blueskyOAuthRouter.get('/status', (_req, res) => res.json({ configured: blueskyOAuthConfigured() }));

blueskyOAuthRouter.get('/client-metadata.json', async (_req, res) => {
  try { res.json((await getBlueskyOAuthClient()).clientMetadata); }
  catch { res.status(503).json({ error: 'Bluesky OAuth is not configured' }); }
});

// NEVER serve the SDK's `client.jwks` here: it includes the private scalar `d`. blueskyPublicJwks() is public fields only.
blueskyOAuthRouter.get('/jwks.json', async (_req, res) => {
  try {
    const jwks = await blueskyPublicJwks();
    if (!jwks.keys.length) return res.status(503).json({ error: 'Bluesky OAuth is not configured' });
    res.json(jwks);
  } catch { res.status(503).json({ error: 'Bluesky OAuth is not configured' }); }
});

blueskyOAuthRouter.get('/start', async (req: Request, res: Response) => {
  try {
    if (!blueskyOAuthConfigured()) return res.status(503).json({ configured: false, error: 'Sign in with Bluesky is not set up on this server yet.' });
    if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Connections are temporarily unavailable.' });
    const authz = req.headers.authorization;
    const uid = authz?.startsWith('Bearer ') ? await verifyIdToken(authz.slice(7)) : null;
    if (!uid) return res.status(401).json({ error: 'Sign in to connect Bluesky.' });

    // A handle, a DID, or nothing (= pick the account on bsky.social's own sign-in screen).
    const raw = String(req.query.handle ?? '').trim().replace(/^@/, '').toLowerCase();
    if (raw && !/^did:[a-z]+:[\w.:%-]{1,200}$/.test(raw) && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(raw)) {
      return res.status(400).json({ error: 'Enter your Bluesky handle, like name.bsky.social.' });
    }

    const nonce = nodeCrypto.randomBytes(24).toString('base64url');
    if (!(await fsSet(PENDING(nonce), { uid, createdAt: Date.now() }))) return res.status(503).json({ error: 'Could not start the connection. Try again.' });

    const client = await getBlueskyOAuthClient();
    const url = await client.authorize(raw || ENTRYWAY, { scope: BSKY_OAUTH_SCOPE, state: nonce });
    res.json({ url: url.toString() });
  } catch (e: any) {
    console.error('[bsky-oauth] start failed:', e?.message || e);
    res.status(502).json({ error: /resolve|handle|not found/i.test(String(e?.message)) ? 'Could not find that Bluesky account.' : 'Could not reach Bluesky. Try again.' });
  }
});

blueskyOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const fail = (error: string) => res.status(200).type('html').send(page({ ok: false, error }));
  try {
    const q = req.query as Record<string, string | undefined>;
    if (q.error) return fail(q.error === 'access_denied' ? 'You cancelled the Bluesky sign-in.' : String(q.error_description || q.error));

    const client = await getBlueskyOAuthClient();
    const { session, state } = await client.callback(new URLSearchParams(req.url.split('?')[1] ?? ''));

    const pending = state ? await fsGet(PENDING(state)) : null;
    if (state) await fsDelete(PENDING(state)); // single use
    if (!pending?.uid || Date.now() - Number(pending.createdAt || 0) > PENDING_TTL_MS) {
      return fail('This connection link expired. Try connecting again.');
    }
    const uid = String(pending.uid);

    const profile = (await new Agent(session).getProfile({ actor: session.did })).data;
    // Deterministic id so reconnecting the same Bluesky account replaces it instead of duplicating it.
    const id = `bsky-${nodeCrypto.createHash('sha256').update(session.did).digest('hex').slice(0, 24)}`;
    const saved = await fsSet(`users/${uid}/fediverseAccounts/${id}`, {
      id, protocol: 'bluesky', handle: profile.handle, displayName: profile.displayName || profile.handle,
      avatarUrl: profile.avatar ?? '', instanceUrl: '', profileUrl: `https://bsky.app/profile/${profile.handle}`,
      // No tokens here: the OAuth session (and its DPoP key) lives in bskyOauthSessions, encrypted. This row is the pointer.
      credentials: encryptCreds({ accessToken: '', did: session.did, handle: profile.handle, oauth: true }),
      connectedAt: Date.now(), isActive: true,
    });
    if (!saved) return fail('Could not save this account. Please try again.');
    res.status(200).type('html').send(page({ ok: true, handle: profile.handle }));
  } catch (e: any) {
    console.error('[bsky-oauth] callback failed:', e?.message || e);
    fail('Bluesky could not complete the sign-in. Please try again.');
  }
});
