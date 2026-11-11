// openNetworks/common — shared plumbing for the five open-network bridges (Mobilizon, Lemmy, BookWyrm, Owncast,
// Matrix). SERVER-SIDE ONLY.
//
// Every server URL here is typed by a user, so every request goes through `netFetch`, which:
//   • accepts https only (checkUrlShape from linkPreviewCore screens credentials, odd ports, internal hostnames),
//   • resolves DNS and refuses if ANY address is private/loopback/link-local/metadata (isBlockedIp),
//   • refuses redirects (a 3xx could bounce us to an internal host), caps time and body size.
// Remaining gap, stated plainly: DNS is checked and then fetch() resolves again, so a rebinding server with a 0s TTL
// could still swap addresses between the two lookups. Pinning the socket to the checked IP needs an undici dispatcher,
// which isn't a direct dependency today.
//
// Accounts live in the server-only collection `openNetworkAccounts/{uid}_{network}_{id}`; secrets are AES-GCM
// encrypted with the same key/format as the fediverse accounts (encryptCreds). Passwords are only ever used once to
// mint a token and are never stored.

import { createHash } from 'node:crypto';
import { checkUrlShape, isBlockedIp } from '../linkPreviewCore';

export type NetworkId = 'mobilizon' | 'lemmy' | 'bookwyrm' | 'owncast' | 'matrix';
export const NETWORKS: readonly NetworkId[] = ['mobilizon', 'lemmy', 'bookwyrm', 'owncast', 'matrix'];
export const ACCOUNTS_COLLECTION = 'openNetworkAccounts';
export const ORG_SETTINGS_COLLECTION = 'openNetworkOrgSettings';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type LookupLike = (host: string) => Promise<string[]>;

export interface NetDeps {
  fetch: FetchLike;
  lookup: LookupLike;
  timeoutMs?: number;
  maxBytes?: number;
}

export class OpenNetworkError extends Error {
  constructor(public status: number, message: string, public code = 'error') { super(message); }
}

export const defaultLookup: LookupLike = async (host) => {
  const dns = await import('node:dns');
  const rows = await dns.promises.lookup(host, { all: true, verbatim: true });
  return rows.map(r => r.address);
};

export function defaultNetDeps(): NetDeps {
  return { fetch: (u, i) => fetch(u, i), lookup: defaultLookup };
}

// ─── URL safety ──────────────────────────────────────────────────────────────

/** "mastodon.example", "https://x.example/", "x.example/some/path" → URL of the origin. https only. */
export function normalizeServer(raw: unknown): URL {
  let s = String(raw ?? '').trim();
  if (!s) throw new OpenNetworkError(400, 'Server address required', 'bad-url');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  const shape = checkUrlShape(s);
  if (!shape.ok) throw new OpenNetworkError(400, `That server address can't be used (${(shape as { reason?: string }).reason})`, (shape as { reason?: string }).reason);
  if (shape.url.protocol !== 'https:') throw new OpenNetworkError(400, 'Only https:// servers are supported', 'bad-scheme');
  return new URL(shape.url.origin);
}

/** Static shape check + DNS: refuses when any resolved address is internal. */
export async function assertSafeUrl(raw: string, deps: Pick<NetDeps, 'lookup'>): Promise<URL> {
  const shape = checkUrlShape(raw);
  if (!shape.ok) throw new OpenNetworkError(400, `Blocked address (${(shape as { reason?: string }).reason})`, (shape as { reason?: string }).reason);
  const u = shape.url;
  if (u.protocol !== 'https:') throw new OpenNetworkError(400, 'Only https:// servers are supported', 'bad-scheme');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs: string[];
  try { addrs = await deps.lookup(host); } catch { throw new OpenNetworkError(502, `Couldn't find ${host}`, 'dns'); }
  if (!addrs.length) throw new OpenNetworkError(502, `Couldn't find ${host}`, 'dns');
  if (addrs.some(a => isBlockedIp(a))) throw new OpenNetworkError(400, 'That server resolves to a private address', 'blocked-ip');
  return u;
}

export interface NetResponse<T = any> { status: number; ok: boolean; json: T | null; text: string; headers: Headers }

