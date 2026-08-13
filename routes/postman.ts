// postman router — "The Post Man", Plajah's native mail client. Gives the platform REAL Gmail
// access on a PER-USER, PER-ACCOUNT basis: every connected mailbox is stored under the signed-in
// user's own subcollection (users/{uid}/postman_accounts/{accountId}), never a shared doc.
// Replaces the old AI Studio applet that parked every user's Gmail tokens under `default_user`.
//
// No firebase-admin and no googleapis — service-account-signed REST via services/firebaseAdminRest,
// plain fetch to Google's OAuth + Gmail HTTP APIs, exactly like the rest of the Plajah backend.
// OAuth state lives in Firestore (postmanOauthStates/{nonce}), NOT an in-process Map — this server
// autoscales on Cloud Run and a later request routinely lands on a different instance.
//
// Access/refresh tokens are NEVER returned to the client; every serializer strips them.
//
// Mounted in server.ts as:  app.use('/api/postman', express.json({ limit: '1mb' }), postmanRouter)
//
// Endpoints:
//   GET    /api/postman/status                — public; { googleConfigured, microsoftConfigured }
//   GET    /api/postman/accounts              — list the caller's connected mailboxes
//   GET    /api/postman/auth/google/url       — begin the Google OAuth consent flow
//   GET    /api/postman/auth/callback         — PUBLIC (browser redirect from Google); popup closer
//   DELETE /api/postman/accounts/:id          — disconnect a mailbox (best-effort token revoke)
//   GET    /api/postman/messages              — inbox list (?accountId=&limit=&q=)
//   GET    /api/postman/messages/:id          — one message, sanitized bodyHtml + bodyText
//   POST   /api/postman/messages/:id/read     — { accountId, read } → toggle the UNREAD label
//   POST   /api/postman/messages/:id/star     — { accountId, starred } → toggle the STARRED label
//   POST   /api/postman/send                  — { accountId, to, cc?, bcc?, subject, bodyHtml, bodyText, inReplyTo?, threadId? }

import { Router, Request, Response } from 'express';
import nodeCrypto from 'node:crypto';
import {
  verifyIdToken, fsGet, fsSet, fsPatch, fsDelete, getAccessToken, adminConfig,
} from '../services/firebaseAdminRest';

export const postmanRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

export type MailProvider = 'google';
export type AccountStatus = 'ok' | 'reauth';

/** The public shape of a connected mailbox — no tokens, ever. */
export interface PostmanAccount {
  id: string;
  provider: MailProvider;
  email: string;
  displayName: string;
  connectedAt: string;
  status: AccountStatus;
}

export interface MailAddress { name: string; email: string }

export interface MailMessage {
  id: string;
  threadId: string;
  accountId: string;
  provider: MailProvider;
  from: MailAddress;
  to: MailAddress[];
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  starred: boolean;
}

export interface MailMessageFull extends MailMessage {
  bodyHtml: string;
  bodyText: string;
}

interface GmailHeader { name?: string; value?: string }
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessageRaw {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}
interface GmailListRaw { messages?: Array<{ id?: string; threadId?: string }>; resultSizeEstimate?: number }

// ─── Config (degrade gracefully — never 500 on a missing key) ─────────────────

const clientId = () => process.env.POSTMAN_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = () => process.env.POSTMAN_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
const googleConfigured = () => !!(clientId() && clientSecret());

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const STATE_TTL_MS = 10 * 60 * 1000;

