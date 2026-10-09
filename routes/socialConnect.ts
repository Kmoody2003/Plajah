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
// SCOPES. Every route takes an optional identity scope (scopeKind=BUSINESS|ORG & scopeId=<orgId>; default = the
// caller's own CREATOR scope). A business/org keeps its OWN credential store at orgSocialAccounts/{orgId}/accounts,
// so a team's connections belong to the business, not to whichever employee clicked Connect. Access is checked on
// every call against the org backbone (organizations + orgMemberships):
//   manage  — org creator/admins, or OWNER/ADMIN members: connect + disconnect
//   post    — members holding POST_AS_ORG (STAFF by default): publish through the business's accounts
//   view    — members holding VIEW_ANALYTICS: read analytics
//
// Mounted in server.ts as:  app.use('/api/social', express.json({ limit: '1mb' }), socialConnectRouter)
//
//   GET    /api/social/status                  — public; { meta, x, linkedin } → configured booleans
//   GET    /api/social/accounts                — connected accounts in scope (no credentials)
//   GET    /api/social/connect/:provider/url   — begin OAuth (provider: meta | x | linkedin) → { url }
//   GET    /api/social/callback/:provider      — PUBLIC browser redirect; popup closer (postMessage)
//   DELETE /api/social/accounts/:id            — disconnect
//   POST   /api/social/publish                 — { accountIds, text, mediaUrls?, linkUri?, title? } → per-account results
//   GET    /api/social/analytics               — followers, growth and recent-post engagement per account in scope

import { Router, Request, Response } from 'express';
import nodeCrypto from 'node:crypto';
import {
  verifyIdToken, fsGet, fsSet, fsPatch, fsDelete, fsList, fsCreate, getAccessToken, adminConfig,
} from '../services/firebaseAdminRest';
import { permissionsForMember } from '../services/orgPermissions';
import { fetchAccountInsights, type AccountInsights } from '../services/socialNetworks/insights';
import { encryptCreds, decryptCreds } from '../services/fediverse/auth';
import { publishToNetwork } from '../services/socialNetworks/registry';
import { SocialPublishError, type SocialCredentials, type PublishPayload } from '../services/socialNetworks/types';
import type { SuiteNetwork } from '../services/managerSuite/networks';
import { serverSpamCheck } from '../services/trust/serverSpamGate';
import { recordSecurityEvent } from '../services/securityEvents';

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
// Base = publishing. Extras unlock analytics (read_insights, instagram_manage_insights) and the engagement inbox
// (read + reply to comments). A scope the app's use case doesn't offer makes the dialog error, so set META_SCOPES
// to a shorter list if that happens. With Facebook Login for Business the permissions come from the saved
// configuration instead (META_LOGIN_CONFIG_ID), so add the same ones there.
const META_BASE_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
const META_EXTRA_SCOPES = 'read_insights,instagram_manage_insights,pages_read_user_content,pages_manage_engagement,instagram_manage_comments';
const META_SCOPES = env('META_SCOPES') || `${META_BASE_SCOPES},${META_EXTRA_SCOPES}`;