/** SSRF-safe request to a user-entered server. Never follows redirects. */
export async function netFetch<T = any>(deps: NetDeps, url: string, init: RequestInit = {}): Promise<NetResponse<T>> {
  await assertSafeUrl(url, deps);
  const maxBytes = deps.maxBytes ?? 2_000_000;
  let res: Response;
  try {
    res = await deps.fetch(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      headers: { 'User-Agent': 'Plajah-OpenNetworks/1.0 (+https://plajah.com)', ...(init.headers as Record<string, string> | undefined) },
    });
  } catch (e: any) {
    throw new OpenNetworkError(502, e?.name === 'TimeoutError' ? 'The server took too long to answer' : 'Could not reach the server', 'unreachable');
  }
  if (res.status >= 300 && res.status < 400) throw new OpenNetworkError(502, 'The server tried to redirect; redirects are not followed', 'redirect');
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new OpenNetworkError(502, 'Response too large', 'too-large');
  const text = await readCapped(res, maxBytes);
  let json: T | null = null;
  if (text) { try { json = JSON.parse(text) as T; } catch { json = null; } }
  return { status: res.status, ok: res.ok, json, text, headers: res.headers };
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { try { await reader.cancel(); } catch { /* ignore */ } throw new OpenNetworkError(502, 'Response too large', 'too-large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
}

/** Error text from a remote JSON body, never echoing more than a short line. */
export function remoteError(r: NetResponse, fallback: string): string {
  const j: any = r.json;
  const msg = j?.error ?? j?.message ?? j?.errors?.[0]?.message ?? '';
  return clean(typeof msg === 'string' && msg ? msg : fallback, 200);
}

// ─── Text helpers ────────────────────────────────────────────────────────────

export const clean = (v: unknown, max: number): string =>
  String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Plain text → minimal safe HTML paragraphs. */
export const textToHtml = (s: string): string =>
  s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');

/** Strip tags for previews of remote HTML (Lemmy/Mobilizon/BookWyrm bodies are rendered as text by Plajah). */
export const stripHtml = (s: unknown, max: number): string =>
  clean(String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' '), max);

/** Only http(s) links survive into what we hand to the browser. */
export const safeLink = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined; } catch { return undefined; }
};

// ─── Account storage ─────────────────────────────────────────────────────────