/** Same public-base rule server.ts uses for its own OAuth redirects (VITE_APP_URL, else the request host). */
function publicBase(req: Request): string {
  return (process.env.VITE_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
const redirectUri = (req: Request) => `${publicBase(req)}/api/postman/auth/callback`;

// ─── Firestore paths ──────────────────────────────────────────────────────────

/** Deterministic, Firestore-safe doc id: base64url of the lowercased email. */
const accountIdFor = (email: string) => Buffer.from(String(email).trim().toLowerCase(), 'utf8').toString('base64url');
const ACCOUNTS = (uid: string) => `users/${uid}/postman_accounts`;
const ACCOUNT = (uid: string, id: string) => `${ACCOUNTS(uid)}/${id}`;
const STATE = (nonce: string) => `postmanOauthStates/${nonce}`;
/** Guards against a caller smuggling `/` or `..` into a document path. */
const isSafeId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,300}$/.test(id);

// ─── Auth (identical to routes/learnerAuth.ts) ────────────────────────────────

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

// ─── Firestore list (firebaseAdminRest has get/set/patch/delete but no list) ──

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents`;

function parseFirestoreValue(v: unknown): unknown {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, any>;
  if (o.stringValue !== undefined) return o.stringValue;
  if (o.integerValue !== undefined) return Number(o.integerValue);
  if (o.doubleValue !== undefined) return o.doubleValue;
  if (o.booleanValue !== undefined) return o.booleanValue;
  if (o.nullValue !== undefined) return null;
  if (o.timestampValue !== undefined) return o.timestampValue;
  if (o.arrayValue) return (o.arrayValue.values ?? []).map(parseFirestoreValue);
  if (o.mapValue) return parseFirestoreFields(o.mapValue.fields ?? {});
  return null;
}
function parseFirestoreFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = parseFirestoreValue(v);
  return out;
}

async function fsList(collectionPath: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${FS_BASE}/${collectionPath}?pageSize=100`, {
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { documents?: Array<{ name?: string; fields?: Record<string, unknown> }> };
    return (json.documents ?? []).map(d => ({
      id: String(d.name || '').split('/').pop() || '',
      data: parseFirestoreFields(d.fields ?? {}),
    })).filter(d => !!d.id);
  } catch { return []; }
}

// ─── Serializers (token-stripping is the whole point) ─────────────────────────

function toPublicAccount(id: string, doc: Record<string, unknown>): PostmanAccount {
  return {
    id,
    provider: 'google',
    email: String(doc.email ?? ''),
    displayName: String(doc.displayName ?? doc.email ?? ''),
    connectedAt: String(doc.connectedAt ?? ''),
    status: doc.status === 'reauth' ? 'reauth' : 'ok',
  };
}

async function listAccounts(uid: string): Promise<PostmanAccount[]> {
  const rows = await fsList(ACCOUNTS(uid));
  return rows
    .map(r => toPublicAccount(r.id, r.data))
    .filter(a => !!a.email)
    .sort((a, b) => (a.connectedAt < b.connectedAt ? -1 : a.connectedAt > b.connectedAt ? 1 : 0));
}

// ─── Access-token freshness ───────────────────────────────────────────────────

/**
 * Returns a usable Gmail access token for this user's mailbox, refreshing it when it is within
 * 60s of expiry. Returns null when the mailbox must be reconnected (the doc is flagged
 * status:'reauth' so the client can prompt), so every caller can 401 with a clear message.
 */
export async function getFreshAccessToken(uid: string, accountId: string): Promise<string | null> {
  const path = ACCOUNT(uid, accountId);
  const doc = await fsGet(path);
  if (!doc) return null;
  if (doc.status === 'reauth') return null;

  const expiresAt = Number(doc.expiresAt) || 0;
  const access = doc.accessToken ? String(doc.accessToken) : '';
  if (access && expiresAt - Date.now() > 60_000) return access;

  const refresh = doc.refreshToken ? String(doc.refreshToken) : '';
  if (!refresh || !googleConfigured()) {
    await fsPatch(path, { status: 'reauth' });
    return null;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId(),
        client_secret: clientSecret(),
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !data.access_token) {
      if (data.error === 'invalid_grant' || res.status === 400 || res.status === 401) {
        await fsPatch(path, { status: 'reauth' });
      }
      return null;
    }
    const newExpiry = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    await fsPatch(path, { accessToken: data.access_token, expiresAt: newExpiry, status: 'ok' });
    return data.access_token;
  } catch {
    return null;
  }
}

