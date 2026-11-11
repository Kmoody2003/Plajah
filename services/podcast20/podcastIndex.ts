// Tell Podcast Index (https://podcastindex-org.github.io/docs-api/) that a Plajah feed changed, so Fountain,
// Podverse, Castamatic and the rest pick up new episodes in minutes instead of on the next crawl.
// Off unless PODCASTINDEX_API_KEY and PODCASTINDEX_API_SECRET are set; never throws.

import { sha1Hex } from './guid';

export const PODCASTINDEX_API = 'https://api.podcastindex.org/api/1.0';

export interface PodcastIndexCreds { key: string; secret: string; userAgent?: string }

export interface NotifyResult {
  ok: boolean;
  skipped?: 'not_configured' | 'bad_url';
  status?: number;
  /** Set when the feed was unknown and we asked the index to add it. */
  added?: boolean;
  description?: string;
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export function credsFromEnv(env: Record<string, string | undefined> = (typeof process !== 'undefined' ? process.env : {})): PodcastIndexCreds | null {
  const key = env.PODCASTINDEX_API_KEY?.trim();
  const secret = env.PODCASTINDEX_API_SECRET?.trim();
  return key && secret ? { key, secret, userAgent: env.PODCASTINDEX_USER_AGENT?.trim() || 'Plajah/1.0 (+https://plajah.com)' } : null;
}

/** The API's auth headers: Authorization = sha1(key + secret + unixSeconds), hex. */
export function authHeaders(creds: PodcastIndexCreds, nowSec = Math.floor(Date.now() / 1000)): Record<string, string> {
  const date = String(nowSec);
  return {
    'User-Agent': creds.userAgent || 'Plajah/1.0',
    'X-Auth-Key': creds.key,
    'X-Auth-Date': date,
    Authorization: sha1Hex(creds.key + creds.secret + date),
  };
}

async function call(fetchImpl: FetchLike, url: string, creds: PodcastIndexCreds): Promise<{ status: number; ok: boolean; body: any }> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : undefined;
  try {
    const r = await fetchImpl(url, { method: 'GET', headers: authHeaders(creds), signal: ctl?.signal });
    let body: any = null;
    try { body = await r.json(); } catch { /* non-JSON */ }
    return { status: r.status, ok: r.ok, body };
  } finally { if (timer) clearTimeout(timer); }
}

/**
 * hub/pubnotify for a feed URL. If the index doesn't know the feed yet and `addIfMissing` is set,
 * follows up with add/byfeedurl (needs a key with write permission).
 */
export async function notifyPodcastIndex(
  feedUrl: string,
  opts: { creds?: PodcastIndexCreds | null; fetchImpl?: FetchLike; addIfMissing?: boolean } = {},
): Promise<NotifyResult> {
  const creds = opts.creds === undefined ? credsFromEnv() : opts.creds;
  if (!creds) return { ok: false, skipped: 'not_configured' };
  if (!/^https:\/\//i.test(feedUrl)) return { ok: false, skipped: 'bad_url' };
  const fetchImpl: FetchLike | undefined = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? (fetch as unknown as FetchLike) : undefined);
  if (!fetchImpl) return { ok: false, skipped: 'not_configured' };
  try {
    const n = await call(fetchImpl, `${PODCASTINDEX_API}/hub/pubnotify?url=${encodeURIComponent(feedUrl)}`, creds);
    const success = n.ok && (n.body?.status === true || n.body?.status === 'true');
    if (success || !opts.addIfMissing) return { ok: success, status: n.status, description: n.body?.description };
    const a = await call(fetchImpl, `${PODCASTINDEX_API}/add/byfeedurl?url=${encodeURIComponent(feedUrl)}`, creds);
    const added = a.ok && (a.body?.status === true || a.body?.status === 'true');
    return { ok: added, added, status: a.status, description: a.body?.description };
  } catch (err: any) {
    return { ok: false, description: String(err?.message || err).slice(0, 200) };
  }
}
