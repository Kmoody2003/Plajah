/**
 * Lesson media — real, rights-checked photos, artworks and audio for lessons and questions.
 *
 * Integrity rules (they follow the platform's accuracy principle):
 *  - Every asset comes from a real archive record and carries its provenance: the creator, date, a
 *    credit line and a link back to the archive page. Nothing is invented, and no media URL is typed
 *    by hand into a lesson.
 *  - Only assets we are allowed to show are returned: Library of Congress photos published in 1929 or
 *    earlier (US public domain), museum open-access works flagged public domain, and Chora Vault
 *    recordings (which the Vault already vets). Anything else is dropped, not shown with a caveat.
 *  - A conservative text filter keeps graphic or adult material out of lesson surfaces.
 */
import { searchArtworks } from './artMuseumService';
import { fetchVaultTracks, fetchLocAudio, type AudioKind } from './archiveContentService';

export type MediaKind = 'image' | 'audio';
export type MediaProvider = 'loc' | 'met' | 'artic' | 'vault' | 'teacher';
export type MediaLicense = 'PD' | 'CC0' | 'CC-BY' | 'CC-BY-SA' | 'teacher-owned' | 'vault';

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  title: string;
  creator?: string;
  date?: string;
  /** Direct media URL (full-size image, or the playable audio file). */
  url: string;
  thumbUrl?: string;
  provider: MediaProvider;
  license: MediaLicense;
  /** Ready-to-print credit line. */
  attribution: string;
  /** The archive's catalogue page for this item. */
  sourceUrl: string;
  durationSec?: number;
}

/** A reference to media that is resolved live from an archive (used by the built-in lesson map). */
export interface MediaRef {
  kind: MediaKind;
  /** Free-text archive search, e.g. 'Edison phonograph'. */
  q?: string;
  /** For audio: a Chora Vault shelf. */
  vault?: { kind: AudioKind; sub?: string };
  /** Caption shown with whatever is found (the teaching point, not the archive's metadata). */
  caption?: string;
  limit?: number;
}

const DENY = /\b(nud(?:e|ity)|naked|erotic|sexual|pornograph\w*|genital\w*|lynch\w*|corpse\w*|dead bod\w*|massacre|execution\w*|mutilat\w*|gore|atrocit\w*)\b/i;
const safe = (...s: Array<string | undefined>) => !DENY.test(s.filter(Boolean).join(' '));

// ── Library of Congress photographs ─────────────────────────────────────────────────────────
let locQueue: Promise<unknown> = Promise.resolve();
let locLast = 0;
const LOC_GAP = 700;
const locJson = (url: string): Promise<any> => {
  const run = async () => {
    const wait = LOC_GAP - (Date.now() - locLast);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    locLast = Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LoC HTTP ${res.status}`);
    return res.json();
  };
  locQueue = locQueue.then(run, run);
  return locQueue as Promise<any>;
};

const yearOf = (d?: string): number | null => { const m = (d || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/); return m ? parseInt(m[1], 10) : null; };
/** Pick the largest derivative LoC offers (the list payload gives several sizes). */
const bestLocImage = (urls: string[]): { url: string; thumb: string } | null => {
  const clean = urls.filter(u => /\.(jpe?g|png|gif)/i.test(u));
  if (!clean.length) return null;
  const pick = (re: RegExp) => clean.find(u => re.test(u));
  const full = pick(/v\.jpg/i) || pick(/r\.jpg/i) || pick(/_150px\.jpg/i) || clean[0];
  const thumb = pick(/_150px\.jpg/i) || pick(/t\.gif/i) || full;
  return { url: full.split('#')[0], thumb: thumb.split('#')[0] };
};

const cache = new Map<string, MediaAsset[]>();

export async function searchLocPhotos(q: string, limit = 12): Promise<MediaAsset[]> {
  const key = `loc:${q}:${limit}`; if (cache.has(key)) return cache.get(key)!;
  try {
    const params = new URLSearchParams({ q, fo: 'json', c: String(Math.min(40, limit * 3)) });
    params.set('fa', 'online-format:image');
    const data = await locJson(`https://www.loc.gov/photos/?${params.toString()}`);
    const out: MediaAsset[] = [];
    for (const r of data?.results || []) {
      const year = yearOf(r.date) ?? yearOf(r.title);
      if (year === null || year > 1929) continue; // strict US public-domain cutoff
      const img = bestLocImage(Array.isArray(r.image_url) ? r.image_url : []);
      const title: string = (r.title || '').trim();
      if (!img || !title || !safe(title, r.description?.[0])) continue;
      const sourceUrl: string = (r.url || r.id || '').replace(/^http:/, 'https:');
      out.push({
        id: `loc:${r.id || sourceUrl}`, kind: 'image', title, date: r.date ? String(r.date).slice(0, 4) : undefined, url: img.url, thumbUrl: img.thumb,
        provider: 'loc', license: 'PD', sourceUrl,
        attribution: `Library of Congress, Prints & Photographs Division${year ? `, ${year}` : ''}. No known restrictions (published ${year}).`,
      });
      if (out.length >= limit) break;
    }
    cache.set(key, out); return out;
  } catch { return []; }
}

