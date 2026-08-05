// ─────────────────────────────────────────────────────────────────────────────
// publicDomainMusic — a thin, non-throwing client over the Internet Archive's
// public JSON APIs, used to stream genuinely free historical recordings inside
// Chora.
//
// Three endpoints, all keyless and CORS-open:
//   • discovery  https://archive.org/advancedsearch.php?q=…&output=json
//   • file list  https://archive.org/metadata/<identifier>   → files[]
//   • playback   https://archive.org/download/<identifier>/<file>  (302 → 206 audio/mpeg)
//
// Hard-won rules baked in here:
//   1. NEVER trust an identifier you haven't resolved. A search hit only proves a
//      text match — it does NOT prove the item exists, is a recording, or has any
//      playable audio. `resolveItem` is the only thing that proves playability.
//   2. Many IA audio items ship ZIP-ONLY (the whole `musopen` collection is mostly
//      like this — 32 of its 34 items have no loose MP3 at all). We filter the file
//      list down to individually-streamable audio and treat "no audio files" as a
//      resolution failure, so a ZIP-only item can never surface as a playable shelf.
//   3. IA's storage nodes intermittently 500 on a file that is perfectly fine — the
//      same URL succeeds seconds later. Everything retries on 5xx/network error, or
//      a healthy item would randomly look dead.
//   4. Rights are REPORTED, never asserted. We surface what the item's own metadata
//      says. Only when the metadata is silent do we fall back to the recording's
//      date, and we label that as the (dated, jurisdictional) inference it is.
//
// Single-purpose: no Firestore, no auth, no writes. Failure is always an empty
// result, never a throw — a dead archive item must not take a Chora tab down.
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_ENDPOINT = 'https://archive.org/advancedsearch.php';
const METADATA_ENDPOINT = 'https://archive.org/metadata';
const DOWNLOAD_ENDPOINT = 'https://archive.org/download';
const DETAILS_ENDPOINT = 'https://archive.org/details';
const COVER_ENDPOINT = 'https://archive.org/services/img';

/** Formats that stream directly from an <audio> element. Deliberately excludes
 *  FLAC/WAV (present on most Great 78 items but huge and patchily supported) and
 *  of course ZIP, which is what makes so much of `musopen` unplayable. */
const STREAMABLE_AUDIO = /\.(mp3|ogg|m4a)$/i;
/** Derivative junk that carries an audio-ish name but is not music. */
const NON_MUSIC = /(_spectrogram|\.afpk$|_whisper_asr|_meta\.|_files\.xml)/i;

// ── Public shapes ────────────────────────────────────────────────────────────

/** What an item's own metadata says about rights — reported, not asserted. */
export interface PDRights {
  /** Short line for the UI, e.g. "CC0 1.0 (Public Domain Dedication)". */
  label: string;
  /** Where the claim comes from, so the UI never launders an inference as a fact. */
  basis: 'ITEM_LICENCE' | 'ITEM_RIGHTS_FIELD' | 'DATE_INFERENCE' | 'UNSTATED';
  /** The item's own licence URL, when it declares one. */
  licenseUrl?: string;
  /** Longer explanation shown under the item. */
  detail: string;
}

export interface PDTrack {
  /** Stable, namespaced so it can't collide with a Plajah track id. */
  id: string;
  title: string;
  /** Best-effort performer/composer credit from the item. */
  artist: string;
  /** Direct, streamable https URL (archive.org 302s this to a storage node). */
  url: string;
  /** Seconds, when the item reports a length. */
  durationSec?: number;
  sizeBytes?: number;
  fileName: string;
  itemId: string;
}

/** A search hit. Playability is NOT yet proven at this stage. */
export interface PDItemSummary {
  identifier: string;
  title: string;
  creator: string;
  year?: string;
  itemUrl: string;
  coverUrl: string;
}

/** A fully resolved item — guaranteed to have at least one streamable track. */
export interface PDItem extends PDItemSummary {
  description: string;
  subjects: string[];
  publisher?: string;
  rights: PDRights;
  tracks: PDTrack[];
}

// ── Internals ────────────────────────────────────────────────────────────────

const searchCache = new Map<string, PDItemSummary[]>();
const itemCache = new Map<string, PDItem | null>();
/** De-dupes concurrent resolves of the same identifier (shelves overlap). */
const inFlight = new Map<string, Promise<PDItem | null>>();

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(x => typeof x === 'string') : typeof v === 'string' ? [v] : [];

const joinCredits = (v: unknown): string => asArray(v).join(', ');

