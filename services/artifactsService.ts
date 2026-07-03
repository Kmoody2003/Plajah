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

export type ArtifactSource = 'met' | 'artic' | 'cleveland' | 'opencontext' | 'smithsonian' | 'europeana';

// Free API keys. Both sources stay dormant (return []) until a key is set — the
// browser already works on the four keyless sources above. Smithsonian needs a
// REAL api.data.gov key (the shared DEMO_KEY 429s under its per-object fetches);
// Europeana needs a free wskey. Set VITE_SMITHSONIAN_KEY / VITE_EUROPEANA_KEY in
// the build env (see .env.example).
const SMITHSONIAN_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SMITHSONIAN_KEY) || 'DEMO_KEY';
const EUROPEANA_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_EUROPEANA_KEY) || '';

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

// ── Smithsonian Open Access (api.si.edu — 3M+ CC0 objects, incl. 3D) ──────────
// The search endpoint returns only summary rows, so images require a per-object
// content fetch (like the Met). That volume needs a real api.data.gov key — the
// shared DEMO_KEY 429s almost immediately — so this source stays dormant until
// VITE_SMITHSONIAN_KEY is set to a real key (get one free at api.data.gov/signup).
const smithsonianEnabled = () => !!SMITHSONIAN_KEY && SMITHSONIAN_KEY !== 'DEMO_KEY';

function smImage(m: any): { full?: string; thumb?: string } {
  if (!m) return {};
  const full = m.content || m.resources?.[0]?.url || m.idsId && `https://ids.si.edu/ids/deliveryService?id=${m.idsId}` || m.thumbnail;
  return { full, thumb: m.thumbnail || full };
}

