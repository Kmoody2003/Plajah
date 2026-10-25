/** Extra open collections for the museum layer: Wikimedia Commons, Library of Congress, Harvard Art Museums (keyed). Never throw. */
import type { Artifact } from '../artifactsService';

const env = (typeof process !== 'undefined' && (process as any).env) || {};
const vite = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
const HARVARD_KEY: string = vite.VITE_HARVARD_KEY || env.HARVARD_ART_MUSEUMS_KEY || '';
const t = (s?: string) => (s || '').replace(/<[^>]+>/g, '').trim();

/** Wikimedia Commons — only files whose licence is public domain, CC0 or CC BY(-SA). */
export async function searchCommons(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}` +
      `&gsrnamespace=6&gsrlimit=${Math.min(50, limit * 3)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=600&format=json&origin=*`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const pages = Object.values((await res.json())?.query?.pages ?? {}) as any[];
    return pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).flatMap((p): Artifact[] => {
      const ii = p.imageinfo?.[0]; const m = ii?.extmetadata ?? {};
      const lic = String(m.LicenseShortName?.value ?? '');
      if (!ii?.url || !/^(public domain|pd|cc0|cc by|cc-by)/i.test(lic)) return [];
      return [{
        id: `commons-${p.pageid}`, title: String(p.title).replace(/^File:/, '').replace(/\.\w+$/, '').replace(/_/g, ' '),
        culture: t(m.Artist?.value) || 'Wikimedia Commons', date: t(m.DateTimeOriginal?.value), medium: t(m.ImageDescription?.value).slice(0, 120),
        imageUrl: ii.url, thumbUrl: ii.thumburl || ii.url, source: 'commons',
        sourceUrl: ii.descriptionurl || `https://commons.wikimedia.org/?curid=${p.pageid}`, provenance: lic,
      }];
    }).slice(0, limit);
  } catch { return []; }
}

