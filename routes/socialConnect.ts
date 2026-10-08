// socialConnect router — the connect + publish backbone for the Marketing Kit's commercial networks
// (Meta: Facebook Pages + Instagram, X, LinkedIn). The publish adapters live in services/socialNetworks;
// this file is what was missing: OAuth connect, a per-user encrypted account store, token refresh, and a
// fan-out that both the Studio ("Post now") and the scheduled-post cron call.
//
// Same shape as routes/postman.ts: service-account Firestore REST (no firebase-admin), OAuth state in
// Firestore (single-use nonce — Cloud Run autoscales), and tokens NEVER returned to the client. Account docs
// live at users/{uid}/socialAccounts/{id} with credentials AES-256-GCM encrypted (ENCRYPTION_KEY, same vault
// as the fediverse accounts). No client rule exists for that subcollection on purpose: default-deny keeps the
// browser out; only this server (service account) touches it.
//
// Mounted in server.ts as:  app.use('/api/social', express.json({ limit: '1mb' }), socialConnectRouter)
//
//   GET    /api/social/status                  — public; { meta, x, linkedin } → configured booleans
//   GET    /api/social/accounts                — caller's connected accounts (no credentials)
//   GET    /api/social/connect/:provider/url   — begin OAuth (provider: meta | x | linkedin) → { url }
//   GET    /api/social/callback/:provider      — PUBLIC browser redirect; popup closer (postMessage)
//   DELETE /api/social/accounts/:id            — disconnect
//   POST   /api/social/publish                 — { accountIds, text, mediaUrls?, linkUri?, title? } → per-account results

import { Router, Request, Response } from 'express';
import nodeCrypto from 'node:crypto';
import {
  verifyIdToken, fsGet, fsSet, fsPatch, fsDelete, fsList, adminConfig,
} from '../services/firebaseAdminRest';
import { encryptCreds, decryptCreds } from '../services/fediverse/auth';
import { publishToNetwork } from '../services/socialNetworks/registry';
import { SocialPublishError, type SocialCredentials, type PublishPayload } from '../services/socialNetworks/types';
import type { SuiteNetwork } from '../services/managerSuite/networks';

export const socialConnectRouter = Router();

type Provider = 'meta' | 'x' | 'linkedin';
const PROVIDERS: Provider[] = ['meta', 'x', 'linkedin'];
const STATE_TTL_MS = 10 * 60 * 1000;
const GRAPH = 'https://graph.facebook.com/v21.0';

/** The public shape of a connected account — no credentials, ever. */
export interface SocialAccountPublic {
  id: string;
  network: SuiteNetwork;
  provider: Provider;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl?: string;
  connectedAt: number;
  status: 'ok' | 'reauth';
}

// ─── Config ───────────────────────────────────────────────────────────────────

const env = (...names: string[]) => names.map(n => process.env[n]).find(Boolean) || '';
const cfg = {
  meta: () => ({ id: env('META_APP_ID'), secret: env('META_APP_SECRET') }),
  x: () => ({ id: env('X_CLIENT_ID', 'TWITTER_CLIENT_ID'), secret: env('X_CLIENT_SECRET', 'TWITTER_CLIENT_SECRET') }),
  linkedin: () => ({ id: env('LINKEDIN_CLIENT_ID'), secret: env('LINKEDIN_CLIENT_SECRET') }),
};
const configured = (p: Provider) => { const c = cfg[p](); return !!(c.id && c.secret); };

// Meta scopes are overridable: a new Meta app only offers the permissions its "use case" enables, and an
// unavailable scope makes the whole dialog error. In Development mode these all work for the app's own
// admins/testers without App Review — which is how this lights up today on Kenne's own pages.
const META_SCOPES = env('META_SCOPES') ||
  'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';

