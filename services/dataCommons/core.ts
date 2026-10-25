/**
 * Data Commons — shared plumbing for Plajah's federal open-data layer.
 *
 * data.gov is a CATALOG: the records live with the agencies (Census, FEMA, HUD,
 * USGS, Grants.gov, USAspending). This module is the one place that talks to
 * them, so every surface (Terra, Elevate, Business, Academia) gets the same
 * timeouts, the same cache, and the same provenance stamp.
 *
 * Design rule carried over from Terra: NOTHING renders without a vintage. Every
 * result carries a `Provenance` the UI is expected to show.
 */

export interface Provenance {
  agency: string;
  dataset: string;
  url: string;
  retrievedAt: number;
  /** Source's own "as of" text where the API gives one (e.g. "2024-10-01"). */
  vintage?: string;
  /** U.S. federal works are public domain unless the dataset page says otherwise. */
  license: string;
}

export const FEDERAL_LICENSE = 'U.S. government work — public domain unless the dataset page states otherwise';

/**
 * A layer that can fail on its own without sinking the whole answer. A flood
 * lookup being down must read as "unavailable", never as "no flood risk".
 */
export interface Layer<T> {
  status: 'ok' | 'none' | 'unavailable';
  data?: T;
  /** Why it is unavailable — surfaced to the user, not swallowed. */
  error?: string;
  source: Provenance;
}

export function prov(agency: string, dataset: string, url: string, vintage?: string): Provenance {
  return { agency, dataset, url, retrievedAt: Date.now(), vintage, license: FEDERAL_LICENSE };
}

// ─── Cache + fetch ───────────────────────────────────────────────────────────

interface CacheEntry { at: number; value: unknown }
const CACHE = new Map<string, CacheEntry>();
const MAX_ENTRIES = 500;
/** An upstream outage may serve a result this old rather than fail outright. */
const STALE_OK_MS = 24 * 60 * 60 * 1000;

export function clearDataCommonsCache(): void { CACHE.clear(); }

/** Run `loader` once per `ttlMs` per key; on failure fall back to a stale copy. */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  try {
    const value = await loader();
    if (CACHE.size >= MAX_ENTRIES) {
      const oldest = CACHE.keys().next().value;
      if (oldest !== undefined) CACHE.delete(oldest);
    }
    CACHE.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    if (hit && Date.now() - hit.at < STALE_OK_MS) return hit.value as T;
    throw err;
  }
}

export async function fetchJson<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number; retry?: boolean } = {},
): Promise<T> {
  const { timeoutMs = 15_000, retry = false, ...rest } = init;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ctl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Plajah-DataCommons/1.0', ...(rest.headers || {}) },
    });
    if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
    return (await res.json()) as T;
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError';
    // Some federal services (USGS EPQS) time out intermittently; one retry recovers most of those.
    if (retry) return fetchJson<T>(url, { ...rest, timeoutMs, retry: false });
    if (timedOut) throw new Error(`${new URL(url).host} timed out`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Build a Layer from a loader, converting a throw into an honest "unavailable". */
export async function layer<T>(
  source: Provenance,
  loader: () => Promise<T | null>,
): Promise<Layer<T>> {
  try {
    const data = await loader();
    return data == null ? { status: 'none', source } : { status: 'ok', data, source };
  } catch (err: any) {
    return { status: 'unavailable', error: String(err?.message || err).slice(0, 200), source };
  }
}

/** Rough US bounding box (states + territories) — rejects obvious garbage before any upstream call. */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 17 && lat <= 72 && lng >= -180 && lng <= -64;
}

const ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"',
  ndash: '–', mdash: '—', hellip: '…', eacute: 'é',
};

/** Strip tags, decode the HTML entities federal feeds actually emit, collapse whitespace, cap length. */
export function cleanText(s: unknown, max = 200): string {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