/** Library of Congress Prints & Photographs — pre-1930 images only (US public domain). */
export async function searchLoc(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  try {
    const url = `https://www.loc.gov/photos/?q=${encodeURIComponent(query)}&fo=json&c=${Math.min(40, limit * 3)}&fa=online-format:image`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const out: Artifact[] = [];
    for (const r of (await res.json())?.results ?? []) {
      const yr = String(r.date || r.title || '').match(/\b(1[0-9]{3})\b/); if (!yr || +yr[1] > 1929) continue;
      const imgs: string[] = (Array.isArray(r.image_url) ? r.image_url : []).filter((u: string) => /\.(jpe?g|png)/i.test(u));
      if (!imgs.length || !r.title) continue;
      const full = (imgs.find(u => /v\.jpg/i.test(u)) || imgs.find(u => /r\.jpg/i.test(u)) || imgs[imgs.length - 1]).split('#')[0];
      out.push({ id: `loc-${r.id || r.url}`, title: String(r.title).trim(), culture: Array.isArray(r.contributor) ? r.contributor[0] : 'Library of Congress', date: String(r.date || yr[1]).slice(0, 4),
        medium: Array.isArray(r.original_format) ? r.original_format[0] : 'Print / photograph', imageUrl: full, thumbUrl: (imgs.find(u => /150px|t\.gif/i.test(u)) || full).split('#')[0],
        source: 'loc', sourceUrl: String(r.url || r.id).replace(/^http:/, 'https:') });
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

/** Harvard Art Museums — needs HARVARD_ART_MUSEUMS_KEY (free: harvardartmuseums.org/collections/api). Dormant without it. */
export async function searchHarvard(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  if (!HARVARD_KEY) return [];
  try {
    const url = `https://api.harvardartmuseums.org/object?apikey=${HARVARD_KEY}&q=${encodeURIComponent(query)}&hasimage=1&size=${limit}&sort=rank&sortorder=desc&fields=id,title,people,dated,medium,primaryimageurl,url,culture,imagepermissionlevel`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    return ((await res.json())?.records ?? []).filter((o: any) => o.primaryimageurl && !o.imagepermissionlevel).map((o: any): Artifact => ({
      id: `harvard-${o.id}`, title: o.title || 'Untitled', culture: o.people?.[0]?.name || o.culture || 'Harvard Art Museums', date: o.dated || '', medium: o.medium || '',
      imageUrl: o.primaryimageurl, thumbUrl: `${o.primaryimageurl}?height=600&width=600`, source: 'harvard', sourceUrl: o.url,
    }));
  } catch { return []; }
}

// ── Rijksmuseum (Linked Art; CORS-open, keyless) ─────────────────────────────
// search → object ids → object → VisualItem → DigitalObject (IIIF image). A few requests per work,
// so results are capped and resolved in parallel; person names are cached.
const LD = { Accept: 'application/ld+json' };
const rijksPeople = new Map<string, string>();
const ldGet = async (url: string, signal?: AbortSignal) => {
  const r = await fetch(url, { headers: LD, signal: signal ?? AbortSignal.timeout(9000) });
  return r.ok ? r.json() : null;
};
const enName = (d: any): string => {
  const names = (d?.identified_by ?? []).filter((i: any) => i?.type === 'Name' && i.content);
  const en = names.find((n: any) => (n.language ?? []).some((l: any) => /300388277/.test(l.id)));
  return String((en ?? names[0])?.content ?? '').replace(/�/g, '"');
};

export async function searchRijks(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  try {
    const seen = new Set<string>(); const ids: string[] = [];
    for (const field of ['title', 'description', 'creator']) {
      const r = await fetch(`https://data.rijksmuseum.nl/search/collection?${field}=${encodeURIComponent(query)}&imageAvailable=true`, { signal: signal ?? AbortSignal.timeout(9000) });
      if (!r.ok) continue;
      for (const it of (await r.json())?.orderedItems ?? []) if (it.id && !seen.has(it.id)) { seen.add(it.id); ids.push(it.id); }
      if (ids.length >= limit * 2) break;
    }
    const works = await Promise.all(ids.slice(0, limit * 2).map(async (id): Promise<Artifact | null> => {
      try {
        const o = await ldGet(id, signal); if (!o) return null;
        const vi = o.shows?.[0]?.id; const vd = vi ? await ldGet(vi, signal) : null;
        const doId = vd?.digitally_shown_by?.[0]?.id; const dobj = doId ? await ldGet(doId, signal) : null;
        const iiif = dobj?.access_point?.[0]?.id as string | undefined; if (!iiif) return null;
        const base = iiif.replace(/\/full\/.*$/, '');
        const maker = o.produced_by?.part?.[0]?.carried_out_by?.[0]?.id ?? o.produced_by?.carried_out_by?.[0]?.id;
        let artist = 'Rijksmuseum';
        if (maker) { if (!rijksPeople.has(maker)) { const p = await ldGet(maker, signal); rijksPeople.set(maker, p ? enName(p) : ''); } artist = rijksPeople.get(maker) || artist; }
        const date = o.produced_by?.timespan?.identified_by?.find((n: any) => n.content)?.content ?? o.produced_by?.part?.[0]?.timespan?.identified_by?.[0]?.content ?? '';
        return { id: `rijks-${id.split('/').pop()}`, title: enName(o) || 'Untitled', culture: artist, date: String(date), medium: '',
          imageUrl: `${base}/full/1600,/0/default.jpg`, thumbUrl: `${base}/full/600,/0/default.jpg`, source: 'rijks', sourceUrl: `https://www.rijksmuseum.nl/en/collection/${(o.identified_by ?? []).find((i: any) => /^[A-Z]{2}-/.test(i.content ?? ''))?.content ?? ''}` };
      } catch { return null; }
    }));
    return works.filter(Boolean).slice(0, limit) as Artifact[];
  } catch { return []; }
}

// ── Digital Public Library of America (aggregates US libraries, archives, museums) ───────────
// Needs a free key (DPLA_API_KEY, emailed on request). Dormant without it. The API only returns
// thumbnails (`object`) plus a link to the holding institution, so thumbUrl === imageUrl here.
const DPLA_KEY: string = (typeof process !== 'undefined' && (process as any).env?.DPLA_API_KEY) || '';
const OPEN_RIGHTS = /publicdomain|NoC-US|NoC-OKLR|\/zero\/|creativecommons\.org\/licenses\/by(-sa)?\//i;
const first = (v: any): string => String(Array.isArray(v) ? v[0] ?? '' : v ?? '');

export const dplaEnabled = () => !!DPLA_KEY;

export async function searchDpla(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  if (!DPLA_KEY) return [];
  try {
    const url = `https://api.dp.la/v2/items?q=${encodeURIComponent(query)}&api_key=${DPLA_KEY}&page_size=${Math.min(100, limit * 10)}` +
      `&sourceResource.type=image&fields=id,object,isShownAt,rights,dataProvider,sourceResource.title,sourceResource.creator,sourceResource.date,sourceResource.rights,sourceResource.format`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const out: Artifact[] = [];
    for (const d of (await res.json())?.docs ?? []) {
      // With a `fields` filter DPLA returns flattened keys ("sourceResource.title"); without, nested objects.
      const g = (k: string) => d[`sourceResource.${k}`] ?? d.sourceResource?.[k];
      const sr = { title: g('title'), creator: g('creator'), date: g('date'), format: g('format') };
      const img = first(d.object); const rights = first(d.rights ?? g('rights'));
      if (!img || !first(sr.title) || !OPEN_RIGHTS.test(rights)) continue;
      out.push({ id: `dpla-${d.id}`, title: first(sr.title), culture: first(sr.creator) || first(d.dataProvider?.name ?? d.dataProvider) || 'DPLA', date: first(sr.date?.displayDate ?? sr.date?.[0]?.displayDate),
        medium: first(sr.format), imageUrl: img, thumbUrl: img, source: 'dpla', sourceUrl: first(d.isShownAt) || `https://dp.la/item/${d.id}`, provenance: first(d.dataProvider?.name ?? d.dataProvider) || undefined });
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

// ── Wellcome Collection (keyless; strong Persian, Indian, East Asian & African manuscripts/prints) ──
// Only images with a PD/CC0/CC BY licence. IIIF base → sized derivatives.
export async function searchWellcome(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  try {
    const url = `https://api.wellcomecollection.org/catalogue/v2/works?query=${encodeURIComponent(query)}&pageSize=${Math.min(50, limit * 3)}` +
      `&include=items,contributors,production&items.locations.locationType=iiif-image&availabilities=online`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const out: Artifact[] = [];
    for (const w of (await res.json())?.results ?? []) {
      const loc = (w.items ?? []).flatMap((i: any) => i.locations ?? []).find((l: any) => l.locationType?.id === 'iiif-image' && /^(pdm|cc-by|cc0)$/.test(l.license?.id ?? ''));
      if (!loc?.url) continue;
      const base = String(loc.url).replace(/\/info\.json$/, '');
      out.push({ id: `wellcome-${w.id}`, title: w.title || 'Untitled', culture: w.contributors?.[0]?.agent?.label || 'Wellcome Collection',
        date: w.production?.[0]?.dates?.[0]?.label ?? '', medium: w.workType?.label ?? '', imageUrl: `${base}/full/!1600,1600/0/default.jpg`, thumbUrl: `${base}/full/!600,600/0/default.jpg`,
        source: 'wellcome', sourceUrl: `https://wellcomecollection.org/works/${w.id}`, provenance: loc.license?.label });
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

// ── Japan Search (jpsearch.go.jp — 270+ Japanese archives, libraries & museums; keyless) ─────────
// The API has no working rights/type filters, so we page results and keep only records that carry an
// image (`contentsUrl`) under an open licence. Yield is low on generic English words and high on
// art terms (ukiyo-e, samurai armor, ceramic…), so up to 3 pages of 100 are scanned.
const JPS_OPEN = /^(pdm|cc0|ccby|ccbysa)$/;
const JPS_RIGHTS: Record<string, string> = { pdm: 'Public domain', cc0: 'CC0', ccby: 'CC BY', ccbysa: 'CC BY-SA' };

export async function searchJapanSearch(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  const out: Artifact[] = []; const seen = new Set<string>();
  try {
    for (let page = 0; page < 3 && out.length < limit; page++) {
      const url = `https://jpsearch.go.jp/api/item/search/jps-cross?keyword=${encodeURIComponent(query)}&size=100&from=${page * 100}`;
      const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(15000) });
      if (!res.ok) break;
      const list: any[] = (await res.json())?.list ?? [];
      if (!list.length) break;
      for (const it of list) {
        const c = it.common ?? {};
        const img = Array.isArray(c.contentsUrl) ? c.contentsUrl[0] : c.contentsUrl;
        if (!img || !JPS_OPEN.test(String(c.contentsRightsType)) || seen.has(it.id)) continue;
        seen.add(it.id);
        const maker = (Array.isArray(c.contributor) ? c.contributor : []).filter((x: string) => x && !/博物館|美術館|museum/i.test(x))[0];
        out.push({ id: `jps-${it.id}`, title: String(c.title ?? '').trim() || 'Untitled', culture: maker || (c.provider && !/^[a-z_]+$/.test(c.provider) ? c.provider : 'Japan Search'),
          date: Array.isArray(c.temporal) ? String(c.temporal[0] ?? '') : '', medium: Array.isArray(c.category) ? c.category.join(', ') : '',
          imageUrl: img, thumbUrl: img, source: 'jps', sourceUrl: String(c.linkUrl ?? '').replace(/^http:/, 'https:') || 'https://jpsearch.go.jp',
          provenance: JPS_RIGHTS[c.contentsRightsType] });
        if (out.length >= limit) break;
      }
    }
  } catch { /* return what we have */ }
  return out;
}

// ── National Palace Museum, Taipei — via its open-data images on Wikimedia Commons ──────────────
// npm.gov.tw's own open-data portal sits behind bot protection, so we use the museum's uploads on
// Commons (CC0 / public domain, with the museum named in the file description).
export async function searchNpm(query: string, limit: number, signal?: AbortSignal): Promise<Artifact[]> {
  const works = await searchCommons(`${query} "National Palace Museum"`, limit, signal);
  return works.filter(w => /^(public domain|cc0|cc by)/i.test(w.provenance ?? ''))
    .map(w => ({ ...w, id: w.id.replace(/^commons-/, 'npm-'), source: 'npm' as const, culture: 'National Palace Museum, Taipei' })); // Commons' "artist" is usually the photographer, so credit the holding museum
}
