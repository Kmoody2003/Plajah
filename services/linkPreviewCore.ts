/**
 * linkPreviewCore — PURE logic behind GET /api/link-preview (routes/socialServer.ts).
 * No network, no Node-only imports except `node:net` (isIP), so tsx tests can import it.
 *
 *  - isBlockedIp / isBlockedHostname / checkUrlShape : the SSRF gate (applied to the URL, to every
 *    resolved address, and to every redirect hop by the route).
 *  - parseLinkMeta : og:/twitter:/<title>/favicon extraction, relative URL resolution, sanitising.
 *  - TtlLru        : tiny in-memory LRU with TTL (10 min in the route).
 */
import { isIP } from 'node:net';

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
  favicon: string;
}

export const MAX_BODY_BYTES = 1_000_000;
export const MAX_REDIRECTS = 3;
export const FETCH_TIMEOUT_MS = 5000;

// ── SSRF ─────────────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s)) return null;
    const v = Number(s);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function v4Blocked(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparsable → treat as unsafe
  for (const [base, bits] of V4_BLOCKS) {
    const b = ipv4ToInt(base) as number;
    const size = 2 ** (32 - bits);
    if (Math.floor(n / size) === Math.floor(b / size)) return true;
  }
  return false;
}

/** Expand an IPv6 literal to 8 hextets (numbers). Handles `::` and a trailing dotted IPv4. */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  let tail: number[] = [];
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const n = ipv4ToInt(m[2]);
    if (n === null) return null;
    tail = [Math.floor(n / 65536), n % 65536];
    s = m[1] + '0:0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (str: string) => (str === '' ? [] : str.split(':'));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const total = head.length + rest.length;
  if (halves.length === 1 && total !== 8) return null;
  if (halves.length === 2 && total > 7) return null;
  const fill = halves.length === 2 ? new Array(8 - total).fill('0') : [];
  const all = [...head, ...fill, ...rest];
  if (all.length !== 8) return null;
  const out = all.map(h => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  if (out.some(Number.isNaN)) return null;
  if (tail.length) { out[6] = tail[0]; out[7] = tail[1]; }
  return out;
}

function v6Blocked(ip: string): boolean {
  const h = expandV6(ip);
  if (!h) return true;
  const embeddedV4 = (a: number, b: number) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  // :: and ::1
  if (h.slice(0, 7).every(x => x === 0) && (h[7] === 0 || h[7] === 1)) return true;
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (deprecated compatible)
  if (h.slice(0, 5).every(x => x === 0) && (h[5] === 0xffff || h[5] === 0)) return v4Blocked(embeddedV4(h[6], h[7]));
  // 64:ff9b::/96 NAT64 — embedded v4 decides
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every(x => x === 0)) return v4Blocked(embeddedV4(h[6], h[7]));
  if ((h[0] & 0xfe00) === 0xfc00) return true;           // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true;           // fe80::/10 link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true;           // fec0::/10 site-local (deprecated)
  if ((h[0] & 0xff00) === 0xff00) return true;           // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true;   // documentation
  if (h[0] === 0x2002) return v4Blocked(embeddedV4(h[1], h[2])); // 6to4 — embedded v4 decides
  if (h[0] === 0x2001 && h[1] === 0) return true;        // Teredo
  return false;
}

/** True when the literal IP must never be fetched (private, loopback, link-local, metadata, reserved…). */
export function isBlockedIp(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '');
  const kind = isIP(bare);
  if (kind === 4) return v4Blocked(bare);
  if (kind === 6) return v6Blocked(bare);
  return true;
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.localdomain'];
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data']);

/** Hostname-level screen (before DNS). IP literals are decided by isBlockedIp. */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (isIP(h)) return isBlockedIp(h);
  if (BLOCKED_HOSTS.has(h)) return true;
  if (BLOCKED_HOST_SUFFIXES.some(s => h.endsWith(s))) return true;
  if (!h.includes('.')) return true; // single-label names resolve via search domains/internal DNS
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Static validation of a (possibly redirected) URL: scheme, creds, port, hostname. */
export function checkUrlShape(raw: string): UrlCheck {
  if (typeof raw !== 'string' || !raw || raw.length > 2048) return { ok: false, reason: 'bad-url' };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'bad-url' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'bad-scheme' };
  if (u.username || u.password) return { ok: false, reason: 'credentials' };
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return { ok: false, reason: 'bad-port' };
  if (isBlockedHostname(u.hostname)) return { ok: false, reason: 'blocked-host' };
  return { ok: true, url: u };
}