/** IA reports `length` either as seconds ("251.72") or as "MM:SS" / "HH:MM:SS". */
const parseLength = (raw: unknown): number | undefined => {
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  if (raw.includes(':')) {
    const parts = raw.split(':').map(Number);
    if (parts.some(n => !isFinite(n))) return undefined;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(raw);
  return isFinite(n) ? n : undefined;
};

/** Fetch JSON, retrying transient IA storage-node failures. Never throws. */
async function fetchJson(url: string, attempts = 3): Promise<any | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      // 5xx from IA is usually a flaky storage node, not a dead item — back off and retry.
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
  return null;
}

/** Build the playback URL. Only the file segment is encoded — the identifier is
 *  already URL-safe and encoding the slashes would break the path. */
export const buildTrackUrl = (identifier: string, fileName: string): string =>
  `${DOWNLOAD_ENDPOINT}/${identifier}/${encodeURIComponent(fileName)}`;

export const buildItemUrl = (identifier: string): string => `${DETAILS_ENDPOINT}/${identifier}`;
export const buildCoverUrl = (identifier: string): string => `${COVER_ENDPOINT}/${identifier}`;

/**
 * Report the rights position for an item, in strict order of trustworthiness.
 * We never upgrade a silence into a public-domain claim without labelling it as
 * an inference — the item's own metadata always wins.
 */
export function describeRights(meta: Record<string, any>): PDRights {
  const licenseUrl: string | undefined = typeof meta.licenseurl === 'string' ? meta.licenseurl : undefined;
  if (licenseUrl) {
    const u = licenseUrl.toLowerCase();
    const label = u.includes('publicdomain/zero') ? 'CC0 1.0 — Public Domain Dedication'
      : u.includes('publicdomain/mark') ? 'Public Domain Mark 1.0'
      : u.includes('/by-sa/') ? 'Creative Commons BY-SA'
      : u.includes('/by-nc') ? 'Creative Commons BY-NC'
      : u.includes('/by/') ? 'Creative Commons BY'
      : 'Creative Commons / open licence';
    return {
      label,
      basis: 'ITEM_LICENCE',
      licenseUrl,
      detail: 'The Internet Archive item declares this licence in its own metadata.',
    };
  }

  const stated = meta.rights || meta['possible-copyright-status'] || meta.usage;
  if (typeof stated === 'string' && stated.trim()) {
    return {
      label: stated.trim().slice(0, 160),
      basis: 'ITEM_RIGHTS_FIELD',
      detail: 'Rights statement taken verbatim from the Internet Archive item metadata.',
    };
  }

  // Metadata is silent. Fall back to the recording date — and say so plainly.
  const rawYear = String(meta.year || meta.date || '');
  const year = Number(rawYear.slice(0, 4));
  if (isFinite(year) && year > 0 && year < 1929) {
    return {
      label: `Recorded ${year} — pre-1929, public domain in the US`,
      basis: 'DATE_INFERENCE',
      detail:
        `This item states no licence. The inference is based only on its recording date (${year}): ` +
        'under the US Music Modernization Act, sound recordings first published before 1929 are in ' +
        'the public domain. Rights may differ in other jurisdictions.',
    };
  }

  return {
    label: 'Rights not stated by the Internet Archive',
    basis: 'UNSTATED',
    detail:
      'This item declares no licence and no rights statement, and its date does not establish public ' +
      'domain status. Check the source item before reusing it.',
  };
}

// ── Discovery ────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** How many hits to request. IA caps this well above anything we need. */
  rows?: number;
  /** 1-based. */
  page?: number;
  signal?: AbortSignal;
}

/**
 * Run an Internet Archive advanced search. Returns candidates only — a hit here
 * proves a text match and nothing else, so always `resolveItem` before playing.
 */