/** Resolves the mailbox to act on: the requested one, else the caller's first connected mailbox. */
async function resolveAccountId(uid: string, requested: unknown): Promise<{ id: string | null; accounts: PostmanAccount[] }> {
  const accounts = await listAccounts(uid);
  if (isSafeId(requested) && accounts.some(a => a.id === requested)) return { id: requested, accounts };
  if (typeof requested === 'string' && requested && !accounts.some(a => a.id === requested)) return { id: null, accounts };
  return { id: accounts[0]?.id ?? null, accounts };
}

// ─── Gmail HTTP helper ────────────────────────────────────────────────────────

interface GmailResult<T> { ok: boolean; status: number; data: T | null; error?: string }

async function gmail<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<GmailResult<T>> {
  try {
    const res = await fetch(`${GMAIL_BASE}/${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(25_000),
    });
    const text = await res.text();
    let data: T | null = null;
    try { data = text ? JSON.parse(text) as T : null; } catch { data = null; }
    if (!res.ok) {
      const err = (data as unknown as { error?: { message?: string } } | null)?.error?.message || `Gmail responded ${res.status}`;
      return { ok: false, status: res.status, data: null, error: err };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : 'Gmail request failed' };
  }
}

/** Worker-pool map — bounded fan-out so a 25-message page never fires 25 requests at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ─── Header / address parsing ─────────────────────────────────────────────────

function headerMap(part: GmailPart | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of part?.headers ?? []) {
    if (h?.name) out[h.name.toLowerCase()] = String(h.value ?? '');
  }
  return out;
}

/** Splits an address list on commas that are outside quotes and outside <…>. */
function splitAddressList(raw: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  let depth = 0;
  for (const ch of String(raw || '')) {
    if (ch === '"') { inQuote = !inQuote; cur += ch; continue; }
    if (!inQuote && ch === '<') depth++;
    else if (!inQuote && ch === '>') depth = Math.max(0, depth - 1);
    if (ch === ',' && !inQuote && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Handles `"Name" <a@b.com>`, `Name <a@b.com>`, `<a@b.com>` and bare `a@b.com`. */
function parseAddress(raw: string): MailAddress {
  const s = String(raw || '').trim();
  const angled = /^(?:"([^"]*)"|([^<]*?))\s*<\s*([^>]+?)\s*>$/.exec(s);
  if (angled) {
    const name = (angled[1] ?? angled[2] ?? '').trim().replace(/^'|'$/g, '');
    const email = angled[3].trim();
    return { name: name || email, email };
  }
  const bare = s.replace(/^</, '').replace(/>$/, '').trim();
  return { name: bare, email: bare };
}

const parseAddressList = (raw: string): MailAddress[] => splitAddressList(raw).map(parseAddress).filter(a => !!a.email);

function isoDate(msg: GmailMessageRaw, headers: Record<string, string>): string {
  const internal = Number(msg.internalDate);
  if (Number.isFinite(internal) && internal > 0) return new Date(internal).toISOString();
  const parsed = Date.parse(headers.date || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

function toMailMessage(msg: GmailMessageRaw, accountId: string): MailMessage {
  const headers = headerMap(msg.payload);
  const labels = msg.labelIds ?? [];
  return {
    id: String(msg.id ?? ''),
    threadId: String(msg.threadId ?? ''),
    accountId,
    provider: 'google',
    from: parseAddress(headers.from || ''),
    to: parseAddressList(headers.to || ''),
    subject: headers.subject || '(no subject)',
    snippet: decodeEntities(String(msg.snippet ?? '')),
    date: isoDate(msg, headers),
    unread: labels.includes('UNREAD'),
    starred: labels.includes('STARRED'),
  };
}

// ─── MIME body extraction ─────────────────────────────────────────────────────

function b64urlDecode(data: string): string {
  try {
    return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch { return ''; }
}

/** Depth-first walk collecting the first text/html and text/plain non-attachment parts. */
function extractBodies(part: GmailPart | undefined, acc: { html: string; text: string } = { html: '', text: '' }): { html: string; text: string } {
  if (!part) return acc;
  const mime = (part.mimeType || '').toLowerCase();
  const isAttachment = !!part.filename;
  const data = part.body?.data;
  if (data && !isAttachment) {
    if (mime.startsWith('text/html') && !acc.html) acc.html = b64urlDecode(data);
    else if (mime.startsWith('text/plain') && !acc.text) acc.text = b64urlDecode(data);
  }
  for (const child of part.parts ?? []) extractBodies(child, acc);
  return acc;
}

// ─── HTML sanitizing ──────────────────────────────────────────────────────────
// Defence in depth, not the only defence: the Post Man client renders bodyHtml inside a sandboxed
// container (no same-origin, no scripts), so this pass exists to make sure nothing executable ever
// leaves the server. It is a deliberate regex pass — the house rule is no new npm dependencies.

const DANGEROUS_TAGS = 'script|style|iframe|object|embed|form|link|meta|base|noscript|applet|frame|frameset|svg|math';
const URL_ATTRS = 'href|src|xlink:href|action|formaction|background|poster|data';

function decodeEntities(s: string): string {
  return String(s)
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => { try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; } })
    .replace(/&#(\d+);?/g, (_m, dec: string) => { try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; } })
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ');
}

function isUnsafeUrl(value: string): boolean {
  const v = decodeEntities(value).replace(/[\s\u0000-\u001F]+/g, '').toLowerCase();
  if (/^(javascript|vbscript|livescript|file|blob):/.test(v)) return true;
  if (v.startsWith('data:') && !v.startsWith('data:image/')) return true;
  return false;
}

export function sanitizeEmailHtml(html: string): string {
  let out = String(html || '');

  // Comments (can hide conditional-comment payloads).
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  // Whole dangerous elements, content included…
  out = out.replace(new RegExp(`<\\s*(${DANGEROUS_TAGS})\\b[\\s\\S]*?<\\s*/\\s*\\1\\s*>`, 'gi'), '');
  // …then any orphaned/self-closing opening or closing tags of the same set.
  out = out.replace(new RegExp(`<\\s*/?\\s*(?:${DANGEROUS_TAGS})\\b[^>]*>?`, 'gi'), '');
  // Inline event handlers in every quoting style.
  out = out.replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ');
  // Executable URLs.
  out = out.replace(
    new RegExp(`\\b(${URL_ATTRS})\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'),
    (match: string, attr: string, rawValue: string) => {
      const quoted = /^["']/.test(rawValue);
      const value = quoted ? rawValue.slice(1, -1) : rawValue;
      return isUnsafeUrl(value) ? `${attr}="#"` : match;
    },
  );
  // style="" payloads (expression(), url(javascript:…), @import).
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (match: string, rawValue: string) => {
    const value = decodeEntities(/^["']/.test(rawValue) ? rawValue.slice(1, -1) : rawValue).toLowerCase();
    return /expression\s*\(|javascript:|vbscript:|@import|behavior\s*:|-moz-binding/.test(value) ? ' ' : match;
  });
  // Every link opens in a new tab and leaks nothing back to us.
  out = out.replace(/<a\b([^>]*)>/gi, (_m: string, attrs: string) => {
    const cleaned = attrs.replace(/\s(?:target|rel)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<a${cleaned} target="_blank" rel="noopener noreferrer nofollow">`;
  });

  return out;
}

// ─── OAuth callback page ──────────────────────────────────────────────────────

const escapeHtml = (s: string) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const forScript = (v: unknown) => JSON.stringify(v)
  .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function callbackPage(payload: { ok: boolean; email?: string; error?: string }): string {
  const message = {
    type: 'PLAJAH_POSTMAN_OAUTH',
    ok: payload.ok,
    provider: 'google' as MailProvider,
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.error ? { error: payload.error } : {}),
  };
  const title = payload.ok ? 'Mailbox connected' : 'Could not connect';
  const detail = payload.ok
    ? `${payload.email || 'Your mailbox'} is now delivering to The Post Man.`
    : (payload.error || 'Something went wrong connecting this mailbox.');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Post Man — ${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; background:#020202; color:#fff;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
         display:flex; align-items:center; justify-content:center; }
  .card { max-width:380px; padding:40px 32px; text-align:center; }
  .mark { font-size:26px; font-weight:900; letter-spacing:-0.5px; margin-bottom:22px; }
  .mark span { color:#FF8C00; }
  .badge { width:56px; height:56px; margin:0 auto 20px; border-radius:50%;
           display:flex; align-items:center; justify-content:center; font-size:26px;
           background:${payload.ok ? 'rgba(255,140,0,0.14)' : 'rgba(255,255,255,0.07)'};
           border:1px solid ${payload.ok ? 'rgba(255,140,0,0.5)' : 'rgba(255,255,255,0.16)'}; }
  h1 { font-size:19px; margin:0 0 10px; font-weight:700; }
  p { margin:0; font-size:14px; line-height:1.5; color:rgba(255,255,255,0.62); word-break:break-word; }
  .hint { margin-top:22px; font-size:12px; color:rgba(255,255,255,0.35); }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">plajah<span>.</span></div>
    <div class="badge">${payload.ok ? '&#9993;' : '&#33;'}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(detail)}</p>
    <div class="hint">${payload.ok ? 'You can close this window.' : 'Close this window and try again.'}</div>
  </div>
<script>
(function () {
  var payload = ${forScript(message)};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch (e) {}
  if (payload.ok) { setTimeout(function () { try { window.close(); } catch (e) {} }, 1500); }
})();
</script>
</body>
</html>`;
}

// ─── GET /status ──────────────────────────────────────────────────────────────
// Public. Lets the client decide whether to show the "Connect Gmail" button at all.
postmanRouter.get('/status', (_req: Request, res: Response) => {
  try {
    return res.json({ googleConfigured: googleConfigured(), microsoftConfigured: false });
  } catch {
    return res.json({ googleConfigured: false, microsoftConfigured: false });
  }
});

// ─── GET /accounts ────────────────────────────────────────────────────────────
postmanRouter.get('/accounts', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in to see your mailboxes.' });
    return res.json({ accounts: await listAccounts(uid) });
  } catch (e) {
    console.error('[postman] accounts failed:', e);
    return res.status(500).json({ error: 'Could not load your mailboxes.' });
  }
});

// ─── GET /auth/google/url ─────────────────────────────────────────────────────
postmanRouter.get('/auth/google/url', async (req: Request, res: Response) => {
  try {
    if (!googleConfigured()) {
      return res.status(503).json({
        error: 'Gmail is not set up on this server yet. Add POSTMAN_GOOGLE_CLIENT_ID and POSTMAN_GOOGLE_CLIENT_SECRET.',
        configured: false,
      });
    }
    if (!adminConfig.hasCredentials()) {
      return res.status(503).json({ error: 'Mail sign-in is temporarily unavailable.', configured: false });
    }
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in to connect a mailbox.' });

    // State lives in Firestore — this server autoscales, so an in-process map would break the
    // moment the callback lands on a different instance (the TV QR pairing bug).
    const nonce = nodeCrypto.randomBytes(24).toString('base64url');
    const stored = await fsSet(STATE(nonce), { uid, provider: 'google', createdAt: Date.now() });
    if (!stored) return res.status(503).json({ error: 'Could not start the connection. Try again.', configured: true });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: nonce,
    }).toString()}`;

    return res.json({ url });
  } catch (e) {
    console.error('[postman] auth url failed:', e);
    return res.status(500).json({ error: 'Could not start the Google connection.' });
  }
});

// ─── GET /auth/callback ───────────────────────────────────────────────────────
// PUBLIC by design — this is a browser redirect from Google, it carries no Firebase ID token.
// The `state` nonce (Firestore, single-use, 10-minute TTL) is what binds the code to a uid.
postmanRouter.get('/auth/callback', async (req: Request, res: Response) => {
  const fail = (msg: string) => res.status(200).type('html').send(callbackPage({ ok: false, error: msg }));
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return fail(error === 'access_denied' ? 'You cancelled the Google sign-in.' : String(error));
    if (!code || !state) return fail('Google did not return an authorization code.');
    if (!googleConfigured()) return fail('Gmail is not set up on this server yet.');

    const stateDoc = await fsGet(STATE(String(state)));
    await fsDelete(STATE(String(state))); // single use, whatever happens next
    if (!stateDoc?.uid) return fail('This connection link is no longer valid. Try connecting again.');
    const createdAt = Number(stateDoc.createdAt) || 0;
    if (!createdAt || Date.now() - createdAt > STATE_TTL_MS) return fail('This connection link expired. Try connecting again.');
    const uid = String(stateDoc.uid);

    // 1. Authorization code → tokens.
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: redirectUri(req),
        grant_type: 'authorization_code',
      }).toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const tokens = await tokenRes.json().catch(() => ({})) as {
      access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string; error?: string;
    };
    if (!tokenRes.ok || !tokens.access_token) {
      return fail(tokens.error_description || tokens.error || 'Google refused the connection.');
    }

    // 2. Who did we just connect?
    const infoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const info = await infoRes.json().catch(() => ({})) as { email?: string; name?: string };
    const email = String(info.email || '').trim().toLowerCase();
    if (!email) return fail('Google did not share an email address for this account.');

    // 3. Persist per-user, per-account. Never a shared doc.
    const accountId = accountIdFor(email);
    const existing = await fsGet(ACCOUNT(uid, accountId));
    const refreshToken = tokens.refresh_token || (existing?.refreshToken ? String(existing.refreshToken) : '');
    if (!refreshToken) return fail('Google did not issue a refresh token. Remove Plajah from your Google account permissions and connect again.');

    const saved = await fsSet(ACCOUNT(uid, accountId), {
      provider: 'google',
      email,
      displayName: String(info.name || email),
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
      connectedAt: new Date().toISOString(),
      scope: String(tokens.scope || GOOGLE_SCOPES),
      status: 'ok',
    });
    if (!saved) return fail('Could not save this mailbox. Please try again.');

    return res.status(200).type('html').send(callbackPage({ ok: true, email }));
  } catch (e) {
    console.error('[postman] callback failed:', e);
    return fail('Something went wrong connecting this mailbox.');
  }
});

// ─── DELETE /accounts/:id ─────────────────────────────────────────────────────
postmanRouter.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const id = req.params.id;
    if (!isSafeId(id)) return res.status(400).json({ error: 'Unknown mailbox.' });

    const doc = await fsGet(ACCOUNT(uid, id));
    if (doc?.refreshToken) {
      // Best effort — a failed revoke must never block the disconnect.
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(String(doc.refreshToken))}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(10_000),
        });
      } catch { /* ignore */ }
    }
    await fsDelete(ACCOUNT(uid, id));
    return res.json({ ok: true });
  } catch (e) {
    console.error('[postman] disconnect failed:', e);
    return res.status(500).json({ error: 'Could not disconnect that mailbox.' });
  }
});

// ─── GET /messages ────────────────────────────────────────────────────────────
postmanRouter.get('/messages', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in to read your mail.' });

    const { id: accountId, accounts } = await resolveAccountId(uid, req.query.accountId);
    if (!accounts.length) return res.json({ configured: true, messages: [], noAccounts: true });
    if (!accountId) return res.status(404).json({ error: 'That mailbox is not connected.' });

    const token = await getFreshAccessToken(uid, accountId);
    if (!token) return res.status(401).json({ error: 'This mailbox needs to be reconnected.', needsReauth: true, accountId });

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '25'), 10) || 25, 1), 50);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const listPath = `messages?maxResults=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

    const list = await gmail<GmailListRaw>(token, listPath);
    if (!list.ok) return res.status(list.status === 401 ? 401 : 502).json({ error: list.error || 'Gmail could not list your mail.' });

    const ids = (list.data?.messages ?? []).map(m => String(m.id ?? '')).filter(Boolean);
    const metaPath = (id: string) =>
      `messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`;

    // Bounded fan-out: 10 in flight at a time, never 25 at once and never a serial loop.
    const fetched = await mapLimit(ids, 10, async (id) => (await gmail<GmailMessageRaw>(token, metaPath(id))).data);
    const messages: MailMessage[] = fetched
      .filter((m): m is GmailMessageRaw => !!m)
      .map(m => toMailMessage(m, accountId));

    return res.json({ configured: true, messages });
  } catch (e) {
    console.error('[postman] messages failed:', e);
    return res.status(500).json({ error: 'Could not load your mail.' });
  }
});

// ─── GET /messages/:id ────────────────────────────────────────────────────────
postmanRouter.get('/messages/:id', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in to read your mail.' });
    const messageId = String(req.params.id || '');
    if (!messageId) return res.status(400).json({ error: 'No message requested.' });

    const { id: accountId, accounts } = await resolveAccountId(uid, req.query.accountId);
    if (!accounts.length) return res.status(404).json({ error: 'No mailbox connected.' });
    if (!accountId) return res.status(404).json({ error: 'That mailbox is not connected.' });

    const token = await getFreshAccessToken(uid, accountId);
    if (!token) return res.status(401).json({ error: 'This mailbox needs to be reconnected.', needsReauth: true, accountId });

    const result = await gmail<GmailMessageRaw>(token, `messages/${encodeURIComponent(messageId)}?format=full`);
    if (!result.ok || !result.data) {
      return res.status(result.status === 404 ? 404 : result.status === 401 ? 401 : 502)
        .json({ error: result.error || 'Could not open that message.' });
    }

    const bodies = extractBodies(result.data.payload);
    const message: MailMessageFull = {
      ...toMailMessage(result.data, accountId),
      bodyHtml: sanitizeEmailHtml(bodies.html),
      bodyText: bodies.text,
    };
    return res.json({ message });
  } catch (e) {
    console.error('[postman] message failed:', e);
    return res.status(500).json({ error: 'Could not open that message.' });
  }
});

