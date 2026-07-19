/**
 * Radio Browser API client — real, live broadcast radio.
 *
 * Source: https://api.radio-browser.info  (free, open, community-run, NO API KEY)
 *
 * ── Verified against the live API from an https browser page ──────────────────
 *  • CORS: the API sends permissive CORS headers. Direct browser calls WORK from
 *    an https origin — verified with a control test (a known non-CORS host failed
 *    with "TypeError: Failed to fetch" in the same run while radio-browser
 *    succeeded). No server proxy is required for search / discovery / clicks.
 *
 *  • User-Agent: the API docs ask every client to send a meaningful UA string
 *    (e.g. "Plajah/1.0"). WE CANNOT COMPLY FROM THE BROWSER, and there is no
 *    workaround. Two things were tested against the live API, not assumed:
 *      1. `User-Agent` is a forbidden header name per the Fetch spec — browsers
 *         silently drop it, so setting it does nothing.
 *      2. Sending the same intent under a custom name (`X-Plajah-Client`) makes
 *         the request non-simple, which triggers a CORS preflight — and the API
 *         REJECTS the preflight. Verified: the identical request succeeds with
 *         no custom header and fails with `TypeError: Failed to fetch` with one.
 *    So these calls must be sent as plain, header-free simple requests. The
 *    browser's own User-Agent is what reaches them. If this is ever moved behind
 *    a server proxy, that proxy SHOULD set a real `User-Agent: Plajah/1.0`,
 *    which is the only place the docs' request can actually be honored.
 *
 *  • Etiquette implemented here: `hidebroken=true` on every query, a preference
 *    for `lastcheckok === 1`, in-memory caching so we don't hammer the mirrors,
 *    and the play-click report (`/json/url/<stationuuid>`) they ask clients to
 *    send when a user actually tunes in.
 *
 * Nothing in this module throws. Every public function resolves to data or an
 * empty result — a dead mirror must never take a view down with it.
 */

/** A station, normalized from the API's raw row. */
export interface RadioStation {
  /** Stable id across mirrors. */
  uuid: string;
  name: string;
  /** The URL to actually play. `url_resolved` follows playlist redirects, so it
   *  is the one the API tells you to use — we fall back to `url`. */
  url: string;
  homepage: string;
  favicon: string;
  tags: string[];
  country: string;
  countryCode: string;
  language: string;
  codec: string;
  bitrate: number;
  /** True when the stream is an HLS (.m3u8) playlist rather than an ICY stream. */
  isHls: boolean;
  /** The API's own last health check passed. */
  lastCheckOk: boolean;
  votes: number;
  clickCount: number;
  /** Computed: this stream is plain http:// while we are served over https://,
   *  so the browser WILL block it as mixed content. See `isMixedContentBlocked`. */
  blockedMixedContent: boolean;
}

const FALLBACK_SERVER = 'https://de1.api.radio-browser.info';
const DISCOVERY_URL = 'https://all.api.radio-browser.info/json/servers';

const LIST_TTL_MS = 10 * 60 * 1000;   // station lists are slow-moving
const SERVER_TTL_MS = 60 * 60 * 1000; // mirror list changes rarely
const REQUEST_TIMEOUT_MS = 12000;

// ── Mixed content ────────────────────────────────────────────────────────────
// Roughly two thirds of the database is http:// only (measured: 665 of a
// 1000-station sample). On an https page every one of those is hard-blocked by
// the browser before a single byte is fetched — there is no workaround short of
// a server-side proxy. We detect them up front so the UI can mark or hide them
// instead of serving the user silent dead air.

/** True when the app itself is served over https (so http streams get blocked). */
export const isSecurePage = (): boolean =>
  typeof window !== 'undefined' && window.location.protocol === 'https:';

/** Would this stream URL be blocked as mixed content on the current page? */
export const isMixedContentBlocked = (url: string): boolean =>
  isSecurePage() && /^http:\/\//i.test(url || '');

// ── Server discovery ─────────────────────────────────────────────────────────

let serverPromise: Promise<string> | null = null;
let serverCachedAt = 0;
let resolvedServer = FALLBACK_SERVER;

/**
 * Resolve an API mirror. The documented approach is to look up
 * `all.api.radio-browser.info` and pick one of the returned hosts, so that a
 * single mirror going away doesn't break every client. Browsers can't do DNS,
 * so we use the JSON equivalent (`/json/servers`) and pick at random to spread
 * load. Any failure falls back to a known-good host — discovery can never be
 * the reason radio doesn't work.
 */
