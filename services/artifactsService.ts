/**
 * Plajah Artifacts — Client-Side Open-Access Museum & Archaeology API Service
 *
 * Powers the artifact browsers in the Archaeology and World History studios.
 * Same non-throwing, cached, CORS-safe pattern as artMuseumService/labsApiService.
 * All sources are FREE and KEYLESS:
 *
 *   - The Metropolitan Museum Open Access  (metmuseum.org)      — antiquities by department
 *   - The Art Institute of Chicago         (api.artic.edu)      — public-domain objects + IIIF
 *   - Cleveland Museum of Art Open Access   (clevelandart.org)   — CC0 works with images
 *   - Open Context                          (opencontext.org)    — archaeological field data (best-effort)
 *
 * Every fetch returns [] on error and uses AbortSignal.timeout so a dead endpoint
 * can't hang the grid. Results cached in a Map for the session.
 */

export type ArtifactSource = 'met' | 'artic' | 'cleveland' | 'opencontext';

export interface Artifact {
  id: string;                 // `${source}-${sourceId}`
  title: string;
  culture: string;            // culture / people / artist
  date: string;               // display date, e.g. 'ca. 1353–1336 B.C.'
  medium: string;
  imageUrl: string;
  thumbUrl: string;
  source: ArtifactSource;
  sourceUrl: string;
  provenance?: string;        // find-spot / geography where known
  model3dUrl?: string;        // link to a 3D model where a museum offers one
}

export interface ArtifactCollection {
  id: string;
  label: string;
  query: string;              // free-text search term
  metDepartmentId?: number;   // optional Met department filter (antiquities wings)
  blurb?: string;
}

// Met department ids (https://metmuseum.github.io/#department) for antiquities wings.
export const MET_DEPARTMENTS = {
  ancientNearEast: 3,
  artsOfAfricaOceaniaAmericas: 5,
  asian: 6,
  egyptian: 10,
  greekRoman: 13,
  islamic: 14,
  medieval: 17,
} as const;

const cache = new Map<string, Artifact[]>();

// ── The Metropolitan Museum of Art ────────────────────────────────────────────
async function searchMet(query: string, limit: number, departmentId?: number, signal?: AbortSignal): Promise<Artifact[]> {
  try {
    const dep = departmentId ? `&departmentId=${departmentId}` : '';
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true${dep}&q=${encodeURIComponent(query)}`;
    const sRes = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!sRes.ok) return [];
    const sData = await sRes.json();
    const ids: number[] = (sData?.objectIDs ?? []).slice(0, limit * 3);
    const out: Artifact[] = [];
    for (const id of ids) {
      if (out.length >= limit) break;
      try {
        const oRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, { signal: AbortSignal.timeout(7000) });
        if (!oRes.ok) continue;
        const o = await oRes.json();
        if (!o?.primaryImageSmall) continue;
        out.push({
          id: `met-${o.objectID}`,
          title: o.title || 'Untitled',
          culture: o.culture || o.artistDisplayName || o.period || 'Unknown',
          date: o.objectDate || '',
          medium: o.medium || '',
          imageUrl: o.primaryImage || o.primaryImageSmall,
          thumbUrl: o.primaryImageSmall,
          source: 'met',
          sourceUrl: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
          provenance: [o.geographyType, o.country || o.region || o.excavation].filter(Boolean).join(' ') || undefined,
        });
      } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}

// ── The Art Institute of Chicago ──────────────────────────────────────────────
const articImage = (imageId: string, w = 843) => `https://www.artic.edu/iiif/2/${imageId}/full/${w},/0/default.jpg`;
async function searchArtic(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  try {
    const fields = 'id,title,artist_display,date_display,medium_display,image_id,place_of_origin,is_public_domain';
    const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&query[term][is_public_domain]=true&fields=${fields}&limit=${limit}`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data ?? [])
      .filter((a: any) => a.image_id)
      .map((a: any): Artifact => ({
        id: `artic-${a.id}`,
        title: a.title || 'Untitled',
        culture: (a.artist_display || a.place_of_origin || '').split('\n')[0].trim() || 'Unknown',
        date: a.date_display || '',
        medium: a.medium_display || '',
        imageUrl: articImage(a.image_id, 1200),
        thumbUrl: articImage(a.image_id, 500),
        source: 'artic',
        sourceUrl: `https://www.artic.edu/artworks/${a.id}`,
        provenance: a.place_of_origin || undefined,
      }));
  } catch { return []; }
}