// ─── Label toggles (read / star) ──────────────────────────────────────────────

async function modifyLabel(req: Request, res: Response, label: 'UNREAD' | 'STARRED', add: boolean) {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const messageId = String(req.params.id || '');
  if (!messageId) return res.status(400).json({ error: 'No message given.' });

  const { id: accountId, accounts } = await resolveAccountId(uid, (req.body ?? {}).accountId);
  if (!accounts.length) return res.status(404).json({ error: 'No mailbox connected.' });
  if (!accountId) return res.status(404).json({ error: 'That mailbox is not connected.' });

  const token = await getFreshAccessToken(uid, accountId);
  if (!token) return res.status(401).json({ error: 'This mailbox needs to be reconnected.', needsReauth: true, accountId });

  const body = add ? { addLabelIds: [label] } : { removeLabelIds: [label] };
  const result = await gmail<GmailMessageRaw>(token, `messages/${encodeURIComponent(messageId)}/modify`, { method: 'POST', body });
  if (!result.ok) return res.status(result.status === 401 ? 401 : 502).json({ error: result.error || 'Gmail rejected that change.' });
  return res.json({ ok: true });
}

// POST /messages/:id/read  — body { accountId, read }
postmanRouter.post('/messages/:id/read', async (req: Request, res: Response) => {
  try {
    const read = (req.body ?? {}).read !== false; // default: mark as read
    return await modifyLabel(req, res, 'UNREAD', !read); // read → REMOVE the UNREAD label
  } catch (e) {
    console.error('[postman] read toggle failed:', e);
    return res.status(500).json({ error: 'Could not update that message.' });
  }
});