export async function getServer(): Promise<string> {
  const fresh = Date.now() - serverCachedAt < SERVER_TTL_MS;
  if (fresh && serverPromise) return serverPromise;

  serverCachedAt = Date.now();
  serverPromise = (async () => {
    try {
      const res = await timedFetch(DISCOVERY_URL);
      if (!res?.ok) return FALLBACK_SERVER;
      const rows = await res.json();
      const names: string[] = Array.isArray(rows)
        ? Array.from(new Set(rows.map((r: any) => r?.name).filter((n: any) => typeof n === 'string' && n)))
        : [];
      if (!names.length) return FALLBACK_SERVER;
      const pick = names[Math.floor(Math.random() * names.length)];
      resolvedServer = `https://${pick}`;
      return resolvedServer;
    } catch {
      return FALLBACK_SERVER;
    }
  })();

  return serverPromise;
}

// ── Low-level fetch ──────────────────────────────────────────────────────────

/**
 * Plain, header-free fetch with a timeout.
 *
 * Do NOT add request headers here. Any custom header makes this a non-simple
 * request, which forces a CORS preflight that this API rejects outright — see
 * the User-Agent note in the file header. Adding one silently breaks every
 * station list on the page.
 */
async function timedFetch(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** GET a JSON path off the resolved mirror, retrying once on the fallback host. */
async function apiGet<T>(path: string): Promise<T | null> {
  const base = await getServer();
  let res = await timedFetch(`${base}${path}`);
  if (!res?.ok && base !== FALLBACK_SERVER) {
    // The chosen mirror is unhappy — drop back to the known-good host and
    // forget the discovery result so the next call re-resolves.
    serverPromise = null;
    serverCachedAt = 0;
    res = await timedFetch(`${FALLBACK_SERVER}${path}`);
  }
  if (!res?.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Normalization ────────────────────────────────────────────────────────────

function normalize(raw: any): RadioStation | null {
  if (!raw || typeof raw !== 'object') return null;
  // `url_resolved` is the post-redirect stream the API recommends playing.
  const url: string = (raw.url_resolved || raw.url || '').trim();
  const uuid: string = raw.stationuuid || '';
  const name: string = (raw.name || '').trim();
  if (!url || !uuid || !name) return null;

  return {
    uuid,
    name,
    url,
    homepage: raw.homepage || '',
    favicon: raw.favicon || '',
    tags: typeof raw.tags === 'string' ? raw.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    country: raw.country || '',
    countryCode: raw.countrycode || '',
    language: raw.language || '',
    codec: raw.codec || 'UNKNOWN',
    bitrate: Number(raw.bitrate) || 0,
    isHls: raw.hls === 1 || raw.hls === '1',
    lastCheckOk: raw.lastcheckok === 1 || raw.lastcheckok === '1',
    votes: Number(raw.votes) || 0,
    clickCount: Number(raw.clickcount) || 0,
    blockedMixedContent: isMixedContentBlocked(url),
  };
}

/** Dedupe by uuid, then by identical stream URL (the DB has many near-duplicates). */
function dedupe(stations: RadioStation[]): RadioStation[] {
  const seenUuid = new Set<string>();
  const seenUrl = new Set<string>();
  const out: RadioStation[] = [];
  for (const s of stations) {
    if (seenUuid.has(s.uuid) || seenUrl.has(s.url)) continue;
    seenUuid.add(s.uuid);
    seenUrl.add(s.url);
    out.push(s);
  }
  return out;
}

/**
 * House ordering: playable first. A station we know the browser will block is
 * pushed to the bottom rather than dropped, so the UI can still show it with an
 * honest "blocked" badge instead of silently pretending it doesn't exist.
 */
function rank(stations: RadioStation[]): RadioStation[] {
  return stations.slice().sort((a, b) => {
    if (a.blockedMixedContent !== b.blockedMixedContent) return a.blockedMixedContent ? 1 : -1;
    if (a.lastCheckOk !== b.lastCheckOk) return a.lastCheckOk ? -1 : 1;
    return b.votes - a.votes;
  });
}

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; data: RadioStation[] }>();

function readCache(key: string): RadioStation[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > LIST_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

/** Drop every cached list (used by the UI's manual refresh). */
export function clearRadioCache(): void {
  cache.clear();
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface StationQuery {
  name?: string;
  tag?: string;
  /** ISO 3166-1 alpha-2, e.g. "GB". The API's `country` param is deprecated. */
  countryCode?: string;
  language?: string;
  limit?: number;
  /** Only return streams the browser can actually play on this page. */
  playableOnly?: boolean;
}

function buildSearchPath(q: StationQuery): string {
  const p = new URLSearchParams();
  if (q.name) p.set('name', q.name);
  if (q.tag) p.set('tag', q.tag);
  if (q.countryCode) p.set('countrycode', q.countryCode);
  if (q.language) p.set('language', q.language);
  p.set('limit', String(Math.min(Math.max(q.limit ?? 60, 1), 400)));
  p.set('hidebroken', 'true');   // API etiquette: never ask for known-dead streams
  p.set('order', 'votes');
  p.set('reverse', 'true');
  return `/json/stations/search?${p.toString()}`;
}

/** Search stations. Resolves to `[]` on any failure — never throws. */
export async function searchStations(q: StationQuery): Promise<RadioStation[]> {
  const path = buildSearchPath(q);
  const cached = readCache(path);
  let stations = cached;

  if (!stations) {
    const rows = await apiGet<any[]>(path);
    if (!Array.isArray(rows)) return [];
    stations = rank(dedupe(rows.map(normalize).filter((s): s is RadioStation => !!s && s.lastCheckOk)));
    cache.set(path, { at: Date.now(), data: stations });
  }

  return q.playableOnly ? stations.filter(s => !s.blockedMixedContent) : stations;
}

/** Free-text search across station names (what the search box calls). */
export const searchByName = (name: string, limit = 60): Promise<RadioStation[]> =>
  name.trim() ? searchStations({ name: name.trim(), limit }) : Promise.resolve([]);

/** Most-clicked stations right now ("trending"). */
export async function fetchTrending(limit = 60): Promise<RadioStation[]> {
  return fetchTopList('topclick', limit);
}

/** Highest-voted stations of all time. */
export async function fetchTopVoted(limit = 60): Promise<RadioStation[]> {
  return fetchTopList('topvote', limit);
}

async function fetchTopList(kind: 'topclick' | 'topvote', limit: number): Promise<RadioStation[]> {
  const path = `/json/stations/${kind}/${Math.min(Math.max(limit, 1), 400)}?hidebroken=true`;
  const cached = readCache(path);
  if (cached) return cached;
  const rows = await apiGet<any[]>(path);
  if (!Array.isArray(rows)) return [];
  const stations = rank(dedupe(rows.map(normalize).filter((s): s is RadioStation => !!s && s.lastCheckOk)));
  cache.set(path, { at: Date.now(), data: stations });
  return stations;
}

/** Country list for the by-country browser. Cached separately (it isn't stations). */
let countryCache: { at: number; data: RadioCountry[] } | null = null;

export interface RadioCountry {
  code: string;
  name: string;
  stationCount: number;
}

export async function fetchCountries(): Promise<RadioCountry[]> {
  if (countryCache && Date.now() - countryCache.at < SERVER_TTL_MS) return countryCache.data;
  const rows = await apiGet<any[]>('/json/countries?hidebroken=true');
  if (!Array.isArray(rows)) return [];
  const data = rows
    .map(r => ({ code: r.iso_3166_1 || '', name: r.name || '', stationCount: Number(r.stationcount) || 0 }))
    .filter(c => c.code && c.name && c.stationCount > 0)
    .sort((a, b) => b.stationCount - a.stationCount);
  countryCache = { at: Date.now(), data };
  return data;
}

// ── Play-click report ────────────────────────────────────────────────────────

const reported = new Set<string>();

/**
 * Tell the API a user actually tuned in. Their docs ask clients to call this so
 * the community popularity data stays meaningful — it's how `topclick` works.
 *
 * Deliberately fire-and-forget: never awaited on the playback path, never
 * throws, and de-duplicated per session so holding down "play" doesn't spam
 * their servers with the same station.
 */
export function reportStationClick(uuid: string): void {
  if (!uuid || reported.has(uuid)) return;
  reported.add(uuid);
  void (async () => {
    try {
      const base = await getServer();
      await timedFetch(`${base}/json/url/${encodeURIComponent(uuid)}`);
    } catch {
      /* popularity reporting is best-effort — it must never affect playback */
    }
  })();
}