function publicBase(req: Request): string {
  return (process.env.VITE_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
const redirectUri = (req: Request, p: Provider) => `${publicBase(req)}/api/social/callback/${p}`;

// ─── Firestore paths ──────────────────────────────────────────────────────────

const ACCOUNTS = (uid: string) => `users/${uid}/socialAccounts`;
const ACCOUNT = (uid: string, id: string) => `${ACCOUNTS(uid)}/${id}`;
const STATE = (nonce: string) => `socialOauthStates/${nonce}`;
const isSafeId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id);
const isProvider = (p: unknown): p is Provider => PROVIDERS.includes(p as Provider);

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

const toPublic = (id: string, d: Record<string, any>): SocialAccountPublic => ({
  id,
  network: d.network,
  provider: d.provider,
  handle: String(d.handle || ''),
  displayName: String(d.displayName || d.handle || ''),
  ...(d.avatarUrl ? { avatarUrl: String(d.avatarUrl) } : {}),
  ...(d.profileUrl ? { profileUrl: String(d.profileUrl) } : {}),
  connectedAt: Number(d.connectedAt) || 0,
  status: d.status === 'reauth' || (d.expiresAt && d.provider === 'linkedin' && Number(d.expiresAt) < Date.now()) ? 'reauth' : 'ok',
});

async function saveAccount(uid: string, a: {
  id: string; network: SuiteNetwork; provider: Provider; handle: string; displayName: string;
  avatarUrl?: string; profileUrl?: string; creds: SocialCredentials;
}): Promise<boolean> {
  const { creds, ...meta } = a;
  const defined = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)); // Firestore rejects undefined
  return fsSet(ACCOUNT(uid, a.id), {
    ...defined,
    creds: encryptCreds(creds as any),
    expiresAt: creds.expiresAt ?? 0,
    connectedAt: Date.now(),
    status: 'ok',
  });
}

