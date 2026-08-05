/**
 * Plajah Art Gallery — Client-Side Open-Access Museum API Service
 *
 * Same config-driven, cached, non-throwing pattern as `labsApiService.ts`.
 * All sources here are FREE, KEYLESS, and CORS-safe for direct browser fetch:
 *
 *   - The Art Institute of Chicago API  (api.artic.edu)      — public-domain works + IIIF images
 *   - The Metropolitan Museum Open Access (metmuseum.org)    — public-domain works + hosted images
 *
 * Every fetch returns [] on error (never throws) and uses AbortSignal.timeout so a
 * dead endpoint can't hang the gallery. Results are cached in a Map for the session.
 */

// ── Public types ──────────────────────────────────────────────────────────────

export type ArtSource = 'artic' | 'met';

export interface ArtWork {
  id: string;                 // globally-unique: `${source}-${sourceId}`
  title: string;
  artist: string;
  date: string;               // display date string, e.g. '1889'
  medium: string;
  imageUrl: string;           // full/high-res image
  thumbUrl: string;           // smaller image for grid
  source: ArtSource;
  sourceUrl: string;          // link to the artwork page on the museum site
  isPublicDomain: boolean;
}

export interface MovementDef {
  id: string;
  label: string;
  query: string;              // representative search query for the movement
  blurb: string;
}

// ── Curated movements (representative search queries) ─────────────────────────

export const MOVEMENTS: MovementDef[] = [
  { id: 'renaissance',   label: 'Renaissance',            query: 'Renaissance',            blurb: 'Rebirth of classical ideals — perspective, humanism, and the divine made visible.' },
  { id: 'baroque',       label: 'Baroque',                query: 'Baroque',                blurb: 'Drama, movement, and theatrical light — the grandeur of the 17th century.' },
  { id: 'impressionism', label: 'Impressionism',          query: 'Impressionism',          blurb: 'Fleeting light and open air — the world seen in a glance.' },
  { id: 'post-impressionism', label: 'Post-Impressionism', query: 'Post-Impressionism',    blurb: 'Colour and form set free — the bridge from the observed to the expressed.' },
  { id: 'modernism',     label: 'Modernism',              query: 'Modernism',              blurb: 'Tradition broken open — abstraction, cubism, and the new century.' },
  { id: 'surrealism',    label: 'Surrealism',             query: 'Surrealism',             blurb: 'The logic of dreams — the unconscious given a canvas.' },
  { id: 'abstract-expressionism', label: 'Abstract Expressionism', query: 'Abstract Expressionism', blurb: 'Gesture as subject — scale, action, and the American sublime.' },
  { id: 'photography',   label: 'Photography',            query: 'Photography',            blurb: 'Light written directly — the machine-made image as art.' },
];

// ── Session cache ─────────────────────────────────────────────────────────────

const artCache = new Map<string, ArtWork[]>();

// ── The Art Institute of Chicago ──────────────────────────────────────────────
// Docs: https://api.artic.edu/docs/  — no key, permissive CORS.
// IIIF image URL: https://www.artic.edu/iiif/2/{image_id}/full/843,/0/default.jpg

const ARTIC_IIIF = 'https://www.artic.edu/iiif/2';
const articImage = (imageId: string, width = 843) =>
  `${ARTIC_IIIF}/${imageId}/full/${width},/0/default.jpg`;

async function searchArtic(query: string, limit: number, signal?: AbortSignal): Promise<ArtWork[]> {
  try {
    const fields = 'id,title,artist_display,date_display,medium_display,image_id,is_public_domain';
    const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}` +
      `&query[term][is_public_domain]=true&fields=${fields}&limit=${limit}`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = data?.data ?? [];
    return items
      .filter(a => a.image_id && a.is_public_domain)
      .map((a): ArtWork => ({
        id: `artic-${a.id}`,
        title: a.title || 'Untitled',
        artist: (a.artist_display || '').split('\n')[0].trim() || 'Unknown artist',
        date: a.date_display || '',
        medium: a.medium_display || '',
        imageUrl: articImage(a.image_id, 1686),
        thumbUrl: articImage(a.image_id, 600),
        source: 'artic',
        sourceUrl: `https://www.artic.edu/artworks/${a.id}`,
        isPublicDomain: true,
      }));
  } catch {
    return [];
  }
}