export async function searchItems(query: string, opts: SearchOptions = {}): Promise<PDItemSummary[]> {
  const rows = Math.min(Math.max(opts.rows ?? 24, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const key = `${query}::${rows}::${page}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const fields = ['identifier', 'title', 'creator', 'year', 'date'];
  const url =
    `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}` +
    fields.map(f => `&fl[]=${f}`).join('') +
    `&rows=${rows}&page=${page}&output=json`;

  const data = await fetchJson(url);
  const docs: any[] = data?.response?.docs;
  if (!Array.isArray(docs)) return [];

  const out: PDItemSummary[] = docs
    .filter(d => typeof d?.identifier === 'string' && d.identifier)
    .map(d => ({
      identifier: d.identifier as string,
      title: typeof d.title === 'string' ? d.title : d.identifier,
      creator: joinCredits(d.creator),
      year: typeof d.year === 'string' ? d.year : typeof d.date === 'string' ? d.date.slice(0, 4) : undefined,
      itemUrl: buildItemUrl(d.identifier),
      coverUrl: buildCoverUrl(d.identifier),
    }));

  searchCache.set(key, out);
  return out;
}

// ── Resolution (the only proof of playability) ───────────────────────────────

/**
 * Resolve an identifier to a playable item. Returns `null` when the identifier is
 * dead, is not audio, or carries no individually-streamable file (the ZIP-only
 * case). Cached, including negative results, so a bad id is probed once.
 */
export async function resolveItem(identifier: string): Promise<PDItem | null> {
  if (!identifier) return null;
  if (itemCache.has(identifier)) return itemCache.get(identifier) ?? null;

  const pending = inFlight.get(identifier);
  if (pending) return pending;

  const task = (async (): Promise<PDItem | null> => {
    const data = await fetchJson(`${METADATA_ENDPOINT}/${encodeURIComponent(identifier)}`);
    // A dead identifier returns `{}` — metadata is absent rather than a 404.
    const meta = data?.metadata;
    if (!meta || typeof meta !== 'object') return null;

    const files: any[] = Array.isArray(data.files) ? data.files : [];
    const audio = files.filter(f => {
      const name = typeof f?.name === 'string' ? f.name : '';
      return STREAMABLE_AUDIO.test(name) && !NON_MUSIC.test(name);
    });
    // ZIP-only / score-only / metadata-only item: not listenable, so not shippable.
    if (!audio.length) return null;

    const creator = joinCredits(meta.creator) || 'Unknown performer';
    const tracks: PDTrack[] = audio.map((f, i) => ({
      id: `pd-${identifier}-${i}`,
      // Prefer the file's own title; fall back to a de-slugged filename.
      title:
        (typeof f.title === 'string' && f.title.trim()) ||
        String(f.name).replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim() ||
        `Track ${i + 1}`,
      artist: creator,
      url: buildTrackUrl(identifier, String(f.name)),
      durationSec: parseLength(f.length),
      sizeBytes: Number(f.size) || undefined,
      fileName: String(f.name),
      itemId: identifier,
    }));

    const year = typeof meta.year === 'string' ? meta.year
      : typeof meta.date === 'string' ? meta.date.slice(0, 4)
      : undefined;

    const item: PDItem = {
      identifier,
      title: typeof meta.title === 'string' ? meta.title : identifier,
      creator,
      year,
      itemUrl: buildItemUrl(identifier),
      coverUrl: buildCoverUrl(identifier),
      // IA descriptions are HTML; strip tags for safe plain-text rendering.
      description: asArray(meta.description).join(' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      subjects: asArray(meta.subject),
      publisher: asArray(meta.publisher)[0],
      rights: describeRights(meta),
      tracks,
    };
    return item;
  })()
    .catch(() => null)
    .then(result => {
      itemCache.set(identifier, result);
      inFlight.delete(identifier);
      return result;
    });

  inFlight.set(identifier, task);
  return task;
}

/**
 * Resolve many identifiers, dropping every one that isn't actually playable.
 * Runs in small batches so a big shelf doesn't open 40 sockets at once.
 */
export async function resolveItems(identifiers: string[], batchSize = 6): Promise<PDItem[]> {
  const out: PDItem[] = [];
  for (let i = 0; i < identifiers.length; i += batchSize) {
    const batch = identifiers.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map(id => resolveItem(id)));
    for (const item of settled) if (item) out.push(item);
  }
  return out;
}

/**
 * Search, then resolve, returning only items that genuinely play. `limit` caps
 * how many playable items we want; we over-fetch candidates because some hits
 * won't resolve.
 *
 * Resolution stops as soon as `limit` playable items are in hand. That matters:
 * resolving is one metadata round-trip per candidate, so eagerly resolving the
 * whole over-fetched candidate list would multiply the network cost of every shelf
 * for results we'd only throw away.
 */
export async function searchPlayableItems(query: string, limit = 12, batchSize = 6): Promise<PDItem[]> {
  const candidates = await searchItems(query, { rows: Math.min(limit * 2, 60) });
  if (!candidates.length) return [];

  const out: PDItem[] = [];
  for (let i = 0; i < candidates.length && out.length < limit; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map(c => resolveItem(c.identifier)));
    for (const item of settled) {
      if (item && out.length < limit) out.push(item);
    }
  }
  return out;
}

/** Clear caches (useful for a manual refresh control). */
export function clearPublicDomainCache(): void {
  searchCache.clear();
  itemCache.clear();
}