// ─── Popup closer ─────────────────────────────────────────────────────────────

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function callbackPage(p: { ok: boolean; provider?: string; count?: number; error?: string }): string {
  const title = p.ok ? 'Connected' : 'Connection failed';
  const detail = p.ok ? `${p.count ?? 1} account${(p.count ?? 1) === 1 ? '' : 's'} linked to Plajah.` : (p.error || 'Something went wrong.');
  const msg = JSON.stringify({ type: 'plajah-social-connect', ...p }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020202;color:#fff;font-family:Inter,system-ui,sans-serif}
.c{max-width:360px;padding:32px;text-align:center}h1{font-size:19px;margin:0 0 10px}p{margin:0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.62)}.h{margin-top:20px;font-size:12px;color:rgba(255,255,255,.35)}</style></head>
<body><div class="c"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><div class="h">${p.ok ? 'You can close this window.' : 'Close this window and try again.'}</div></div>
<script>(function(){var m=${msg};try{if(window.opener&&!window.opener.closed){window.opener.postMessage(m,window.location.origin)}}catch(e){}
if(m.ok){setTimeout(function(){try{window.close()}catch(e){}},1200)}})();</script></body></html>`;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

async function postForm(url: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await r.json().catch(() => ({})) as Record<string, any>;
  return { ok: r.ok, json };
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  const json = await r.json().catch(() => ({})) as Record<string, any>;
  return { ok: r.ok, json };
}

/** X access tokens last ~2h; refresh when <5 min left. Refresh tokens rotate, so persist the new pair. */
async function freshCreds(uid: string, id: string, doc: Record<string, any>): Promise<SocialCredentials> {
  let creds = decryptCreds(doc.creds) as unknown as SocialCredentials;
  if (doc.provider === 'x' && creds.refreshToken && creds.expiresAt && creds.expiresAt - Date.now() < 5 * 60_000) {
    const c = cfg.x();
    const t = await postForm('https://api.twitter.com/2/oauth2/token',
      { grant_type: 'refresh_token', refresh_token: creds.refreshToken, client_id: c.id },
      { Authorization: basic(c.id, c.secret) });
    if (!t.ok || !t.json.access_token) {
      await fsPatch(ACCOUNT(uid, id), { status: 'reauth' });
      throw new SocialPublishError('x', 'AUTH_EXPIRED', 'X session expired — reconnect');
    }
    creds = {
      ...creds,
      accessToken: t.json.access_token,
      refreshToken: t.json.refresh_token || creds.refreshToken,
      expiresAt: Date.now() + (Number(t.json.expires_in) || 7200) * 1000,
    };
    await fsPatch(ACCOUNT(uid, id), { creds: encryptCreds(creds as any), expiresAt: creds.expiresAt });
  }
  return creds;
}

// ─── Publish fan-out (also imported by the cron publisher in server.ts) ───────

export interface SocialPublishOutcome {
  succeeded: { accountId: string; network: SuiteNetwork; postUrl: string }[];
  failed: { accountId: string; network: string; error: string }[];
}

export async function publishToSocialAccounts(uid: string, accountIds: string[], payload: PublishPayload): Promise<SocialPublishOutcome> {
  const out: SocialPublishOutcome = { succeeded: [], failed: [] };
  await Promise.all(accountIds.filter(isSafeId).map(async (id) => {
    const doc = await fsGet(ACCOUNT(uid, id));
    if (!doc?.creds) { out.failed.push({ accountId: id, network: 'unknown', error: 'Account not connected' }); return; }
    const network = doc.network as SuiteNetwork;
    try {
      const creds = await freshCreds(uid, id, doc);
      const r = await publishToNetwork(network, creds, payload);
      out.succeeded.push({ accountId: id, network, postUrl: r.url });
    } catch (e: any) {
      if (e instanceof SocialPublishError && e.code === 'AUTH_EXPIRED') await fsPatch(ACCOUNT(uid, id), { status: 'reauth' }).catch(() => {});
      out.failed.push({ accountId: id, network, error: String(e?.message || e).slice(0, 300) });
    }
  }));
  return out;
}

/** Which of these ids are social (not fediverse) accounts for this user? Used by the cron to split targets. */
export async function socialAccountIds(uid: string, ids: string[]): Promise<string[]> {
  const rows = await fsList(ACCOUNTS(uid), { maxDocs: 200 });
  const have = new Set(rows.map(r => r.id));
  return ids.filter(i => have.has(i));
}

// ─── GET /status ──────────────────────────────────────────────────────────────
socialConnectRouter.get('/status', (_req, res) => {
  res.json({ meta: configured('meta'), x: configured('x'), linkedin: configured('linkedin') });
});

// ─── GET /accounts ────────────────────────────────────────────────────────────
socialConnectRouter.get('/accounts', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const rows = await fsList(ACCOUNTS(uid), { maxDocs: 200 });
    res.json({ accounts: rows.map(r => toPublic(r.id, r.data)) });
  } catch (e) {
    console.error('[social] accounts failed:', e);
    res.status(500).json({ error: 'Could not load your accounts.' });
  }
});

// ─── GET /connect/:provider/url ───────────────────────────────────────────────
socialConnectRouter.get('/connect/:provider/url', async (req, res) => {
  try {
    const provider = req.params.provider;
    if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown network.' });
    if (!configured(provider)) {
      const names = { meta: 'META_APP_ID and META_APP_SECRET', x: 'X_CLIENT_ID and X_CLIENT_SECRET', linkedin: 'LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET' }[provider];
      return res.status(503).json({ configured: false, error: `Not set up on this server yet. Add ${names}.` });
    }
    if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Connections are temporarily unavailable.' });
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in to connect an account.' });

    const nonce = nodeCrypto.randomBytes(24).toString('base64url');
    const verifier = nodeCrypto.randomBytes(48).toString('base64url');
    const stored = await fsSet(STATE(nonce), { uid, provider, verifier, createdAt: Date.now() });
    if (!stored) return res.status(503).json({ error: 'Could not start the connection. Try again.' });

    const redirect = redirectUri(req, provider);
    let url: string;
    if (provider === 'meta') {
      // Facebook Login for Business replaces `scope` with a saved configuration (config_id) and
      // rejects scope; classic Facebook Login is the reverse. META_LOGIN_CONFIG_ID picks the former.
      const configId = env('META_LOGIN_CONFIG_ID');
      url = `https://www.facebook.com/v21.0/dialog/oauth?${new URLSearchParams(configId
        ? { client_id: cfg.meta().id, redirect_uri: redirect, state: nonce, config_id: configId, response_type: 'code', override_default_response_type: 'true' }
        : { client_id: cfg.meta().id, redirect_uri: redirect, state: nonce, scope: META_SCOPES, response_type: 'code' })}`;
    } else if (provider === 'x') {
      const challenge = nodeCrypto.createHash('sha256').update(verifier).digest('base64url');
      url = `https://twitter.com/i/oauth2/authorize?${new URLSearchParams({
        response_type: 'code', client_id: cfg.x().id, redirect_uri: redirect,
        scope: 'tweet.read tweet.write users.read offline.access media.write',
        state: nonce, code_challenge: challenge, code_challenge_method: 'S256',
      })}`;
    } else {
      url = `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
        response_type: 'code', client_id: cfg.linkedin().id, redirect_uri: redirect,
        scope: 'openid profile w_member_social', state: nonce,
      })}`;
    }
    res.json({ url });
  } catch (e) {
    console.error('[social] connect url failed:', e);
    res.status(500).json({ error: 'Could not start the connection.' });
  }
});

// ─── GET /callback/:provider ──────────────────────────────────────────────────
// PUBLIC by design (browser redirect, no ID token). The single-use Firestore nonce binds the code to a uid.
socialConnectRouter.get('/callback/:provider', async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const fail = (error: string) => res.status(200).type('html').send(callbackPage({ ok: false, provider, error }));
  try {
    if (!isProvider(provider)) return fail('Unknown network.');
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
    if (error) return fail(error === 'access_denied' || error === 'user_cancelled_login' ? 'You cancelled the connection.' : String(error_description || error));
    if (!code || !state) return fail('No authorization code was returned.');
    if (!configured(provider)) return fail('This network is not set up on the server yet.');

    const st = await fsGet(STATE(String(state)));
    await fsDelete(STATE(String(state))); // single use
    if (!st?.uid || st.provider !== provider) return fail('This connection link is no longer valid. Try again.');
    if (Date.now() - (Number(st.createdAt) || 0) > STATE_TTL_MS) return fail('This connection link expired. Try again.');
    const uid = String(st.uid);
    const redirect = redirectUri(req, provider);
    let saved = 0;

    if (provider === 'meta') {
      const c = cfg.meta();
      const short = await getJson(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: c.id, client_secret: c.secret, redirect_uri: redirect, code })}`);
      if (!short.ok || !short.json.access_token) return fail(short.json?.error?.message || 'Meta refused the connection.');
      // Long-lived user token → page tokens derived from it do not expire.
      const long = await getJson(`${GRAPH}/oauth/access_token?${new URLSearchParams({
        grant_type: 'fb_exchange_token', client_id: c.id, client_secret: c.secret, fb_exchange_token: short.json.access_token,
      })}`);
      const userToken = long.json.access_token || short.json.access_token;
      const pages = await getJson(`${GRAPH}/me/accounts?${new URLSearchParams({
        fields: 'id,name,access_token,link,picture{url},instagram_business_account{id,username,profile_picture_url}',
        limit: '100', access_token: userToken,
      })}`);
      if (!pages.ok) return fail(pages.json?.error?.message || 'Could not list your Facebook Pages.');
      const list: any[] = pages.json.data || [];
      if (!list.length) return fail('No Facebook Pages found on that login. Meta publishing works through Pages (and the Instagram accounts linked to them).');
      for (const pg of list) {
        if (!pg.access_token) continue;
        if (await saveAccount(uid, {
          id: `facebook_${pg.id}`, network: 'facebook', provider: 'meta',
          handle: pg.name, displayName: pg.name, avatarUrl: pg.picture?.data?.url,
          profileUrl: pg.link || `https://www.facebook.com/${pg.id}`,
          creds: { accessToken: pg.access_token, pageId: pg.id },
        })) saved++;
        const ig = pg.instagram_business_account;
        if (ig?.id && await saveAccount(uid, {
          id: `instagram_${ig.id}`, network: 'instagram', provider: 'meta',
          handle: `@${ig.username || ig.id}`, displayName: ig.username || pg.name, avatarUrl: ig.profile_picture_url,
          profileUrl: ig.username ? `https://www.instagram.com/${ig.username}/` : undefined,
          creds: { accessToken: pg.access_token, igUserId: ig.id, pageId: pg.id },
        })) saved++;
      }
    } else if (provider === 'x') {
      const c = cfg.x();
      const t = await postForm('https://api.twitter.com/2/oauth2/token',
        { code, grant_type: 'authorization_code', client_id: c.id, redirect_uri: redirect, code_verifier: String(st.verifier) },
        { Authorization: basic(c.id, c.secret) });
      if (!t.ok || !t.json.access_token) return fail(t.json.error_description || 'X refused the connection.');
      const me = await getJson('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name', { Authorization: `Bearer ${t.json.access_token}` });
      const u = me.json.data;
      if (!u?.id) return fail('Could not read your X profile.');
      if (await saveAccount(uid, {
        id: `x_${u.id}`, network: 'x', provider: 'x',
        handle: `@${u.username}`, displayName: u.name || u.username, avatarUrl: u.profile_image_url,
        profileUrl: `https://x.com/${u.username}`,
        creds: {
          accessToken: t.json.access_token, refreshToken: t.json.refresh_token,
          expiresAt: Date.now() + (Number(t.json.expires_in) || 7200) * 1000, userId: u.username,
        },
      })) saved++;
    } else {
      const c = cfg.linkedin();
      const t = await postForm('https://www.linkedin.com/oauth/v2/accessToken',
        { grant_type: 'authorization_code', code, client_id: c.id, client_secret: c.secret, redirect_uri: redirect });
      if (!t.ok || !t.json.access_token) return fail(t.json.error_description || 'LinkedIn refused the connection.');
      const me = await getJson('https://api.linkedin.com/v2/userinfo', { Authorization: `Bearer ${t.json.access_token}` });
      if (!me.json.sub) return fail('Could not read your LinkedIn profile.');
      if (await saveAccount(uid, {
        id: `linkedin_${me.json.sub}`, network: 'linkedin', provider: 'linkedin',
        handle: me.json.name || 'LinkedIn', displayName: me.json.name || 'LinkedIn', avatarUrl: me.json.picture,
        creds: {
          accessToken: t.json.access_token,
          expiresAt: Date.now() + (Number(t.json.expires_in) || 5_184_000) * 1000,
          authorUrn: `urn:li:person:${me.json.sub}`,
        },
      })) saved++;
    }

    if (!saved) return fail('Could not save the connected account. Please try again.');
    res.status(200).type('html').send(callbackPage({ ok: true, provider, count: saved }));
  } catch (e) {
    console.error('[social] callback failed:', e);
    fail('Something went wrong connecting this account.');
  }
});