// ── The Metropolitan Museum of Art (Open Access) ──────────────────────────────
// Docs: https://metmuseum.github.io/  — no key, CORS-open.
// search returns objectIDs → /objects/{id} carries isPublicDomain + primaryImage(Small).

async function searchMet(query: string, limit: number, signal?: AbortSignal): Promise<ArtWork[]> {
  try {
    const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search` +
      `?hasImages=true&q=${encodeURIComponent(query)}`;
    const sRes = await fetch(searchUrl, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!sRes.ok) return [];
    const sData = await sRes.json();
    const ids: number[] = (sData?.objectIDs ?? []).slice(0, limit * 3); // over-fetch; many lack PD images
    if (!ids.length) return [];

    const results: ArtWork[] = [];
    for (const id of ids) {
      if (results.length >= limit) break;
      try {
        const oRes = await fetch(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
          { signal: AbortSignal.timeout(7000) }
        );
        if (!oRes.ok) continue;
        const o = await oRes.json();
        if (!o?.isPublicDomain || !o?.primaryImageSmall) continue;
        results.push({
          id: `met-${o.objectID}`,
          title: o.title || 'Untitled',
          artist: o.artistDisplayName || o.culture || 'Unknown artist',
          date: o.objectDate || '',
          medium: o.medium || '',
          imageUrl: o.primaryImage || o.primaryImageSmall,
          thumbUrl: o.primaryImageSmall,
          source: 'met',
          sourceUrl: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
          isPublicDomain: true,
        });
      } catch {
        // skip this object, keep going
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SearchArtOpts {
  limit?: number;            // per-source result target (default 24)
  sources?: ArtSource[];     // which museums to hit (default both)
  signal?: AbortSignal;
}

/** Interleave two lists so both museums are represented in the grid. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/**
 * Search public-domain artworks across the configured museums.
 * Non-throwing: returns [] if everything fails. Cached per (query|limit|sources).
 */
export async function searchArtworks(query: string, opts: SearchArtOpts = {}): Promise<ArtWork[]> {
  const limit = opts.limit ?? 24;
  const sources = opts.sources ?? ['artic', 'met'];
  const cacheKey = `${query.toLowerCase()}|${limit}|${sources.join(',')}`;
  const cached = artCache.get(cacheKey);
  if (cached) return cached;

  const perSource = Math.max(6, Math.ceil(limit / sources.length));
  const tasks: Promise<ArtWork[]>[] = [];
  if (sources.includes('artic')) tasks.push(searchArtic(query, perSource, opts.signal));
  if (sources.includes('met')) tasks.push(searchMet(query, perSource, opts.signal));

  const settled = await Promise.allSettled(tasks);
  const lists = settled.map(s => (s.status === 'fulfilled' ? s.value : []));

  // De-dupe by id, interleave sources for a balanced wall.
  const merged = sources.length === 2 ? interleave(lists[0] ?? [], lists[1] ?? []) : lists.flat();
  const seen = new Set<string>();
  const deduped = merged.filter(w => (seen.has(w.id) ? false : (seen.add(w.id), true))).slice(0, limit);

  if (deduped.length) artCache.set(cacheKey, deduped);
  return deduped;
}

/** Fetch a wing of works for a curated movement. */
export async function fetchArtworksByMovement(movementId: string, opts: SearchArtOpts = {}): Promise<ArtWork[]> {
  const movement = MOVEMENTS.find(m => m.id === movementId) ?? MOVEMENTS[0];
  return searchArtworks(movement.query, opts);
}

/** Clear the session cache (rarely needed; exposed for completeness). */
export function clearArtCache() {
  artCache.clear();
}