// ── Cleveland Museum of Art (Open Access, CC0) ────────────────────────────────
async function searchCleveland(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  try {
    const url = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query)}&cc0=1&has_image=1&limit=${limit}`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data ?? [])
      .filter((a: any) => a?.images?.web?.url)
      .map((a: any): Artifact => ({
        id: `cleveland-${a.id}`,
        title: a.title || 'Untitled',
        culture: a.culture?.[0] || a.creators?.[0]?.description || 'Unknown',
        date: a.creation_date || '',
        medium: a.technique || a.type || '',
        imageUrl: a.images?.print?.url || a.images?.web?.url,
        thumbUrl: a.images?.web?.url,
        source: 'cleveland',
        sourceUrl: a.url || `https://www.clevelandart.org/art/${a.accession_number}`,
        provenance: a.culture?.[0] || undefined,
      }));
  } catch { return []; }
}

// ── Open Context (archaeological field data) — best-effort ────────────────────
async function searchOpenContext(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  try {
    const url = `https://opencontext.org/query/.json?q=${encodeURIComponent(query)}&rows=${limit}&type=media&response=geo-record,metadata`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = await res.json();
    const feats: any[] = data?.features ?? data?.['oc-api:has-results'] ?? [];
    return feats
      .map((f: any): Artifact | null => {
        const p = f.properties || f;
        const thumb = p?.thumbnail || p?.['oc-api:thumbnail'] || p?.href;
        if (!thumb) return null;
        return {
          id: `opencontext-${p?.uri || p?.href || Math.random().toString(36).slice(2)}`,
          title: p?.label || p?.['label'] || 'Archaeological record',
          culture: p?.['oc-gen:has-context-path'] || p?.context || 'Field record',
          date: p?.early_bce_ce ? String(p.early_bce_ce) : '',
          medium: p?.category || 'Artifact',
          imageUrl: thumb,
          thumbUrl: thumb,
          source: 'opencontext',
          sourceUrl: p?.uri || p?.href || 'https://opencontext.org',
          provenance: p?.['oc-api:has-context-path'] || undefined,
        };
      })
      .filter(Boolean) as Artifact[];
  } catch { return []; }
}

// ── Public API ────────────────────────────────────────────────────────────────
export interface SearchArtifactsOpts {
  limit?: number;
  sources?: ArtifactSource[];
  metDepartmentId?: number;
  signal?: AbortSignal;
}

function interleave(lists: Artifact[][]): Artifact[] {
  const out: Artifact[] = [];
  const max = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

/** Search artifacts across the keyless museum/archaeology sources. Never throws. */
export async function searchArtifacts(query: string, opts: SearchArtifactsOpts = {}): Promise<Artifact[]> {
  const limit = opts.limit ?? 30;
  const sources = opts.sources ?? ['met', 'artic', 'cleveland'];
  const key = `${query.toLowerCase()}|${limit}|${sources.join(',')}|${opts.metDepartmentId ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const per = Math.max(8, Math.ceil(limit / sources.length));
  const tasks: Promise<Artifact[]>[] = [];
  if (sources.includes('met')) tasks.push(searchMet(query, per, opts.metDepartmentId, opts.signal));
  if (sources.includes('artic')) tasks.push(searchArtic(query, per, opts.signal));
  if (sources.includes('cleveland')) tasks.push(searchCleveland(query, per, opts.signal));
  if (sources.includes('opencontext')) tasks.push(searchOpenContext(query, per, opts.signal));

  const settled = await Promise.allSettled(tasks);
  const lists = settled.map(s => (s.status === 'fulfilled' ? s.value : []));
  const merged = interleave(lists);
  const seen = new Set<string>();
  const deduped = merged.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true))).slice(0, limit);
  if (deduped.length) cache.set(key, deduped);
  return deduped;
}

/** Fetch a curated collection (uses its Met department + query where set). */
export async function fetchArtifactsByCollection(c: ArtifactCollection, opts: SearchArtifactsOpts = {}): Promise<Artifact[]> {
  return searchArtifacts(c.query, { ...opts, metDepartmentId: c.metDepartmentId ?? opts.metDepartmentId });
}

export function clearArtifactCache() { cache.clear(); }