// ── Museum open-access artworks ─────────────────────────────────────────────────────────────
export async function searchMuseumArt(q: string, limit = 12): Promise<MediaAsset[]> {
  const key = `art:${q}:${limit}`; if (cache.has(key)) return cache.get(key)!;
  try {
    const works = await searchArtworks(q, { limit: limit * 2 });
    const out = works.filter(w => w.isPublicDomain && w.imageUrl && safe(w.title, w.medium)).slice(0, limit).map((w): MediaAsset => ({
      id: `art:${w.id}`, kind: 'image', title: w.title, creator: w.artist, date: w.date, url: w.imageUrl, thumbUrl: w.thumbUrl || w.imageUrl,
      provider: w.source === 'met' ? 'met' : 'artic', license: 'CC0',
      attribution: `${w.artist ? `${w.artist}, ` : ''}${w.title}${w.date ? `, ${w.date}` : ''}. ${w.source === 'met' ? 'The Metropolitan Museum of Art' : 'The Art Institute of Chicago'}, public domain (open access).`,
      sourceUrl: w.sourceUrl,
    }));
    cache.set(key, out); return out;
  } catch { return []; }
}

// ── Chora Vault audio ───────────────────────────────────────────────────────────────────────
const trackToAsset = (t: any): MediaAsset | null => {
  if (!t?.url || !t.title) return null;
  if (!safe(t.title, t.description)) return null;
  const lic = String(t.license || '').toLowerCase();
  const license: MediaLicense = /cc0|public domain|pd/.test(lic) ? 'PD' : /by-sa/.test(lic) ? 'CC-BY-SA' : /by/.test(lic) ? 'CC-BY' : 'vault';
  return {
    id: `vault:${t.id}`, kind: 'audio', title: t.title, creator: t.artist, date: t.year, url: t.url, thumbUrl: t.thumbnailUrl || undefined,
    provider: 'vault', license, durationSec: t.duration,
    attribution: `${t.artist ? `${t.artist}. ` : ''}${t.title}${t.year ? ` (${t.year})` : ''}. ${t.context || t.source?.replace(/_/g, ' ').toLowerCase() || 'Chora Vault'}.`,
    sourceUrl: t.sourcePageUrl || t.url,
  };
};

export async function searchVaultAudio(opts: { vault?: { kind: AudioKind; sub?: string }; q?: string; limit?: number }): Promise<MediaAsset[]> {
  const limit = opts.limit ?? 8;
  const key = `vault:${opts.vault?.kind}:${opts.vault?.sub}:${opts.q}:${limit}`; if (cache.has(key)) return cache.get(key)!;
  try {
    const tracks = opts.q ? await fetchLocAudio(opts.q, { limit: limit * 2 }) : await fetchVaultTracks(opts.vault!.kind, opts.vault!.sub ?? null, limit * 2);
    const out = tracks.map(trackToAsset).filter(Boolean).slice(0, limit) as MediaAsset[];
    cache.set(key, out); return out;
  } catch { return []; }
}

// ── Public API ──────────────────────────────────────────────────────────────────────────────
export interface FindOptions { q: string; kinds?: Array<'photos' | 'art' | 'audio'>; limit?: number }

/** One search across the archives, used by the teacher's media finder. */
export async function findMedia({ q, kinds = ['photos', 'art', 'audio'], limit = 8 }: FindOptions): Promise<MediaAsset[]> {
  const jobs: Promise<MediaAsset[]>[] = [];
  if (kinds.includes('photos')) jobs.push(searchLocPhotos(q, limit));
  if (kinds.includes('art')) jobs.push(searchMuseumArt(q, limit));
  if (kinds.includes('audio')) jobs.push(searchVaultAudio({ q, limit }));
  return (await Promise.all(jobs)).flat();
}

/** Resolve a lesson's media references into real assets (empty when nothing suitable exists). */
export async function resolveMediaRefs(refs: MediaRef[]): Promise<Array<{ ref: MediaRef; assets: MediaAsset[] }>> {
  const out: Array<{ ref: MediaRef; assets: MediaAsset[] }> = [];
  for (const ref of refs) {
    const limit = ref.limit ?? 3;
    let assets: MediaAsset[] = [];
    if (ref.kind === 'image' && ref.q) assets = (await Promise.all([searchLocPhotos(ref.q, limit), searchMuseumArt(ref.q, 2)])).flat().slice(0, limit);
    if (ref.kind === 'audio') assets = await searchVaultAudio({ vault: ref.vault, q: ref.vault ? undefined : ref.q, limit });
    if (assets.length) out.push({ ref, assets });
  }
  return out;
}