async function searchSmithsonian(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  if (!smithsonianEnabled()) return [];
  try {
    const url = `https://api.si.edu/openaccess/api/v1.0/search?api_key=${SMITHSONIAN_KEY}` +
      `&q=${encodeURIComponent(`${query} AND online_media_type:"Images"`)}&rows=${limit * 3}`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = await res.json();
    const ids: string[] = (data?.response?.rows ?? []).map((r: any) => r.id).filter(Boolean);
    const out: Artifact[] = [];
    for (const id of ids) {
      if (out.length >= limit) break;
      try {
        const cRes = await fetch(`https://api.si.edu/openaccess/api/v1.0/content/${encodeURIComponent(id)}?api_key=${SMITHSONIAN_KEY}`, { signal: AbortSignal.timeout(7000) });
        if (!cRes.ok) continue;
        const cd = await cRes.json();
        const resp = cd?.response ?? {};
        const c = resp.content ?? {};
        const dnr = c.descriptiveNonRepeating ?? {};
        const media: any[] = dnr?.online_media?.media ?? [];
        const img = media.find(m => m?.type === 'Images') || media[0];
        const { full, thumb } = smImage(img);
        if (!full && !thumb) continue;
        const idx = c.indexedStructured ?? {};
        const media3d = media.find(m => m?.type === '3D Images' || m?.type === '3D');
        out.push({
          id: `smithsonian-${id}`,
          title: resp.title || dnr?.title?.content || 'Untitled',
          culture: idx.culture?.[0] || idx.name?.[0] || 'Smithsonian',
          date: idx.date?.[0] || '',
          medium: idx.object_type?.[0] || '',
          imageUrl: (full || thumb) as string,
          thumbUrl: (thumb || full) as string,
          source: 'smithsonian',
          sourceUrl: dnr?.record_link || dnr?.guid || 'https://www.si.edu',
          provenance: idx.place?.[0] || undefined,
          model3dUrl: media3d ? smImage(media3d).full : undefined,
        });
      } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}

// Smithsonian 3D scans — CC0 3D models (3d.si.edu). Same key/enable rule as above.
async function searchSmithsonian3D(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  if (!smithsonianEnabled()) return [];
  try {
    const q = query && query.trim() ? `${query} AND online_media_type:"3D Images"` : 'online_media_type:"3D Images"';
    const url = `https://api.si.edu/openaccess/api/v1.0/search?api_key=${SMITHSONIAN_KEY}&q=${encodeURIComponent(q)}&rows=${limit * 2}`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = await res.json();
    const ids: string[] = (data?.response?.rows ?? []).map((r: any) => r.id).filter(Boolean);
    const out: Artifact[] = [];
    for (const id of ids) {
      if (out.length >= limit) break;
      try {
        const cRes = await fetch(`https://api.si.edu/openaccess/api/v1.0/content/${encodeURIComponent(id)}?api_key=${SMITHSONIAN_KEY}`, { signal: AbortSignal.timeout(7000) });
        if (!cRes.ok) continue;
        const cd = await cRes.json();
        const resp = cd?.response ?? {};
        const c = resp.content ?? {};
        const dnr = c.descriptiveNonRepeating ?? {};
        const media: any[] = dnr?.online_media?.media ?? [];
        const m3d = media.find(m => /3d/i.test(m?.type || ''));
        const model = m3d ? (smImage(m3d).full || m3d.content || m3d.viewerUrl) : null;
        if (!model) continue;
        const imgMedia = media.find(m => m?.type === 'Images') || m3d;
        const { thumb } = smImage(imgMedia);
        const idx = c.indexedStructured ?? {};
        out.push({
          id: `smithsonian3d-${id}`,
          title: resp.title || dnr?.title?.content || 'Untitled',
          culture: idx.culture?.[0] || idx.name?.[0] || 'Smithsonian',
          date: idx.date?.[0] || '',
          medium: idx.object_type?.[0] || '3D scan',
          imageUrl: (thumb || model) as string,
          thumbUrl: (thumb || model) as string,
          source: 'smithsonian',
          sourceUrl: dnr?.record_link || dnr?.guid || 'https://3d.si.edu',
          provenance: idx.place?.[0] || undefined,
          model3dUrl: model as string,
        });
      } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}

/** Search only artifacts that have an interactive 3D scan — Smithsonian Open
 *  Access 3D + Europeana 3D objects, interleaved so both are represented. */
export async function fetchArtifacts3D(query: string, opts: { limit?: number; signal?: AbortSignal } = {}): Promise<Artifact[]> {
  const limit = opts.limit ?? 30;
  const key = `3d|${(query || '').toLowerCase()}|${limit}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const per = Math.ceil(limit / 2);
  const settled = await Promise.allSettled([
    searchSmithsonian3D(query, per, opts.signal),
    searchEuropeana3D(query, per, opts.signal),
  ]);
  const lists = settled.map(s => (s.status === 'fulfilled' ? s.value : []));
  const merged = interleave(lists).slice(0, limit);
  if (merged.length) cache.set(key, merged);
  return merged;
}

// ── Europeana (58M+ items from Europe's museums, libraries & archives) ────────
// Requires a free wskey (api.europeana.eu). Skips itself when no key is set.
async function searchEuropeana(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  if (!EUROPEANA_KEY) return [];
  try {
    const url = `https://api.europeana.eu/record/v2/search.json?wskey=${EUROPEANA_KEY}` +
      `&query=${encodeURIComponent(query)}&rows=${limit}&media=true&thumbnail=true&qf=TYPE:IMAGE&reusability=open&profile=rich`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = data?.items ?? [];
    return items
      .filter(i => i?.edmPreview?.[0] || i?.edmIsShownBy?.[0])
      .map((i: any): Artifact => ({
        id: `europeana-${i.id}`,
        title: (i.title?.[0]) || (i.dcTitleLangAware && Object.values(i.dcTitleLangAware)[0]?.[0]) || 'Untitled',
        culture: i.dataProvider?.[0] || i.dcCreator?.[0] || 'Europeana',
        date: i.year?.[0] || '',
        medium: i.type || '',
        imageUrl: i.edmIsShownBy?.[0] || i.edmPreview?.[0],
        thumbUrl: i.edmPreview?.[0] || i.edmIsShownBy?.[0],
        source: 'europeana',
        sourceUrl: i.guid || (i.edmIsShownAt?.[0]) || `https://www.europeana.eu/item${i.id}`,
        provenance: i.country?.[0] || undefined,
      }));
  } catch { return []; }
}

// Europeana 3D objects (TYPE:3D) — models from Europe's museums, libraries & archives.
async function searchEuropeana3D(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  if (!EUROPEANA_KEY) return [];
  try {
    const q = query && query.trim() ? query.trim() : '*';
    const url = `https://api.europeana.eu/record/v2/search.json?wskey=${EUROPEANA_KEY}` +
      `&query=${encodeURIComponent(q)}&rows=${limit}&media=true&thumbnail=true&qf=TYPE:3D&reusability=open&profile=rich`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = data?.items ?? [];
    return items.map((i: any): Artifact => {
      const model = i.edmIsShownBy?.[0] || i.edmIsShownAt?.[0] || i.guid;
      return {
        id: `europeana3d-${i.id}`,
        title: (i.title?.[0]) || (i.dcTitleLangAware && Object.values(i.dcTitleLangAware)[0]?.[0]) || 'Untitled',
        culture: i.dataProvider?.[0] || i.dcCreator?.[0] || 'Europeana',
        date: i.year?.[0] || '',
        medium: '3D model',
        imageUrl: i.edmPreview?.[0] || model,
        thumbUrl: i.edmPreview?.[0] || model,
        source: 'europeana',
        sourceUrl: i.guid || (i.edmIsShownAt?.[0]) || `https://www.europeana.eu/item${i.id}`,
        provenance: i.country?.[0] || undefined,
        model3dUrl: model,
      };
    }).filter(a => a.model3dUrl);
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
  const sources = opts.sources ?? ['met', 'artic', 'cleveland', 'smithsonian', 'europeana'];
  const key = `${query.toLowerCase()}|${limit}|${sources.join(',')}|${opts.metDepartmentId ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const per = Math.max(8, Math.ceil(limit / sources.length));
  const tasks: Promise<Artifact[]>[] = [];
  if (sources.includes('met')) tasks.push(searchMet(query, per, opts.metDepartmentId, opts.signal));
  if (sources.includes('artic')) tasks.push(searchArtic(query, per, opts.signal));
  if (sources.includes('cleveland')) tasks.push(searchCleveland(query, per, opts.signal));
  if (sources.includes('opencontext')) tasks.push(searchOpenContext(query, per, opts.signal));
  if (sources.includes('smithsonian')) tasks.push(searchSmithsonian(query, per, opts.signal));
  if (sources.includes('europeana')) tasks.push(searchEuropeana(query, per, opts.signal));

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
