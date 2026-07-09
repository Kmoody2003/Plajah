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

// ── Museum: legendary creators (artists & writers) ─────────────────────────────
// Curated, factual profiles. No external portraits (dead-link/CORS risk) — the UI
// renders a gradient monogram from `color` + initials, so it's always reliable.
export interface Legend {
  name: string;
  role: 'Writer' | 'Artist' | 'Writer-Artist' | 'Studio';
  field: 'Comics' | 'Manga';
  era: string;
  knownFor: string;
  legacy: string;
  color: string;
}

export const COMIC_LEGENDS: Legend[] = [
  { name: 'Jack Kirby', role: 'Artist', field: 'Comics', era: '1940s–1980s', knownFor: 'Fantastic Four · X-Men · Captain America · New Gods', legacy: '“The King of Comics.” His dynamic, cosmic art built the Marvel Universe and the visual language of the superhero.', color: '#FF8C00' },
  { name: 'Stan Lee', role: 'Writer', field: 'Comics', era: '1960s–2000s', knownFor: 'Spider-Man · X-Men · Hulk · Avengers', legacy: 'Co-created Marvel’s pantheon and gave superheroes real, relatable humanity — flawed people behind the masks.', color: '#D40055' },
  { name: 'Will Eisner', role: 'Writer-Artist', field: 'Comics', era: '1930s–2000s', knownFor: 'The Spirit · A Contract with God', legacy: 'Pioneered sequential-art storytelling and championed the “graphic novel” as a serious literary form.', color: '#6B0099' },
  { name: 'Alan Moore', role: 'Writer', field: 'Comics', era: '1980s–', knownFor: 'Watchmen · V for Vendetta · From Hell', legacy: 'Redefined comics as literature with dense, deconstructive masterworks that changed what the medium could say.', color: '#0070FF' },
  { name: 'Frank Miller', role: 'Writer-Artist', field: 'Comics', era: '1980s–', knownFor: 'The Dark Knight Returns · Sin City · 300', legacy: 'Brought noir grit and cinematic edge that reshaped the modern superhero and inspired a generation of film.', color: '#E2473B' },
  { name: 'Neil Gaiman', role: 'Writer', field: 'Comics', era: '1989–', knownFor: 'The Sandman', legacy: 'Wove myth, dream and literary fantasy into comics’ most acclaimed saga — the first comic to win a literary award.', color: '#00C878' },
  { name: 'Hergé', role: 'Writer-Artist', field: 'Comics', era: '1929–1980s', knownFor: 'The Adventures of Tintin', legacy: 'Master of the “clear line” style; defined European comics (bande dessinée) for the world.', color: '#E7B24B' },
  { name: 'Charles Schulz', role: 'Writer-Artist', field: 'Comics', era: '1950–2000', knownFor: 'Peanuts', legacy: 'Turned a daily strip into a half-century meditation on childhood, failure and the human heart.', color: '#8B5CF6' },
];