// ─── DELETE /accounts/:id ─────────────────────────────────────────────────────
socialConnectRouter.delete('/accounts/:id', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    if (!isSafeId(req.params.id)) return res.status(400).json({ error: 'Unknown account.' });
    await fsDelete(ACCOUNT(uid, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('[social] disconnect failed:', e);
    res.status(500).json({ error: 'Could not disconnect that account.' });
  }
});

// ─── POST /publish ────────────────────────────────────────────────────────────
socialConnectRouter.post('/publish', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const { accountIds, text, mediaUrls, linkUri, title } = req.body || {};
    if (!Array.isArray(accountIds) || !accountIds.length || accountIds.length > 25) return res.status(400).json({ error: 'accountIds required (max 25).' });
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required.' });
    const payload: PublishPayload = {
      text: text.slice(0, 5000),
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls.filter((u: unknown) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4) : [],
      linkUri: typeof linkUri === 'string' && /^https?:\/\//.test(linkUri) ? linkUri : undefined,
      title: typeof title === 'string' ? title.slice(0, 200) : undefined,
    };
    res.json(await publishToSocialAccounts(uid, accountIds.map(String), payload));
  } catch (e) {
    console.error('[social] publish failed:', e);
    res.status(500).json({ error: 'Publish failed.' });
  }
});