// POST /messages/:id/star — body { accountId, starred }
postmanRouter.post('/messages/:id/star', async (req: Request, res: Response) => {
  try {
    const starred = (req.body ?? {}).starred !== false; // default: star it
    return await modifyLabel(req, res, 'STARRED', starred);
  } catch (e) {
    console.error('[postman] star toggle failed:', e);
    return res.status(500).json({ error: 'Could not update that message.' });
  }
});

// ─── POST /send ───────────────────────────────────────────────────────────────

const MAX_RECIPIENTS = 50;

/** CRLF stripping — the one thing that turns a subject line into header injection. */
const headerSafe = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();

/** RFC 2047 encode a header value only when it needs it. */
function encodeHeader(value: string): string {
  const v = headerSafe(value);
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`;
}

function normalizeRecipients(input: unknown): string[] {
  const raw: string[] = Array.isArray(input)
    ? input.map(v => String(v ?? ''))
    : typeof input === 'string' ? splitAddressList(input) : [];
  return raw.map(headerSafe).filter(Boolean);
}

const base64Body = (s: string) => (Buffer.from(s, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');

postmanRouter.post('/send', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in to send mail.' });

    const body = (req.body ?? {}) as {
      accountId?: string; to?: unknown; cc?: unknown; bcc?: unknown;
      subject?: string; bodyHtml?: string; bodyText?: string; inReplyTo?: string; threadId?: string;
    };

    const to = normalizeRecipients(body.to);
    const cc = normalizeRecipients(body.cc);
    const bcc = normalizeRecipients(body.bcc);
    if (!to.length) return res.status(400).json({ error: 'Add at least one recipient.' });
    const bad = [...to, ...cc, ...bcc].find(a => !a.includes('@'));
    if (bad) return res.status(400).json({ error: `"${bad}" is not an email address.` });
    if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
      return res.status(400).json({ error: `Too many recipients — ${MAX_RECIPIENTS} is the limit for one message.` });
    }

    const { id: accountId, accounts } = await resolveAccountId(uid, body.accountId);
    if (!accounts.length) return res.status(404).json({ error: 'Connect a mailbox before sending.' });
    if (!accountId) return res.status(404).json({ error: 'That mailbox is not connected.' });

    const token = await getFreshAccessToken(uid, accountId);
    if (!token) return res.status(401).json({ error: 'This mailbox needs to be reconnected.', needsReauth: true, accountId });

    const account = accounts.find(a => a.id === accountId);
    const fromEmail = account?.email || '';
    const fromName = account?.displayName || fromEmail;

    const html = typeof body.bodyHtml === 'string' ? body.bodyHtml : '';
    const text = typeof body.bodyText === 'string' ? body.bodyText : '';
    if (!html && !text) return res.status(400).json({ error: 'Write something before sending.' });

    const inReplyTo = headerSafe(body.inReplyTo);
    const headers: string[] = [
      `From: ${encodeHeader(fromName)} <${fromEmail}>`,
      `To: ${to.join(', ')}`,
      ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
      ...(bcc.length ? [`Bcc: ${bcc.join(', ')}`] : []),
      `Subject: ${encodeHeader(body.subject ?? '')}`,
      ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
      'MIME-Version: 1.0',
    ];

    let raw: string;
    if (html && text) {
      const boundary = `plajah_${nodeCrypto.randomBytes(12).toString('hex')}`;
      raw = [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        base64Body(text),
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        base64Body(html),
        `--${boundary}--`,
        '',
      ].join('\r\n');
    } else {
      raw = [
        ...headers,
        `Content-Type: text/${html ? 'html' : 'plain'}; charset="UTF-8"`,
        'Content-Transfer-Encoding: base64',
        '',
        base64Body(html || text),
        '',
      ].join('\r\n');
    }

    const threadId = headerSafe(body.threadId);
    const result = await gmail<{ id?: string; threadId?: string }>(token, 'messages/send', {
      method: 'POST',
      body: { raw: Buffer.from(raw, 'utf8').toString('base64url'), ...(threadId ? { threadId } : {}) },
    });
    if (!result.ok) return res.status(result.status === 401 ? 401 : 502).json({ error: result.error || 'Gmail refused to send that message.' });

    return res.json({ ok: true, id: String(result.data?.id ?? '') });
  } catch (e) {
    console.error('[postman] send failed:', e);
    return res.status(500).json({ error: 'Could not send that message.' });
  }
});