export interface AccountDoc {
  uid: string;
  network: NetworkId;
  /** Origin of the remote server, e.g. https://mobilizon.example */
  server: string;
  handle: string;
  displayName?: string;
  /** encryptCreds() output — never sent to the browser. */
  secret: string;
  /** Non-secret extras the adapters need (actor id, rtmp host…). */
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface PublicAccount { id: string; network: NetworkId; server: string; handle: string; displayName?: string; meta?: Record<string, unknown>; createdAt: number }

export interface AccountStore {
  get(id: string): Promise<AccountDoc | null>;
  set(id: string, doc: AccountDoc): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  listByUid(uid: string): Promise<Array<{ id: string; data: AccountDoc }>>;
}

/** `{uid}_{network}_{hash(server|handle)}` — stable, so reconnecting the same account replaces its doc. */
export function accountDocId(uid: string, network: NetworkId, server: string, handle: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new OpenNetworkError(400, 'bad uid');
  const h = createHash('sha256').update(`${server.toLowerCase()}|${handle.toLowerCase()}`).digest('hex').slice(0, 16);
  return `${uid}_${network}_${h}`;
}

export const ACCOUNT_ID_RE = /^[A-Za-z0-9_-]{1,128}_(mobilizon|lemmy|bookwyrm|owncast|matrix)_[a-f0-9]{16}$/;

export function toPublicAccount(id: string, d: AccountDoc): PublicAccount {
  return { id, network: d.network, server: d.server, handle: d.handle, displayName: d.displayName, meta: d.meta, createdAt: d.createdAt };
}

/** Encryption seam: production uses encryptCreds/decryptCreds; tests pass a fake. */
export interface SecretBox {
  seal(secret: Record<string, unknown>): string;
  open(raw: string): Record<string, any>;
}

export async function defaultSecretBox(): Promise<SecretBox> {
  const { encryptCreds, decryptCreds } = await import('../fediverse/auth');
  // encryptCreds is typed for fediverse credentials; the payload rides in accessToken as JSON.
  return {
    seal: (s) => encryptCreds({ accessToken: JSON.stringify(s) }),
    open: (raw) => { const c = decryptCreds(raw); try { return JSON.parse(c.accessToken); } catch { return {}; } },
  };
}

export async function firestoreAccountStore(): Promise<AccountStore> {
  const fs = await import('../firebaseAdminRest');
  const path = (id: string) => `${ACCOUNTS_COLLECTION}/${id}`;
  return {
    get: async (id) => (await fs.fsGet(path(id))) as AccountDoc | null,
    set: (id, doc) => fs.fsSet(path(id), doc as unknown as Record<string, unknown>),
    delete: (id) => fs.fsDelete(path(id)),
    listByUid: async (uid) => (await fs.fsQuery(ACCOUNTS_COLLECTION, [{ field: 'uid', value: uid }], 100)) as Array<{ id: string; data: AccountDoc }>,
  };
}

// ─── Who may connect / what may federate ─────────────────────────────────────

export interface ProfileLike { isChild?: boolean; accountType?: string; birthYear?: number; parentalControls?: unknown }

/** Child accounts never connect open networks. A missing profile fails closed. */
export function canConnectOpenNetworks(p: ProfileLike | null | undefined, nowYear = new Date().getFullYear()): { ok: boolean; reason?: string } {
  if (!p) return { ok: false, reason: 'Profile not found' };
  if (p.isChild === true || p.accountType === 'CHILD') return { ok: false, reason: 'Open networks are not available on child accounts' };
  if (typeof p.birthYear === 'number' && nowYear - p.birthYear < 13) return { ok: false, reason: 'Open networks are not available on child accounts' };
  return { ok: true };
}

export interface OrgLike { id?: string; orgType?: string; isPrivate?: boolean; creatorId?: string; admins?: string[]; category?: string; vertical?: string; isSchool?: boolean }

const OPT_IN_ORG_TYPES = new Set(['CHURCH', 'RELIGIOUS', 'NONPROFIT']);

/** Churches, faith institutions, nonprofits and schools must opt in per network; the default is off. */
export function orgRequiresOptIn(org: OrgLike): boolean {
  if (OPT_IN_ORG_TYPES.has(String(org.orgType || '').toUpperCase())) return true;
  if (org.isSchool) return true;
  return /school|academ|education|k-?12|college|univers/i.test(`${org.category || ''} ${org.vertical || ''}`);
}

export function orgAllowsNetwork(org: OrgLike, settings: { enabled?: Partial<Record<NetworkId, boolean>> } | null, network: NetworkId): boolean {
  if (org.isPrivate) return false;
  if (!orgRequiresOptIn(org)) return settings?.enabled?.[network] !== false; // others: on unless switched off
  return settings?.enabled?.[network] === true;
}

export const isOrgAdmin = (org: OrgLike, uid: string): boolean =>
  org.creatorId === uid || (Array.isArray(org.admins) && org.admins.includes(uid));

/** Generic "is this item safe to leave Plajah" screen for anything we federate. */
export function federationBlockReason(item: Record<string, any>): string | null {
  if (!item) return 'Not found';
  if (item.isPublic === false || item.isPrivate === true) return 'Private content stays on Plajah';
  const vis = String(item.visibility ?? item.audience ?? '').toLowerCase();
  if (vis && !['public', 'everyone', ''].includes(vis)) return 'Only public content can be shared to open networks';
  if (item.orgAudience && String(item.orgAudience).toLowerCase() !== 'public') return 'Org-internal content stays on Plajah';
  if (item.internal === true || item.membersOnly === true || item.sanctuaryMembersOnly === true) return 'Members-only content stays on Plajah';
  if (item.exclusive || item.sanctuaryGate || item.paywall || item.gate || (typeof item.price === 'number' && item.price > 0)) return 'Paywalled content stays on Plajah';
  return null;
}
