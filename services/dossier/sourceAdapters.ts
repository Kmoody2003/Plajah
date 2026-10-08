/**
 * Keyless open-archive adapters for the Dossier research agent.
 *
 * Rights mapping is deliberately conservative: anything not clearly public domain / CC0 / CC-BY
 * becomes 'unknown', which validateDossier() refuses to publish. Every candidate keeps the record
 * URL it was verified at so a human can audit the call.
 */
import type { DossierAsset, Rights, RightsStatus } from './dossierTypes';

export interface Candidate {
  source: 'loc' | 'commons';
  id: string;
  title: string;
  date?: string;
  creator?: string;
  imageUrl: string;
  recordUrl: string;
  width?: number;
  height?: number;
  rights: Rights;
}

type Fetcher = typeof fetch;
const UA = 'PlajahDossier/0.1 (research; contact kmoody2003@gmail.com)';
const TIMEOUT = 15000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const lastHit = new Map<string, number>();
/** Minimum gap between requests per host; loc.gov rate-limits aggressively. */
const MIN_GAP: Record<string, number> = { 'www.loc.gov': 1200 };

async function getJson(f: Fetcher, url: string, tries = 5): Promise<any> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const gap = MIN_GAP[host] ?? 0;
    const wait = (lastHit.get(host) ?? 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    const res = await f(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const ra = Number(res.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${res.status} ${url}`);
  }
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ── Library of Congress ───────────────────────────────────────────────────

export function locRightsFrom(text: string | undefined): RightsStatus {
  const t = (text ?? '').toLowerCase();
  if (!t) return 'unknown';
  if (/(not|no)\s+(known\s+)?(restrictions|copyright)|no known restrictions|public domain/.test(t) && !/(permission|license required|rights reserved|copyright (owned|held))/.test(t))
    return 'public-domain';
  return 'unknown';
}

export async function searchLoC(query: string, limit = 5, f: Fetcher = fetch): Promise<Candidate[]> {
  const search = await getJson(f, `https://www.loc.gov/pictures/search/?q=${encodeURIComponent(query)}&fo=json&c=${limit}`);
  const out: Candidate[] = [];
  for (const r of search.results ?? []) {
    try {
      const itemUrl: string = r.links.item;
      const detail = await getJson(f, `${itemUrl}?fo=json`);
      const it = detail.item ?? detail;
      const img: string | undefined = it.service_medium;
      if (!img) continue;
      const status = locRightsFrom(it.rights_information);
      out.push({
        source: 'loc',
        id: `loc-${r.pk}`,
        title: stripHtml(String(r.title)).replace(/^\[|\]$/g, ''),
        date: r.created_published_date,
        creator: it.creators?.[0]?.title,
        imageUrl: img,
        recordUrl: itemUrl,
        rights: {
          status,
          credit: `Library of Congress, Prints & Photographs Division${it.call_number ? `, ${it.call_number}` : ''}`,
          verifiedAt: itemUrl,
        },
      });
    } catch { /* one bad record never sinks the search */ }
  }
  return out;
}

// ── Wikimedia Commons ─────────────────────────────────────────────────────

export function commonsRightsFrom(license: string | undefined): RightsStatus {
  const l = (license ?? '').toLowerCase();
  if (/^public domain|^pd[- ]|cc0|no restrictions/.test(l)) return l.includes('cc0') ? 'cc0' : 'public-domain';
  if (/cc[- ]by[- ]sa/.test(l)) return 'cc-by-sa';
  if (/cc[- ]by(?![- ](nc|nd))/.test(l) && !/nc|nd/.test(l)) return 'cc-by';
  return 'unknown';
}

export async function searchCommons(query: string, limit = 5, f: Fetcher = fetch): Promise<Candidate[]> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6' +
    `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}&prop=imageinfo&iiprop=url|size|mime|extmetadata` +
    '&iiextmetadatafilter=LicenseShortName|Artist|DateTimeOriginal|ImageDescription&format=json&origin=*';
  const j = await getJson(f, url);
  const pages = Object.values<any>(j.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  const out: Candidate[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png|tiff)/.test(ii.mime ?? '')) continue;
    const md = ii.extmetadata ?? {};
    const license = md.LicenseShortName?.value as string | undefined;
    out.push({
      source: 'commons',
      id: `commons-${p.pageid}`,
      title: String(p.title).replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
      date: md.DateTimeOriginal?.value ? stripHtml(md.DateTimeOriginal.value).replace(/\s*date QS:.*$/i, '') : undefined,
      creator: md.Artist?.value ? stripHtml(md.Artist.value) : undefined,
      imageUrl: ii.url.split('?')[0],
      recordUrl: ii.descriptionurl,
      width: ii.width,
      height: ii.height,
      rights: {
        status: commonsRightsFrom(license),
        credit: `${md.Artist?.value ? stripHtml(md.Artist.value) : 'Unknown author'} via Wikimedia Commons${license ? ` (${license})` : ''}`,
        verifiedAt: ii.descriptionurl,
      },
    });
  }
  return out;
}

/** Candidate -> DossierAsset once a human or the pedagogy agent has chosen it for a claim. */
export function toAsset(c: Candidate, claimIds: string[], kind: DossierAsset['kind'] = 'photo'): DossierAsset {
  return { id: c.id, kind, title: c.title, url: c.imageUrl, rights: c.rights, claimIds };
}

/** Commons originals can be 10MB+; serve a standard-size thumbnail. */
export const commonsThumb = (url: string, width = 960): string => {
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/);
  return m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${width}px-${m[3]}` : url;
};