function publicBase(req: Request): string {
  return (process.env.VITE_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
const redirectUri = (req: Request, p: Provider) => `${publicBase(req)}/api/social/callback/${p}`;

// ─── Firestore paths ──────────────────────────────────────────────────────────

export interface Scope { kind: 'CREATOR' | 'BUSINESS' | 'ORG'; id: string }
export const ACCOUNTS = (s: Scope) => s.kind === 'CREATOR' ? `users/${s.id}/socialAccounts` : `orgSocialAccounts/${s.id}/accounts`;
export const ACCOUNT = (s: Scope, id: string) => `${ACCOUNTS(s)}/${id}`;
/** Per-business publishing settings (server-managed): { requireApproval }. */
export const SETTINGS = (s: Scope) => `orgSocialSettings/${s.id}`;
export async function requiresApproval(s: Scope): Promise<boolean> {
  if (s.kind === 'CREATOR') return false;
  return (await fsGet(SETTINGS(s)))?.requireApproval === true;
}
const STATE = (nonce: string) => `socialOauthStates/${nonce}`;
export const isSafeId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id);
const isProvider = (p: unknown): p is Provider => PROVIDERS.includes(p as Provider);

/** Scope from the request (query or body). Anything unrecognised falls back to the caller's own CREATOR scope. */
export function parseScope(uid: string, kind: unknown, id: unknown): Scope {
  return (kind === 'BUSINESS' || kind === 'ORG') && isSafeId(id) ? { kind, id } : { kind: 'CREATOR', id: uid };
}
export const reqScope = (req: Request, uid: string): Scope => {
  const src: any = { ...(req.query || {}), ...(req.body || {}) };
  return parseScope(uid, src.scopeKind, src.scopeId);
};

export type Access = 'view' | 'post' | 'manage';
const RANK: Record<Access, number> = { view: 1, post: 2, manage: 3 };
export const can = (have: Access | null, need: Access) => !!have && RANK[have] >= RANK[need];

const FS_DOCS = () => `https://firestore.googleapis.com/v1/projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents`;
const decodeStr = (v: any): string | undefined => v?.stringValue;
const decodeStrArr = (v: any): string[] => (v?.arrayValue?.values || []).map((x: any) => x.stringValue).filter(Boolean);

/** The caller's membership row for an org (orgMemberships has random ids, so query by orgId + userId). */
async function membershipFor(uid: string, orgId: string): Promise<{ role?: string; status?: string; permissions: string[] } | null> {
  const at = await getAccessToken();
  if (!at) return null;
  const r = await fetch(`${FS_DOCS()}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'orgMemberships' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'orgId' }, op: 'EQUAL', value: { stringValue: orgId } } },
        { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: uid } } },
      ] } },
      limit: 1,
    } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return null;
  const rows: any[] = await r.json().catch(() => []);
  const f = rows.find(x => x.document)?.document?.fields;
  if (!f) return null;
  return { role: decodeStr(f.role), status: decodeStr(f.status), permissions: decodeStrArr(f.permissions) };
}

/** What this user may do with an identity's social accounts. */
export async function accessFor(uid: string, scope: Scope): Promise<Access | null> {
  if (scope.kind === 'CREATOR') return scope.id === uid ? 'manage' : null;
  const org = await fsGet(`organizations/${scope.id}`);
  if (!org) return null;
  if (org.creatorId === uid || (Array.isArray(org.admins) && org.admins.includes(uid))) return 'manage';
  const m = await membershipFor(uid, scope.id);
  if (!m || m.status !== 'ACTIVE') return null;
  if (m.role === 'OWNER' || m.role === 'ADMIN') return 'manage';
  const perms = permissionsForMember({ role: m.role as any, permissions: m.permissions as any });
  if (perms.has('POST_AS_ORG')) return 'post';
  if (perms.has('VIEW_ANALYTICS')) return 'view';
  return null;
}

/** Org audit trail (organizations/{id}/audit) — best effort, never blocks the action. */
export async function audit(scope: Scope, actorUid: string, action: string, targetName: string, meta?: Record<string, unknown>) {
  if (scope.kind === 'CREATOR') return;
  try {
    await fsCreate(`organizations/${scope.id}/audit`, { orgId: scope.id, actorUid, action, targetName, meta: meta || {}, timestamp: Date.now() });
  } catch { /* auditing must not break the operation */ }
}

export async function callerUid(req: Request): Promise<string | null> {
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

async function saveAccount(scope: Scope, uid: string, a: {
  id: string; network: SuiteNetwork; provider: Provider; handle: string; displayName: string;
  avatarUrl?: string; profileUrl?: string; creds: SocialCredentials;
}): Promise<boolean> {
  const { creds, ...meta } = a;
  const defined = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)); // Firestore rejects undefined
  return fsSet(ACCOUNT(scope, a.id), {
    ...defined,
    remoteId: a.id.slice(a.id.indexOf('_') + 1),
    ownerKind: scope.kind,
    ownerId: scope.id,
    connectedBy: uid,
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
export async function freshCreds(scope: Scope, id: string, doc: Record<string, any>): Promise<SocialCredentials> {
  let creds = decryptCreds(doc.creds) as unknown as SocialCredentials;
  if (doc.provider === 'x' && creds.refreshToken && creds.expiresAt && creds.expiresAt - Date.now() < 5 * 60_000) {
    const c = cfg.x();
    const t = await postForm('https://api.twitter.com/2/oauth2/token',
      { grant_type: 'refresh_token', refresh_token: creds.refreshToken, client_id: c.id },
      { Authorization: basic(c.id, c.secret) });
    if (!t.ok || !t.json.access_token) {
      await fsPatch(ACCOUNT(scope, id), { status: 'reauth' });
      throw new SocialPublishError('x', 'AUTH_EXPIRED', 'X session expired — reconnect');
    }
    creds = {
      ...creds,
      accessToken: t.json.access_token,
      refreshToken: t.json.refresh_token || creds.refreshToken,
      expiresAt: Date.now() + (Number(t.json.expires_in) || 7200) * 1000,
    };
    await fsPatch(ACCOUNT(scope, id), { creds: encryptCreds(creds as any), expiresAt: creds.expiresAt });
  }
  return creds;
}

// ─── Publish fan-out (also imported by the cron publisher in server.ts) ───────

export interface SocialPublishOutcome {
  succeeded: { accountId: string; network: SuiteNetwork; postUrl: string }[];
  failed: { accountId: string; network: string; error: string }[];
}

export async function publishToSocialAccounts(
  uid: string, scope: Scope, accountIds: string[], payload: PublishPayload, opts: { approved?: boolean } = {},
): Promise<SocialPublishOutcome> {
  const out: SocialPublishOutcome = { succeeded: [], failed: [] };
  // Checked here (not just in the route) because the cron calls this directly, possibly long after scheduling:
  // someone removed from a business since they queued a post must not be able to publish as it.
  const access = await accessFor(uid, scope);
  if (!can(access, 'post')) {
    accountIds.forEach(id => out.failed.push({ accountId: id, network: 'unknown', error: 'You no longer have permission to publish to these accounts' }));
    return out;
  }
  // Approval gate. The queue is written by the browser, so this is where "needs approval" is actually enforced:
  // a non-manager's post only goes out if an owner/admin stamped it approved (routes/socialEngage.ts).
  if (access !== 'manage' && !opts.approved && await requiresApproval(scope)) {
    accountIds.forEach(id => out.failed.push({ accountId: id, network: 'unknown', error: 'This business requires approval — submit the post for review' }));
    return out;
  }
  await Promise.all(accountIds.filter(isSafeId).map(async (id) => {
    const doc = await fsGet(ACCOUNT(scope, id));
    if (!doc?.creds) { out.failed.push({ accountId: id, network: 'unknown', error: 'Account not connected' }); return; }
    const network = doc.network as SuiteNetwork;
    try {
      const creds = await freshCreds(scope, id, doc);
      const r = await publishToNetwork(network, creds, payload);
      out.succeeded.push({ accountId: id, network, postUrl: r.url });
    } catch (e: any) {
      if (e instanceof SocialPublishError && e.code === 'AUTH_EXPIRED') await fsPatch(ACCOUNT(scope, id), { status: 'reauth' }).catch(() => {});
      out.failed.push({ accountId: id, network, error: String(e?.message || e).slice(0, 300) });
    }
  }));
  return out;
}

/** Which of these ids are social (not fediverse) accounts for this user? Used by the cron to split targets. */
export async function socialAccountIds(scope: Scope, ids: string[]): Promise<string[]> {
  const rows = await fsList(ACCOUNTS(scope), { maxDocs: 200 });
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
    const scope = reqScope(req, uid);
    const access = await accessFor(uid, scope);
    if (!can(access, 'view')) return res.status(403).json({ error: 'You do not have access to this identity\'s accounts.' });
    const rows = await fsList(ACCOUNTS(scope), { maxDocs: 200 });
    res.json({ accounts: rows.map(r => toPublic(r.id, r.data)), canManage: can(access, 'manage'), canPost: can(access, 'post') });
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
    const scope = reqScope(req, uid);
    if (!can(await accessFor(uid, scope), 'manage')) return res.status(403).json({ error: 'Only the owner or an admin can connect accounts for this identity.' });
    const stored = await fsSet(STATE(nonce), { uid, provider, verifier, scopeKind: scope.kind, scopeId: scope.id, createdAt: Date.now() });
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
  const fail = (error: string) => res.status(200).type('html').send(callbackPage({ ok: false, provider: String(provider), error }));
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
    const scope = parseScope(uid, st.scopeKind, st.scopeId);
    // Re-check: the operator could have lost rights in the minutes since they started the flow.
    if (!can(await accessFor(uid, scope), 'manage')) return fail('You no longer have permission to connect accounts for this identity.');
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
        if (await saveAccount(scope, uid, {
          id: `facebook_${pg.id}`, network: 'facebook', provider: 'meta',
          handle: pg.name, displayName: pg.name, avatarUrl: pg.picture?.data?.url,
          profileUrl: pg.link || `https://www.facebook.com/${pg.id}`,
          creds: { accessToken: pg.access_token, pageId: pg.id },
        })) saved++;
        const ig = pg.instagram_business_account;
        if (ig?.id && await saveAccount(scope, uid, {
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
      if (await saveAccount(scope, uid, {
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
      if (await saveAccount(scope, uid, {
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
    await audit(scope, uid, 'SOCIAL_CONNECTED', provider, { provider, count: saved });
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
    const scope = reqScope(req, uid);
    if (!can(await accessFor(uid, scope), 'manage')) return res.status(403).json({ error: 'Only the owner or an admin can disconnect accounts.' });
    await fsDelete(ACCOUNT(scope, req.params.id));
    // Snapshots are history for an account that no longer exists; drop them with it (best effort).
    try { for (const row of await fsList(`${ACCOUNT(scope, req.params.id)}/snapshots`, { maxDocs: 400 })) await fsDelete(`${ACCOUNT(scope, req.params.id)}/snapshots/${row.id}`); } catch { /* ignore */ }
    await audit(scope, uid, 'SOCIAL_DISCONNECTED', req.params.id);
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
    // Server-side spam gate: protects Plajah's OAuth apps' standing with Meta/X/LinkedIn.
    const spam = serverSpamCheck(text);
    if (spam.block) {
      recordSecurityEvent('spam_blocked_server', { route: '/api/social/publish', uid, detail: spam.reasons.join(',') });
      return res.status(422).json({ error: 'This post looks like spam (repeated characters or duplicate text). Please edit it and try again.', reasons: spam.reasons });
    }
    const payload: PublishPayload = {
      text: text.slice(0, 5000),
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls.filter((u: unknown) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4) : [],
      linkUri: typeof linkUri === 'string' && /^https?:\/\//.test(linkUri) ? linkUri : undefined,
      title: typeof title === 'string' ? title.slice(0, 200) : undefined,
    };
    res.json(await publishToSocialAccounts(uid, reqScope(req, uid), accountIds.map(String), payload));
  } catch (e) {
    console.error('[social] publish failed:', e);
    res.status(500).json({ error: 'Publish failed.' });
  }
});

// ─── GET /analytics ───────────────────────────────────────────────────────────
// Followers, growth and recent-post engagement for every account in scope. Fans out in parallel, serves cached
// results inside each network's TTL (X bills per read), and lazily writes ONE follower snapshot per account per
// day — that is what powers the growth number without a separate cron.
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10).replace(/-/g, '');

socialConnectRouter.get('/analytics', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const scope = reqScope(req, uid);
    if (!can(await accessFor(uid, scope), 'view')) return res.status(403).json({ error: 'You do not have access to this identity\'s analytics.' });
    const force = req.query.force === '1';

    const rows = await fsList(ACCOUNTS(scope), { maxDocs: 100 });
    const today = dayKey();
    const cutoff = dayKey(new Date(Date.now() - 8 * 86_400_000));

    const accounts: AccountInsights[] = await Promise.all(rows.map(async ({ id, data }) => {
      const handle = String(data.handle || '');
      try {
        const creds = await freshCreds(scope, id, data);
        const ins = await fetchAccountInsights(`${scope.kind}:${scope.id}:${id}`, id, String(data.network), handle, creds, String(data.remoteId || id.slice(id.indexOf('_') + 1)), force);
        if (typeof ins.followers === 'number') {
          const snapPath = `${ACCOUNT(scope, id)}/snapshots`;
          const snaps = await fsList(snapPath, { maxDocs: 90 });
          if (!snaps.some(x => x.id === today)) {
            await fsSet(`${snapPath}/${today}`, {
              followers: ins.followers, at: Date.now(),
              ...(typeof ins.reach7d === 'number' ? { reach: ins.reach7d } : {}),
              ...(typeof ins.views7d === 'number' ? { views: ins.views7d } : {}),
            }).catch(() => {});
          }
          // Oldest snapshot inside the last ~8 days (and before today) gives a week-ish delta.
          const baseSnap = snaps.filter(x => x.id >= cutoff && x.id < today).sort((a, b) => a.id.localeCompare(b.id))[0];
          if (baseSnap && typeof baseSnap.data.followers === 'number') {
            const days = Math.max(1, Math.round((Date.now() - Number(baseSnap.data.at || Date.now())) / 86_400_000));
            ins.growth = { delta: ins.followers - baseSnap.data.followers, days };
          }
          // Trend line: stored days + today's live reading, oldest → newest, last 30.
          const hist = snaps.filter(x => x.id !== today).sort((a, b) => a.id.localeCompare(b.id)).slice(-29).map(x => ({
            day: `${x.id.slice(0, 4)}-${x.id.slice(4, 6)}-${x.id.slice(6, 8)}`,
            followers: typeof x.data.followers === 'number' ? x.data.followers : undefined,
            reach: typeof x.data.reach === 'number' ? x.data.reach : undefined,
            views: typeof x.data.views === 'number' ? x.data.views : undefined,
          }));
          hist.push({ day: new Date().toISOString().slice(0, 10), followers: ins.followers, reach: ins.reach7d, views: ins.views7d });
          ins.history = hist;
        }
        return ins;
      } catch (e: any) {
        return { accountId: id, network: String(data.network), handle, recent: [], totals: { likes: 0, comments: 0, shares: 0, views: 0, reach: 0 }, fetchedAt: Date.now(), error: String(e?.message || e).slice(0, 200) } as AccountInsights;
      }
    }));

    // Bluesky / Mastodon / Threads are user-level credentials (fediverse vault), so they only report for the
    // caller's own CREATOR scope. Counts only — those adapters don't expose per-post engagement for own posts.
    if (scope.kind === 'CREATOR') {
      try {
        const auth = req.headers.authorization as string;
        const { decentralizedAuth } = await import('../services/fediverse/auth');
        const { ADAPTERS_MAP } = await import('../services/fediverse/service');
        const fedi = await decentralizedAuth.loadAccounts(uid, auth.slice(7));
        await Promise.all(fedi.filter(a => a.isActive).map(async (a) => {
          const entry: AccountInsights = { accountId: a.id, network: a.protocol, handle: a.handle, recent: [], totals: { likes: 0, comments: 0, shares: 0, views: 0, reach: 0 }, fetchedAt: Date.now() };
          try {
            const prof = await ADAPTERS_MAP[a.protocol].verifyCredentials(a.credentials);
            entry.followers = prof.followersCount; entry.following = prof.followingCount; entry.postCount = prof.postsCount;
          } catch (e: any) { entry.error = String(e?.message || e).slice(0, 200); }
          accounts.push(entry);
        }));
      } catch (e) { console.warn('[social] fediverse analytics skipped:', (e as Error)?.message); }
    }

    res.json({ accounts, fetchedAt: Date.now() });
  } catch (e) {
    console.error('[social] analytics failed:', e);
    res.status(500).json({ error: 'Could not load analytics.' });
  }
});