/** Resolve a Location header against the current URL. null if not a followable redirect. */
export function resolveRedirect(from: URL, location: string | undefined): UrlCheck {
  if (!location) return { ok: false, reason: 'no-location' };
  try { return checkUrlShape(new URL(location, from).toString()); } catch { return { ok: false, reason: 'bad-location' }; }
}

export const isHtmlContentType = (ct: string | undefined | null): boolean =>
  !!ct && /^(text\/html|application\/xhtml\+xml)\b/i.test(ct.trim());

// ── HTML meta parsing ─────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
      try { return String.fromCodePoint(code); } catch { return ''; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Strip tags/control chars, collapse whitespace, truncate. Output is plain text only. */
export function cleanText(s: string | undefined, max: number): string {
  if (!s) return '';
  let t = decodeEntities(s).replace(/<[^>]*>/g, ' ');
  // eslint-disable-next-line no-control-regex
  t = t.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  // skip the tag name
  const body = tag.replace(/^<\s*[a-z0-9]+/i, '').replace(/\/?>$/, '');
  while ((m = re.exec(body))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

/** Absolute http(s) URL or ''. Never returns javascript:/data: etc. */
export function resolveHttpUrl(raw: string | undefined, base: URL | string): string {
  if (!raw) return '';
  try {
    const u = new URL(decodeEntities(raw).trim(), base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (u.username || u.password) return '';
    const s = u.toString();
    return s.length > 2048 ? '' : s;
  } catch { return ''; }
}

export function parseLinkMeta(html: string, finalUrl: string): LinkPreview {
  const base = new URL(finalUrl);
  const head = html.slice(0, MAX_BODY_BYTES);
  const meta: Record<string, string> = {};
  let baseHref = '';
  let icon = '';
  let appleIcon = '';
  // Quote-aware so a `>` inside a content="…" value doesn't end the tag early.
  const tagRe = /<(meta|link|base)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(head))) {
    const a = parseAttrs(m[0]);
    const name = m[1].toLowerCase();
    if (name === 'meta') {
      const key = (a.property || a.name || a.itemprop || '').toLowerCase();
      if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
    } else if (name === 'base') {
      if (!baseHref && a.href) baseHref = a.href;
    } else {
      const rel = (a.rel || '').toLowerCase().split(/\s+/);
      if (a.href) {
        if (rel.includes('apple-touch-icon') && !appleIcon) appleIcon = a.href;
        else if (rel.includes('icon') && !icon) icon = a.href;
      }
    }
  }
  const resolveBase = (baseHref && resolveHttpUrl(baseHref, base)) || base.toString();

  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = cleanText(meta['og:title'] || meta['twitter:title'] || titleTag, 200);
  const description = cleanText(
    meta['og:description'] || meta['twitter:description'] || meta['description'], 300);
  const image = resolveHttpUrl(
    meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'],
    resolveBase);
  const siteName = cleanText(meta['og:site_name'] || meta['application-name'] || meta['twitter:site'], 80)
    || base.hostname.replace(/^www\./, '');
  const favicon = resolveHttpUrl(icon || appleIcon, resolveBase) || `${base.origin}/favicon.ico`;

  return { url: base.toString(), title, description, image, siteName, favicon };
}

// ── LRU with TTL ──────────────────────────────────────────────────────────────

export class TtlLru<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(private max: number, private ttlMs: number) {}
  get(key: string, now = Date.now()): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp <= now) { this.map.delete(key); return undefined; }
    this.map.delete(key); this.map.set(key, e); // refresh recency
    return e.v;
  }
  set(key: string, v: V, now = Date.now()): void {
    this.map.delete(key);
    this.map.set(key, { v, exp: now + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  get size(): number { return this.map.size; }
}
