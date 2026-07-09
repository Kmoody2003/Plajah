// comicsMangaService — free/open comic + manga sources for Lorea's library & museum.
//
//  • Comics:  Internet Archive hosts vast PUBLIC-DOMAIN Golden/Silver-Age comics
//             (Digital Comic Museum, Comic Book Plus mirrors) — genuinely readable.
//  • Manga:   AniList (GraphQL, no key, CORS-open) provides rich metadata/history —
//             covers, descriptions, years, creators, genres. Manga *content* that's
//             free+legal is scarce (no scanlations), so manga is a metadata/history/
//             discovery experience that links out; only public-domain manga reads inline.
import { cached } from '../src/lib/performanceCache';
import type { ArchiveBook } from './archiveContentService';

const IA_SEARCH = 'https://archive.org/advancedsearch.php';

// ── Public-domain comics (Internet Archive) ────────────────────────────────────
export const COMIC_COLLECTIONS: { label: string; query: string }[] = [
  { label: 'Golden Age', query: 'collection:(comics OR goldenagecomics) AND mediatype:texts' },
  { label: 'Digital Comic Museum', query: 'collection:digitalcomicmuseum' },
  { label: 'Comic Book Plus', query: 'collection:comicbookplus' },
  { label: 'Newspaper Strips', query: 'subject:"comic strips" AND mediatype:texts' },
  { label: 'Sci-Fi & Horror', query: '(subject:"science fiction comics" OR subject:"horror comics") AND mediatype:texts' },
];

export const fetchArchiveComics = async (query = 'collection:comics AND mediatype:texts', limit = 30): Promise<ArchiveBook[]> => {
  return cached(`ia-comics:${query}:${limit}`, 1000 * 60 * 60, async () => {
    const params = new URLSearchParams({
      q: `${query} AND mediatype:texts`,
      fl: 'identifier,title,creator,date,subject,downloads',
      sort: 'downloads desc', rows: String(limit), output: 'json',
    });
    const res = await fetch(`${IA_SEARCH}?${params}`);
    if (!res.ok) throw new Error(`IA ${res.status}`);
    const data = await res.json();
    return (data.response?.docs || []).map((d: any): ArchiveBook => ({
      id: d.identifier,
      title: d.title || d.identifier,
      authors: Array.isArray(d.creator) ? d.creator : [d.creator || 'Unknown'],
      subjects: Array.isArray(d.subject) ? d.subject : (d.subject ? [d.subject] : ['Comics']),
      // IA comics read via their PDF or page images (same path BookTab uses for IA texts).
      formats: { 'application/pdf': `https://archive.org/download/${d.identifier}/${d.identifier}.pdf`, ia: d.identifier },
      download_count: d.downloads || 0,
      coverImage: `https://archive.org/services/img/${d.identifier}`,
      genre: 'Public-Domain Comics',
      year: Array.isArray(d.date) ? d.date[0] : d.date,
    } as ArchiveBook & { year?: string }));
  }).catch(() => []);
};

// archive.org almost never names its PDF exactly `<identifier>.pdf`, so the guessed
// download URL 404s and the reader opens a dead link. Resolve the REAL readable file
// from the item metadata: prefer a content PDF (not the OCR `_text.pdf`), then any PDF.
// Returns a proper download URL (path segments encoded, slashes preserved), or null.
export const resolveArchiveReadableUrl = async (identifier: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://archive.org/metadata/${identifier}`);
    if (!res.ok) return null;
    const data = await res.json();
    const files: Array<{ name: string }> = data?.files || [];
    const pdf =
      files.find(f => /\.pdf$/i.test(f.name) && !/_text\.pdf$/i.test(f.name)) ||
      files.find(f => /\.pdf$/i.test(f.name));
    if (!pdf) return null;
    const encoded = pdf.name.split('/').map(encodeURIComponent).join('/');
    return `https://archive.org/download/${identifier}/${encoded}`;
  } catch {
    return null;
  }
};

// ── Manga metadata / history (AniList) ─────────────────────────────────────────
export interface MangaEntry {
  id: number;
  title: string;
  nativeTitle?: string;
  description?: string;
  year?: number;
  coverImage?: string;
  bannerImage?: string;
  genres: string[];
  score?: number;
  staff: string[];
  siteUrl?: string;
  country?: string;   // JP (manga) / KR (manhwa) / CN (manhua)
}

const ANILIST = 'https://graphql.anilist.co';
const MANGA_QUERY = `
query ($page:Int,$sort:[MediaSort],$search:String,$year:FuzzyDateInt){
  Page(page:$page, perPage:30){
    media(type:MANGA, sort:$sort, search:$search, startDate_greater:$year, isAdult:false){
      id title{english romaji native} description(asHtml:false)
      startDate{year} coverImage{large} bannerImage genres averageScore
      countryOfOrigin siteUrl staff(perPage:3){edges{node{name{full}}}}
    }
  }
}`;

const mapManga = (m: any): MangaEntry => ({
  id: m.id,
  title: m.title?.english || m.title?.romaji || m.title?.native || 'Untitled',
  nativeTitle: m.title?.native,
  description: (m.description || '').replace(/<[^>]+>/g, '').trim(),
  year: m.startDate?.year || undefined,
  coverImage: m.coverImage?.large,
  bannerImage: m.bannerImage || undefined,
  genres: m.genres || [],
  score: m.averageScore || undefined,
  staff: (m.staff?.edges || []).map((e: any) => e.node?.name?.full).filter(Boolean),
  siteUrl: m.siteUrl,
  country: m.countryOfOrigin,
});

/** Manga discovery/history via AniList. sort: 'POPULARITY_DESC' | 'START_DATE' | 'SCORE_DESC'. */
export const fetchAnilistManga = async (
  opts: { sort?: string; search?: string; sinceYear?: number; limit?: number } = {},
): Promise<MangaEntry[]> => {
  const sort = opts.sort || 'POPULARITY_DESC';
  const key = `anilist:${sort}:${opts.search || ''}:${opts.sinceYear || ''}`;
  return cached(key, 1000 * 60 * 30, async () => {
    const res = await fetch(ANILIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: MANGA_QUERY, variables: { page: 1, sort: [sort], search: opts.search || undefined, year: opts.sinceYear ? opts.sinceYear * 10000 : undefined } }),
    });
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const data = await res.json();
    return (data?.data?.Page?.media || []).map(mapManga);
  }).catch(() => []);
};

// Manga "eras" for the history/museum experience.
export const MANGA_ERAS: { label: string; since: number; note: string }[] = [
  { label: 'Post-war Foundations', since: 1945, note: 'Tezuka & the birth of story manga' },
  { label: 'Shōnen Boom', since: 1968, note: 'Weekly Shōnen Jump era begins' },
  { label: 'Golden 80s–90s', since: 1985, note: 'Global breakout classics' },
  { label: 'Modern', since: 2005, note: 'Digital + worldwide simulpub' },
];