export const MANGA_LEGENDS: Legend[] = [
  { name: 'Osamu Tezuka', role: 'Writer-Artist', field: 'Manga', era: '1946–1989', knownFor: 'Astro Boy · Black Jack · Phoenix', legacy: 'The “God of Manga.” Invented modern story-manga and its cinematic panel language; father of the industry.', color: '#D40055' },
  { name: 'Akira Toriyama', role: 'Writer-Artist', field: 'Manga', era: '1980s–2020s', knownFor: 'Dragon Ball · Dr. Slump', legacy: 'His action and crystalline clarity made shōnen a global phenomenon and defined a genre’s template.', color: '#FF8C00' },
  { name: 'Naoki Urasawa', role: 'Writer-Artist', field: 'Manga', era: '1980s–', knownFor: 'Monster · 20th Century Boys · Pluto', legacy: 'Master of the literary thriller in manga form — meticulous, humane, endlessly suspenseful.', color: '#0070FF' },
  { name: 'Rumiko Takahashi', role: 'Writer-Artist', field: 'Manga', era: '1978–', knownFor: 'Ranma ½ · Inuyasha · Urusei Yatsura', legacy: 'One of the best-selling comic artists in history and the queen of the romantic comedy.', color: '#FF4D8D' },
  { name: 'Katsuhiro Otomo', role: 'Writer-Artist', field: 'Manga', era: '1980s–', knownFor: 'Akira', legacy: 'His hyper-detailed, kinetic vision brought cyberpunk manga — and anime — to the entire world.', color: '#00C878' },
  { name: 'Eiichiro Oda', role: 'Writer-Artist', field: 'Manga', era: '1997–', knownFor: 'One Piece', legacy: 'Author of the best-selling manga of all time — a decades-long adventure of staggering scale.', color: '#6B0099' },
  { name: 'Moto Hagio', role: 'Writer-Artist', field: 'Manga', era: '1969–', knownFor: 'The Poe Clan · They Were Eleven', legacy: 'Pioneer of the “Year 24 Group” who turned shōjo manga into rich, literary art.', color: '#8B5CF6' },
  { name: 'Go Nagai', role: 'Writer-Artist', field: 'Manga', era: '1967–', knownFor: 'Devilman · Mazinger Z · Cutie Honey', legacy: 'Created the piloted-robot and dark-fantasy genres that shaped decades of manga and anime.', color: '#E2473B' },
];

// ── Museum: history timelines ──────────────────────────────────────────────────
export interface HistoryEra { period: string; title: string; blurb: string; }

export const COMICS_HISTORY: HistoryEra[] = [
  { period: '1890s–1930s', title: 'The Strip & the Newsstand', blurb: 'Newspaper strips (Yellow Kid, Little Nemo, Krazy Kat) build a mass audience. In 1938 Action Comics #1 introduces Superman — and the comic book is born.' },
  { period: '1938–1956', title: 'The Golden Age', blurb: 'Superheroes explode — Superman, Batman, Wonder Woman, Captain America — as comics become a wartime and postwar staple for millions.' },
  { period: '1956–1970', title: 'The Silver Age', blurb: 'A science-fueled revival. Marvel’s Lee, Kirby and Ditko create flawed, human heroes — Spider-Man, the X-Men, the Fantastic Four — that redefine the genre.' },
  { period: '1970–1985', title: 'The Bronze Age', blurb: 'Stories grow darker and socially aware — addiction, race, grief — while horror and sword-and-sorcery push the medium’s boundaries.' },
  { period: '1986–Today', title: 'The Modern Age', blurb: 'Watchmen and The Dark Knight Returns legitimize comics as literature. Independent presses and the graphic-novel movement broaden who tells stories, and how.' },
];

export const MANGA_HISTORY: HistoryEra[] = [
  { period: 'Edo–1930s', title: 'Roots', blurb: 'From Hokusai’s sketch “manga” to early 20th-century strips and kamishibai street theatre, Japan builds a deep visual-story tradition.' },
  { period: '1945–1960s', title: 'Story Manga is Born', blurb: 'Osamu Tezuka’s cinematic New Treasure Island and Astro Boy establish modern, novelistic manga — long-form, emotional, and drawn like film.' },
  { period: '1968–1980s', title: 'The Shōnen Boom', blurb: 'Weekly Shōnen Jump launches. Serialized action, sports and adventure reach tens of millions and set the industry’s engine running.' },
  { period: '1970s', title: 'The Shōjo Revolution', blurb: 'The “Year 24 Group” (Hagio, Takemiya and peers) transforms girls’ manga into psychologically rich, boundary-pushing literary work.' },
  { period: '1990s–Today', title: 'The Global Era', blurb: 'Dragon Ball, Sailor Moon, One Piece and Naruto break out worldwide. Digital publishing and simultaneous translation make manga a global language.' },
];
