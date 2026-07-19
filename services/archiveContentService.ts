
import { cached } from '../src/lib/performanceCache';

export interface ArchiveBook {
  id: string;
  title: string;
  authors: string[];
  subjects: string[];
  formats: { [key: string]: string };
  download_count: number;
  coverImage?: string;
  genre?: string;
}

export interface ArchiveVideo {
  identifier: string;
  title: string;
  description: string;
  mediatype: string;
  collection: string[];
  genre?: string;
  thumbnailUrl?: string;
  year?: string;
  runtime?: string;
}

/**
 * PRIMARY axis of the Vault taxonomy — what *type of audio* a recording is.
 * This is deliberately orthogonal to genre: "Jazz" is a subgenre of MUSIC,
 * "Trending" is a sort, and neither belongs on this axis.
 */
export type AudioKind =
  | 'MUSIC'
  | 'HISTORIC'
  | 'SPEECH'
  | 'AUDIOBOOK'
  | 'PODCAST'
  | 'FIELD_RECORDING'
  | 'INTERVIEW';

/** Ranking axis. Never a category — a recording is not "a Trending". */
export type VaultSort = 'TRENDING' | 'RECENT' | 'OLDEST' | 'AZ';

export interface ArchiveTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  thumbnailUrl: string;
  source: 'INTERNET_ARCHIVE' | 'WIKIMEDIA' | 'JAMENDO' | 'SOUND_CLOUD' | 'AUDIUS' | 'LIBRARY_OF_CONGRESS';
  genre?: string;
  year?: string;
  license?: string;
  duration?: number;

  // ── Taxonomy + context (all optional: nothing existing breaks) ──────────
  /** PRIMARY axis — type of audio. */
  kind?: AudioKind;
  /** SECONDARY axis — genre/subcategory, scoped to `kind`. */
  subgenre?: string;
  /** What this recording actually is, in the archive's own words. */
  description?: string;
  /** Compact provenance line: label, matrix/take, format, place. */
  context?: string;
  /** Human-facing catalogue page for the item (never the media file). */
  sourcePageUrl?: string;
  /** Named archival collection the item belongs to. */
  collection?: string;
  /** Rights / reuse statement as published by the holding institution. */
  rights?: string;
  /** Marked as useful to the Chora Conservatory (see fetchConservatoryRecordings). */
  conservatory?: boolean;
}

const GUTENDEX_BASE = 'https://gutendex.com/books';
const INTERNET_ARCHIVE_BASE = 'https://archive.org/advancedsearch.php';
const INTERNET_ARCHIVE_DETAILS = 'https://archive.org/metadata';
const LOC_BASE = 'https://www.loc.gov';
const ARXIV_BASE = 'https://export.arxiv.org/api/query';

const viaProxy = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;

// ── Library of Congress (native loc.gov JSON API) ──────────────────────────
// Open-access digitized books with downloadable PDFs — no IA mirror involved.
/** Fetch a single archive.org item as an ArchiveVideo — for deep-linked film shares. */
export const fetchArchiveVideoById = async (identifier: string): Promise<ArchiveVideo | null> => {
  try {
    const res = await fetch(`${INTERNET_ARCHIVE_DETAILS}/${encodeURIComponent(identifier)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const m = data?.metadata;
    if (!m) return null;
    const asStr = (v: any) => (Array.isArray(v) ? v[0] : v);
    return {
      identifier,
      title: asStr(m.title) || identifier,
      description: typeof m.description === 'string' ? m.description : (Array.isArray(m.description) ? m.description.join(' ') : ''),
      mediatype: asStr(m.mediatype) || 'movies',
      collection: Array.isArray(m.collection) ? m.collection : (m.collection ? [m.collection] : []),
      thumbnailUrl: `https://archive.org/services/img/${identifier}`,
      year: asStr(m.year) || asStr(m.date),
      runtime: asStr(m.runtime),
    };
  } catch { return null; }
};

export const fetchLibraryOfCongressBooks = async (query = '', limit = 30): Promise<ArchiveBook[]> => {
  return cached(`loc-books:${query}:${limit}`, 1000 * 60 * 60, async () => {
    const params = new URLSearchParams({ fo: 'json', c: String(limit) });
    if (query) params.set('q', query);
    const url = `${LOC_BASE}/collections/open-access-books/?${params.toString()}`;
    const response = await fetch(viaProxy(url));
    if (!response.ok) throw new Error(`LoC HTTP ${response.status}`);
    const data = await response.json();
    const results: any[] = data?.results || [];
    return results
      .map((r: any): ArchiveBook | null => {
        const pdf =
          r?.resources?.find((res: any) => res?.pdf)?.pdf ||
          (Array.isArray(r?.url) ? undefined : undefined);
        if (!pdf) return null; // only list items we can actually open
        const image = Array.isArray(r.image_url) ? r.image_url[r.image_url.length - 1] : r.image_url;
        return {
          id: `loc-${String(r.id || r.url || r.title).replace(/\W+/g, '-').slice(-60)}`,
          title: r.title || 'Untitled',
          authors: Array.isArray(r.contributor) ? r.contributor : (r.contributor ? [r.contributor] : ['Library of Congress']),
          subjects: Array.isArray(r.subject) ? r.subject : (r.subject ? [r.subject] : ['Open Access']),
          formats: { 'application/pdf': pdf },
          download_count: 0,
          coverImage: image,
          genre: 'Library of Congress',
        };
      })
      .filter(Boolean) as ArchiveBook[];
  }).catch((error) => {
    console.error('Error fetching Library of Congress books:', error);
    return [];
  });
};

// ── Research papers (arXiv) with discipline categorization ─────────────────
const ARXIV_DISCIPLINES: Array<[RegExp, string]> = [
  [/^cs\./, 'Computer Science'],
  [/^math\./, 'Mathematics'],
  [/^(physics|astro-ph|cond-mat|gr-qc|hep-|nucl-|quant-ph|nlin)/, 'Physics'],
  [/^q-bio\./, 'Biology'],
  [/^q-fin\./, 'Quantitative Finance'],
  [/^stat\./, 'Statistics'],
  [/^eess\./, 'Electrical Engineering'],
  [/^econ\./, 'Economics'],
];

export const disciplineForArxivCategory = (category: string): string => {
  for (const [re, label] of ARXIV_DISCIPLINES) if (re.test(category)) return label;
  return 'Interdisciplinary';
};

export const fetchResearchPapers = async (categoryPrefix = 'cs', limit = 30): Promise<ArchiveBook[]> => {
  return cached(`arxiv:${categoryPrefix}:${limit}`, 1000 * 60 * 30, async () => {
    const params = new URLSearchParams({
      search_query: `cat:${categoryPrefix}*`,
      sortBy: 'submittedDate',
      sortOrder: 'descending',
      max_results: String(limit),
    });
    const response = await fetch(viaProxy(`${ARXIV_BASE}?${params.toString()}`));
    if (!response.ok) throw new Error(`arXiv HTTP ${response.status}`);
    const xml = await response.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const entries = [...doc.querySelectorAll('entry')];
    return entries.map((entry): ArchiveBook => {
      const get = (sel: string) => entry.querySelector(sel)?.textContent?.trim() || '';
      const id = get('id');
      const arxivId = id.split('/abs/')[1] || id;
      const primaryCat =
        entry.querySelector('primary_category')?.getAttribute('term') ||
        entry.querySelector('category')?.getAttribute('term') || '';
      const pdfLink =
        [...entry.querySelectorAll('link')].find(l => l.getAttribute('title') === 'pdf')?.getAttribute('href') ||
        id.replace('/abs/', '/pdf/');
      const categories = [...entry.querySelectorAll('category')]
        .map(c => c.getAttribute('term') || '')
        .filter(Boolean);
      return {
        id: `arxiv-${arxivId}`,
        title: get('title').replace(/\s+/g, ' '),
        authors: [...entry.querySelectorAll('author > name')].map(n => n.textContent?.trim() || '').filter(Boolean),
        subjects: [disciplineForArxivCategory(primaryCat), ...categories],
        formats: { 'application/pdf': pdfLink.startsWith('http') ? pdfLink.replace(/^http:/, 'https:') : pdfLink },
        download_count: 0,
        coverImage: undefined,
        genre: disciplineForArxivCategory(primaryCat),
      };
    });
  }).catch((error) => {
    console.error('Error fetching research papers:', error);
    return [];
  });
};

export const fetchArchiveMusic = async (genre: string = 'Jazz', limit: number = 30): Promise<ArchiveTrack[]> => {
  try {
    // Improved query for better quality and relevance
    let query = '';
    // NOTE: the collections `78rpm_jazz` / `78rpm_classical` that used to appear
    // here return 0 results on archive.org (HTTP-verified). The live collections
    // are `78rpm` (307k items) and `georgeblood` (187k items).
    if (genre === 'Jazz') {
      query = 'mediatype:audio AND (subject:"jazz" OR subject:"jazz music")';
    } else if (genre === 'Classical') {
      query = 'mediatype:audio AND (subject:"classical" OR subject:"classical music")';
    } else if (genre === 'All') {
      query = 'mediatype:audio';
    } else {
      query = `mediatype:audio AND (subject:"${genre}" OR subject:"${genre.toLowerCase()}")`;
    }

    const params = new URLSearchParams({
      q: `${query} AND format:"VBR MP3"`,
      fl: 'identifier,title,creator,date,subject,mediatype,description,downloads',
      sort: 'downloads desc',
      rows: String(limit),
      output: 'json'
    });
    
    const targetUrl = `${INTERNET_ARCHIVE_BASE}?${params.toString()}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    const docs = data.response.docs;

    // Fetch meta for each to find real MP3 file
    const tracks = await Promise.all(docs.map(async (d: any) => {
      try {
        const files = await getArchiveItemFiles(d.identifier);
        // Look for VBR MP3 first, then regular MP3
        const mp3File = files.find((f: any) => f.name.endsWith('.vbr.mp3')) || 
                        files.find((f: any) => f.name.endsWith('.mp3'));
        
        if (!mp3File) return null;

        const rawUrl = `https://archive.org/download/${d.identifier}/${mp3File.name}`;
        
        return {
          id: d.identifier,
          title: d.title || mp3File.name.replace(/\.[^/.]+$/, ""),
          artist: d.creator || 'Historical Artist',
          url: rawUrl,
          thumbnailUrl: `https://archive.org/services/img/${d.identifier}`,
          source: 'INTERNET_ARCHIVE' as const,
          genre: Array.isArray(d.subject) ? d.subject[0] : (d.subject || genre),
          year: d.date
        };
      } catch (e) {
        return null;
      }
    }));

    return tracks.filter((t): t is ArchiveTrack => t !== null);
  } catch (error) {
    console.error('Error fetching archive music:', error);
    return [];
  }
};

export const fetchArchivePodcasts = async (limit: number = 30): Promise<ArchiveTrack[]> => {
  try {
    const params = new URLSearchParams({
      q: 'mediatype:audio AND (collection:podcasts OR subject:"podcast") AND format:"VBR MP3"',
      fl: 'identifier,title,creator,date,subject,mediatype,description,downloads',
      sort: 'downloads desc',
      rows: String(limit),
      output: 'json'
    });

    const targetUrl = `${INTERNET_ARCHIVE_BASE}?${params.toString()}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    const docs = data.response.docs;

    const tracks = await Promise.all(docs.map(async (d: any) => {
      try {
        const files = await getArchiveItemFiles(d.identifier);
        const mp3File = files.find((f: any) => f.name.endsWith('.vbr.mp3')) || 
                        files.find((f: any) => f.name.endsWith('.mp3'));
        
        if (!mp3File) return null;

        const rawUrl = `https://archive.org/download/${d.identifier}/${mp3File.name}`;
        
        return {
          id: d.identifier,
          title: d.title || mp3File.name.replace(/\.[^/.]+$/, ""),
          artist: d.creator || 'Archive Podcast',
          url: rawUrl,
          thumbnailUrl: `https://archive.org/services/img/${d.identifier}`,
          source: 'INTERNET_ARCHIVE' as const,
          genre: 'Podcast',
          year: d.date
        };
      } catch (e) {
        return null;
      }
    }));

    return tracks.filter((t): t is ArchiveTrack => t !== null);
  } catch (error) {
    console.error('Error fetching archive podcasts:', error);
    return [];
  }
};

export const fetchArchiveAudiobooks = async (limit: number = 20): Promise<ArchiveTrack[]> => {
  try {
    const params = new URLSearchParams({
      q: 'collection:(librivoxaudio OR audio_book) AND mediatype:audio AND format:"VBR MP3"',
      fl: 'identifier,title,creator,date,subject',
      sort: 'downloads desc',
      rows: String(limit),
      output: 'json'
    });
    
    const targetUrl = `${INTERNET_ARCHIVE_BASE}?${params.toString()}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    const docs = data.response.docs;

    const tracks = await Promise.all(docs.map(async (d: any) => {
      try {
        const files = await getArchiveItemFiles(d.identifier);
        const mp3File = files.find((f: any) => f.name.endsWith('.vbr.mp3')) || 
                        files.find((f: any) => f.name.endsWith('.mp3'));
        
        if (!mp3File) return null;

        const rawUrl = `https://archive.org/download/${d.identifier}/${mp3File.name}`;

        return {
          id: d.identifier,
          title: d.title || mp3File.name.replace(/\.[^/.]+$/, ""),
          artist: d.creator || 'Narration',
          url: rawUrl,
          thumbnailUrl: `https://archive.org/services/img/${d.identifier}`,
          source: 'INTERNET_ARCHIVE' as const,
          genre: 'Audiobook',
          year: d.date
        };
      } catch (e) {
        return null;
      }
    }));

    return tracks.filter((t): t is ArchiveTrack => t !== null);
  } catch (error) {
    return [];
  }
};

export const fetchWikimediaAudio = async (query: string = 'Classical_music', limit: number = 30): Promise<ArchiveTrack[]> => {
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      list: 'search',
      srsearch: `${query} (filetype:ogg OR filetype:mp3 OR filetype:wav)`,
      srnamespace: '6', // File namespace
      srlimit: String(limit)
    });
    
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
    const data = await response.json();
    const searchResults = data.query.search;

    const tracks = await Promise.all(searchResults.map(async (res: any) => {
      const infoParams = new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        prop: 'imageinfo',
        iiprop: 'url|extmetadata|mime',
        titles: res.title
      });
      const infoRes = await fetch(`https://commons.wikimedia.org/w/api.php?${infoParams.toString()}`);
      const infoData = await infoRes.json();
      const pages = infoData.query.pages;
      const pageId = Object.keys(pages)[0];
      const info = pages[pageId].imageinfo?.[0];

      if (!info) return null;
      
      // Basic check for browser compatibility or proxy need
      const isOgg = info.mime === 'audio/ogg' || info.url.endsWith('.ogg');

      return {
        id: res.pageid,
        title: res.title.replace('File:', '').replace(/\.[^/.]+$/, ""),
        artist: info.extmetadata?.Artist?.value?.replace(/<[^>]*>?/gm, '') || 'Wikimedia Contributor',
        url: info.url,
        thumbnailUrl: 'https://commons.wikimedia.org/static/images/mobile/copyright/wikipedia-wordmark-en.svg',
        source: 'WIKIMEDIA' as const,
        license: info.extmetadata?.LicenseShortName?.value
      };
    }));

    return tracks.filter((t): t is ArchiveTrack => t !== null);
  } catch (error) {
    console.error('Error fetching Wikimedia audio:', error);
    return [];
  }
};

export const fetchJamendoMusic = async (limit: number = 30): Promise<ArchiveTrack[]> => {
  const CLIENT_ID = '56d30c95'; // Sample public client ID for Jamendo if possible, or dummy
  try {
    const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=jsonpretty&limit=${limit}&include=musicinfo&order=popularity_total`);
    const data = await response.json();
    
    return data.results.map((t: any) => ({
      id: t.id,
      title: t.name,
      artist: t.artist_name,
      url: t.audio,
      thumbnailUrl: t.image,
      source: 'JAMENDO' as const,
      genre: t.musicinfo?.genre,
      duration: t.duration
    }));
  } catch (error) {
    console.error('Error fetching Jamendo music:', error);
    return [];
  }
};

export const fetchSoundCloudCC = async (query: string = 'Classical', limit: number = 30): Promise<ArchiveTrack[]> => {
  // SoundCloud public API often requires a Client ID that isn't easily obtained without a developer account.
  // Using a known "discovery" pattern or a placeholder if unauthorized.
  // For this implementation, we will use a public discovery approach if available or mock with CC tracks.
  try {
    // Note: This is an example of how one might fetch, though real SC API usually needs a client_id
    // We'll use a placeholder for now that mimics the structure.
    return [];
  } catch (error) {
    return [];
  }
};

export const fetchArchiveBooks = async (query: string = 'mediatype:texts', limit: number = 30): Promise<ArchiveBook[]> => {
  return cached(`archive-books:${query}:${limit}`, 1000 * 60 * 60, async () => {
    const params = new URLSearchParams({
      q: `${query} AND mediatype:texts`,
      fl: 'identifier,title,creator,description,publisher,date,subject',
      sort: 'downloads desc',
      rows: String(limit),
      output: 'json'
    });
    
    const targetUrl = `${INTERNET_ARCHIVE_BASE}?${params.toString()}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    const docs = data.response.docs;

    return docs.map((d: any) => ({
      id: d.identifier,
      title: d.title || 'Untitled Archive Book',
      authors: Array.isArray(d.creator) ? d.creator : [d.creator || 'Unknown Author'],
      subjects: Array.isArray(d.subject) ? d.subject : [d.subject || 'Public Domain'],
      formats: { 'pdf': `https://archive.org/download/${d.identifier}/${d.identifier}.pdf` },
      download_count: 0,
      coverImage: `https://archive.org/services/img/${d.identifier}`,
      genre: 'Classic Literature'
    }));
  }).catch((error) => {
    console.error('Error fetching archive books:', error);
    return [];
  });
};
export const fetchClassicBooks = async (genre?: string): Promise<ArchiveBook[]> => {
  return cached(`classic-books:${genre || 'all'}`, 1000 * 60 * 60, async () => {
    let url = GUTENDEX_BASE;
    if (genre) {
      url += `?topic=${encodeURIComponent(genre)}`;
    }
    const response = await fetch(url);
    const data = await response.json();
    const books = data.results.map((b: any) => ({
      id: String(b.id),
      title: b.title,
      authors: b.authors.map((a: any) => a.name),
      subjects: b.subjects,
      formats: b.formats,
      download_count: b.download_count,
      coverImage: b.formats['image/jpeg'] || `https://covers.openlibrary.org/b/id/${b.id}-M.jpg`,
      genre: genre || (b.subjects[0] || 'Classic Literature')
    }));
    return books;
  }).catch((error) => {
    console.error('Error fetching classic books:', error);
    return [];
  });
};

const GENRE_KEYWORD_MAP: [string, string][] = [
  ['horror', 'Horror'],
  ['comedy', 'Comedy'],
  ['western', 'Western'],
  ['science fiction', 'Sci-Fi'],
  ['sci-fi', 'Sci-Fi'],
  ['sci fi', 'Sci-Fi'],
  ['animation', 'Animation'],
  ['cartoon', 'Animation'],
  ['documentary', 'Documentary'],
  ['drama', 'Drama'],
  ['crime', 'Crime'],
  ['thriller', 'Thriller'],
  ['romance', 'Romance'],
  ['adventure', 'Adventure'],
  ['action', 'Action'],
  ['film noir', 'Film Noir'],
  ['noir', 'Film Noir'],
  ['silent', 'Silent Film'],
  ['television', 'TV Series'],
  ['classic tv', 'TV Series'],
  ['feature film', 'Feature Film'],
];

function normalizeArchiveGenre(subjects: string[], collections: string[]): string {
  const haystack = [...subjects, ...collections].map(s => s.toLowerCase()).join(' ');
  for (const [key, label] of GENRE_KEYWORD_MAP) {
    if (haystack.includes(key)) return label;
  }
  return 'Classic Cinema';
}

export const fetchArchiveVideos = async (query: string = 'collection:feature_films', limit: number = 30): Promise<ArchiveVideo[]> => {
  try {
    const params = new URLSearchParams({
      q: `${query} AND mediatype:movies AND format:"512Kb MPEG4"`,
      fl: 'identifier,title,description,mediatype,collection,subject,year,runtime',
      sort: 'downloads desc',
      rows: String(limit),
      output: 'json'
    });

    const targetUrl = `${INTERNET_ARCHIVE_BASE}?${params.toString()}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    const docs = data.response.docs;

    return docs.map((d: any) => {
      const subjects: string[] = Array.isArray(d.subject) ? d.subject : (d.subject ? [d.subject] : []);
      const collections: string[] = Array.isArray(d.collection) ? d.collection : (d.collection ? [d.collection] : []);
      const normalizeStr = (v: any, fallback = '') =>
        String(Array.isArray(v) ? v[0] : v ?? fallback) || fallback;
      return {
        identifier: d.identifier,
        title: normalizeStr(d.title, 'Untitled Archive Film'),
        description: normalizeStr(d.description),
        mediatype: d.mediatype,
        collection: collections,
        genre: normalizeArchiveGenre(subjects, collections),
        year: normalizeStr(d.year),
        runtime: normalizeStr(d.runtime),
        thumbnailUrl: `https://archive.org/services/img/${d.identifier}`
      };
    });
  } catch (error) {
    console.error('Error fetching archive videos:', error);
    return [];
  }
};

export interface GenreCollection { genre: string; items: ArchiveVideo[] }

export const ARCHIVE_GENRE_SOURCES: { genre: string; query: string }[] = [
  { genre: 'Feature Films',  query: 'collection:feature_films' },
  { genre: 'Classic TV',     query: 'collection:classic_tv' },
  { genre: 'Animation',      query: 'collection:animationandcartoons' },
  { genre: 'Horror',         query: 'subject:horror AND mediatype:movies' },
  { genre: 'Comedy',         query: 'subject:comedy AND mediatype:movies' },
  { genre: 'Drama',          query: 'subject:drama AND mediatype:movies' },
  { genre: 'Action',         query: 'subject:action AND mediatype:movies' },
  { genre: 'Romance',        query: 'subject:romance AND mediatype:movies' },
  { genre: 'Sci-Fi',         query: 'subject:"science fiction" AND mediatype:movies' },
  { genre: 'Western',        query: 'subject:western AND mediatype:movies' },
  { genre: 'Documentary',    query: 'subject:documentary AND mediatype:movies' },
  { genre: 'Thriller',       query: 'subject:thriller AND mediatype:movies' },
  { genre: 'Adventure',      query: 'subject:adventure AND mediatype:movies' },
  { genre: 'Musical',        query: 'subject:musical AND mediatype:movies' },
  { genre: 'Film Noir',      query: 'subject:"film noir" AND mediatype:movies' },
  { genre: 'Silent Film',    query: 'subject:silent AND mediatype:movies' },
  { genre: 'Short Films',    query: 'collection:shortfilms AND mediatype:movies' },
  { genre: 'Sports',         query: 'collection:sports AND mediatype:movies' },
  { genre: 'Prelinger',      query: 'collection:prelinger AND mediatype:movies' },
  { genre: 'TV Archive',     query: 'collection:tvarchive AND mediatype:movies' },
];

export const fetchArchiveByAllGenres = async (limitPerGenre = 12): Promise<GenreCollection[]> => {
  const results = await Promise.allSettled(
    ARCHIVE_GENRE_SOURCES.map(async ({ genre, query }) => ({
      genre,
      items: await fetchArchiveVideos(query, limitPerGenre)
    }))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<GenreCollection> => r.status === 'fulfilled' && r.value.items.length > 0)
    .map(r => r.value);
};

export const getVideoMetadata = async (identifier: string) => {
  try {
    const targetUrl = `${INTERNET_ARCHIVE_DETAILS}/${identifier}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching video metadata:', error);
    return null;
  }
};

export const getArchiveItemFiles = async (identifier: string) => {
  return cached(`archive-files:${identifier}`, 1000 * 60 * 60, async () => {
    const targetUrl = `${INTERNET_ARCHIVE_DETAILS}/${identifier}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    // Filter out very small files which are likely fingerprints or metadata stubs
    return (data.files || []).filter((f: any) => {
      const size = parseInt(f.size) || 0;
      return size > 50000; // > 50KB
    });
  }).catch((error) => {
    console.error('Error fetching archive files:', error);
    return [];
  });
};

export const getBestVideoUrl = (identifier: string, files: any[]) => {
  const byExt = files.find((f: any) => {
    const n = (f.name || '').toLowerCase();
    return n.endsWith('.mp4') || n.endsWith('.mpeg4') || n.endsWith('.m4v');
  });
  if (byExt) return `https://archive.org/download/${identifier}/${byExt.name}`;

  const byFormat = files.find((f: any) => {
    const fmt = (f.format || '').toLowerCase();
    return fmt.includes('mpeg') || fmt.includes('mp4') || fmt.includes('h.264');
  });
  if (byFormat) return `https://archive.org/download/${identifier}/${byFormat.name}`;

  return null;
};

// ═══════════════════════════════════════════════════════════════════════════
//  THE VAULT — two-axis taxonomy, contextual metadata, curated shelves
//
//  Every identifier and collection slug below was HTTP-verified before being
//  written down. Where a live query could stand in for a hardcoded id, the
//  query won — queries cannot rot. Anything that could not be confirmed was
//  discarded rather than guessed.
//
//  Verified sources:
//    · Internet Archive   advancedsearch.php -> metadata/<id> -> download/<id>/<file>
//    · Library of Congress www.loc.gov/audio/?fo=json  and  /collections/<slug>/?fo=json
//                          (both send Access-Control-Allow-Origin: *, so no proxy)
//    · Wikimedia Commons   w/api.php
// ═══════════════════════════════════════════════════════════════════════════

/** Drop `undefined`/empty values — Firestore throws on undefined fields, and
 *  Vault tracks get written through syncPublicDomainAsset on play. */
const compact = <T extends Record<string, any>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as T;

const stripHtml = (v: any): string | undefined => {
  const raw = Array.isArray(v) ? v.filter(Boolean).join(' — ') : v;
  if (typeof raw !== 'string') return undefined;
  const clean = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean || undefined;
};

/** LoC contributors arrive lowercased as "shilkret, nathaniel" -> "Nathaniel Shilkret". */
const humanizeName = (raw: any): string | undefined => {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string' || !s.trim()) return undefined;
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  const ordered = parts.length === 2 ? `${parts[1]} ${parts[0]}` : s;
  return ordered.replace(/\b[a-z]/g, c => c.toUpperCase()).trim();
};

const yearOf = (date?: string): string | undefined => {
  const m = /(\d{4})/.exec(date || '');
  return m ? m[1] : undefined;
};

/** Bounded-concurrency map — the Vault fans out one metadata call per item. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try { out[i] = await fn(items[i]); } catch { out[i] = null as any; }
      }
    })
  );
  return out;
}

// ── Library of Congress client ─────────────────────────────────────────────
// loc.gov rate-limits, so requests are serialized behind a minimum gap. The
// `fo=json` query param is what selects the JSON representation; browsers
// forbid setting User-Agent from fetch, so none is sent client-side.

const LOC_MIN_GAP_MS = 350;
let locQueue: Promise<any> = Promise.resolve();
let locLastAt = 0;

const locFetchJson = (url: string): Promise<any> => {
  const run = async () => {
    const wait = LOC_MIN_GAP_MS - (Date.now() - locLastAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    locLastAt = Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LoC HTTP ${res.status}`);
    return res.json();
  };
  locQueue = locQueue.then(run, run);
  return locQueue;
};

/** LoC exposes playable audio under `resources[].media` (Jukebox) or
 *  `resources[].audio` (American Folklife Center sets). Items with neither are
 *  catalogue-only and get dropped rather than shown as a tile that cannot play. */
const locAudioUrl = (r: any): string | undefined => {
  for (const res of r?.resources || []) {
    const u = res?.media || res?.audio;
    if (typeof u === 'string' && /\.(mp3|wav|m4a|ogg)(\?|#|$)/i.test(u)) return u;
  }
  return undefined;
};

const locImage = (r: any): string | undefined => {
  const arr = r?.image_url;
  const u = Array.isArray(arr) ? arr[0] : arr;
  if (typeof u !== 'string' || !u) return undefined;
  const clean = u.split('#')[0];
  if (clean.endsWith('.svg')) return undefined; // generic format placeholder
  return clean.startsWith('/') ? `${LOC_BASE}${clean}` : clean;
};

const firstOf = (v: any) => (Array.isArray(v) ? v[0] : v);

/** Provenance line shown under a historic recording, e.g.
 *  "National Jukebox · Musical theater · Vocal · 10-in." or
 *  "Voices Remembering Slavery · Interviews · 78 rpm disc · Georgia, 1935 · AFS 00342A" */
const locContext = (r: any, collection?: string): string | undefined => {
  const item = r?.item || {};
  const bits = [
    collection,
    firstOf(item.genre),
    item.audio_type,
    firstOf(item.medium) || item.media_size,
    firstOf(item.created_published) || firstOf(item.location),
    firstOf(item.call_number) || r?.shelf_id,
    firstOf(item.repository),
    Array.isArray(r.original_format) ? r.original_format[0] : r.original_format,
  ];
  const seen = new Set<string>();
  const out = bits
    .filter((b): b is string => typeof b === 'string' && !!b.trim())
    .map(b => b.trim().replace(/\.$/, ''))
    // Some LoC records put a handle URL in call_number — that is not provenance.
    .filter(b => !/^https?:\/\//i.test(b))
    .filter(b => { const k = b.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);
  return out.length ? out.join(' · ') : undefined;
};

const titleCaseWords = (s: string) => s.replace(/\b[a-z]/g, c => c.toUpperCase());

const locCollectionName = (r: any, fallback?: string): string | undefined => {
  const partof: string[] = Array.isArray(r?.partof) ? r.partof : [];
  // partof runs broad -> specific; the last entry is the named collection.
  const named = partof.length ? partof[partof.length - 1] : undefined;
  const pick = named || fallback;
  return pick ? titleCaseWords(pick) : undefined;
};

const mapLocResult = (
  r: any,
  opts: { kind: AudioKind; subgenre?: string; collection?: string; conservatory?: boolean }
): ArchiveTrack | null => {
  const url = locAudioUrl(r);
  if (!url) return null;
  const rawId = String(r?.id || r?.url || r?.title || '');
  const slug = rawId
    .replace(/^https?:\/\/(www\.)?loc\.gov\/item\//, '')
    .replace(/\W+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) return null;

  const item = r?.item || {};
  const artist =
    humanizeName(r?.contributor_primary) ||
    humanizeName(r?.contributor) ||
    'Library of Congress';

  return compact({
    id: `loc-${slug}`,
    title: (Array.isArray(r.title) ? r.title[0] : r.title) || 'Untitled Recording',
    artist,
    url,
    thumbnailUrl: locImage(r) || '',
    source: 'LIBRARY_OF_CONGRESS' as const,
    genre: opts.subgenre || (Array.isArray(item.genre) ? item.genre[0] : item.genre),
    year: yearOf(Array.isArray(r.date) ? r.date[0] : r.date),
    kind: opts.kind,
    subgenre: opts.subgenre,
    // Not every LoC set fills `description` — the American Folklife Center puts
    // the substance in item.notes ("Recorded by Alan Lomax, Zora Neale Hurston…").
    // Fall through so historic audio is never shown without context.
    description:
      stripHtml(r.description) ||
      stripHtml(item.notes) ||
      stripHtml(item.summary) ||
      stripHtml(item.created_published) ||
      stripHtml(item.subjects),
    context: locContext(r, opts.collection),
    sourcePageUrl: (Array.isArray(r.url) ? r.url[0] : r.url) || rawId.replace(/^http:/, 'https:'),
    collection: locCollectionName(r, opts.collection),
    rights: stripHtml(item.rights) || stripHtml(r.rights_advisory),
    conservatory: opts.conservatory || undefined,
  }) as ArchiveTrack;
};

export interface LocQueryOpts {
  kind?: AudioKind;
  subgenre?: string;
  collection?: string;
  conservatory?: boolean;
  limit?: number;
  /** 1-based page; maps to the loc.gov `sp=` pagination parameter. */
  page?: number;
}

/**
 * Free-text search across every digitized recording at the Library of Congress.
 * Preferred over hardcoded item ids — a query cannot go dead the way an id can.
 * VERIFIED: /audio/?q=speech&fo=json&c=8 -> 315 results, 8/8 playable.
 */
export const fetchLocAudio = async (query: string, opts: LocQueryOpts = {}): Promise<ArchiveTrack[]> => {
  const { kind = 'HISTORIC', subgenre, collection, conservatory, limit = 24, page = 1 } = opts;
  return cached(`loc-audio:${query}:${limit}:${page}`, 1000 * 60 * 60 * 6, async () => {
    const params = new URLSearchParams({ q: query, fo: 'json', c: String(limit) });
    params.set('fa', 'online-format:audio');
    if (page > 1) params.set('sp', String(page));
    const data = await locFetchJson(`${LOC_BASE}/audio/?${params.toString()}`);
    const results: any[] = data?.results || [];
    return results
      .map(r => mapLocResult(r, { kind, subgenre, collection, conservatory }))
      .filter(Boolean) as ArchiveTrack[];
  }).catch(err => {
    console.error(`[Vault] LoC audio search "${query}" failed:`, err);
    return [];
  });
};

/**
 * A named Library of Congress collection.
 * VERIFIED slugs (each returns playable audio with real descriptions):
 *   · national-jukebox            19,530 audio items
 *   · voices-remembering-slavery      60 items
 *   · songs-of-america             3,244 items
 * Slugs that returned 404 and were DISCARDED rather than shipped:
 *   alan-lomax-collection, american-folklife-center,
 *   american-leaders-speak-recordings-from-world-war-i-and-the-1920-election,
 *   florida-folklife-from-the-wpa-collections,
 *   fiddle-tunes-of-the-old-frontier-the-henry-reed-collection,
 *   emile-berliner-and-the-birth-of-the-recording-industry
 */
export const fetchLocCollection = async (slug: string, opts: LocQueryOpts = {}): Promise<ArchiveTrack[]> => {
  const { kind = 'HISTORIC', subgenre, collection, conservatory, limit = 24, page = 1 } = opts;
  return cached(`loc-coll:${slug}:${limit}:${page}`, 1000 * 60 * 60 * 6, async () => {
    const params = new URLSearchParams({ fo: 'json', c: String(limit) });
    params.set('fa', 'online-format:audio');
    if (page > 1) params.set('sp', String(page));
    const data = await locFetchJson(`${LOC_BASE}/collections/${slug}/?${params.toString()}`);
    const results: any[] = data?.results || [];
    return results
      .map(r => mapLocResult(r, { kind, subgenre, collection, conservatory }))
      .filter(Boolean) as ArchiveTrack[];
  }).catch(err => {
    console.error(`[Vault] LoC collection "${slug}" failed:`, err);
    return [];
  });
};

/** The National Jukebox — Victor and Columbia acoustic-era discs, 1900-1925.
 *  Every item carries its label, catalogue number and matrix/take number. */
export const fetchNationalJukebox = (opts: LocQueryOpts = {}) =>
  fetchLocCollection('national-jukebox', {
    kind: 'HISTORIC',
    collection: 'National Jukebox',
    ...opts,
  });

// ── Internet Archive → ArchiveTrack, with description carried through ──────
// The legacy fetchArchiveMusic/Podcasts/Audiobooks helpers above are kept for
// existing callers. This is the taxonomy-aware path: it asks for `description`
// and `licenseurl` and actually keeps them.

interface IaQueryOpts {
  kind: AudioKind;
  subgenre?: string;
  collection?: string;
  conservatory?: boolean;
  limit?: number;
}

const iaContext = (d: any, collection?: string): string | undefined => {
  const subjects: string[] = Array.isArray(d.subject) ? d.subject : (d.subject ? [d.subject] : []);
  const bits = [collection, d.date ? String(d.date).slice(0, 4) : undefined, ...subjects.slice(0, 2)];
  const seen = new Set<string>();
  const out = bits
    .filter((b): b is string => typeof b === 'string' && !!b.trim())
    .map(b => b.trim())
    .filter(b => { const k = b.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return out.length ? out.join(' · ') : undefined;
};

/**
 * Run an Internet Archive advancedsearch query and resolve each hit to a real,
 * playable MP3 via the metadata endpoint.
 * VERIFIED chain: advancedsearch.php -> metadata/<id> -> download/<id>/<file>
 * (302 -> 206, content-type audio/mpeg).
 */
export const fetchIaTracks = async (query: string, opts: IaQueryOpts): Promise<ArchiveTrack[]> => {
  const { kind, subgenre, collection, conservatory, limit = 24 } = opts;
  return cached(`ia-tracks:${query}:${limit}`, 1000 * 60 * 60 * 3, async () => {
    const params = new URLSearchParams({
      q: `${query} AND format:"VBR MP3"`,
      fl: 'identifier,title,creator,date,subject,description,downloads,licenseurl,collection',
      sort: 'downloads desc',
      rows: String(limit),
      output: 'json',
    });
    const res = await fetch(`${INTERNET_ARCHIVE_BASE}?${params.toString()}`);
    if (!res.ok) throw new Error(`Internet Archive HTTP ${res.status}`);
    const data = await res.json();
    const docs: any[] = data?.response?.docs || [];

    const tracks = await mapLimit(docs, 6, async (d: any) => {
      const files = await getArchiveItemFiles(d.identifier);
      const mp3 =
        files.find((f: any) => f.name?.endsWith('.vbr.mp3')) ||
        files.find((f: any) => f.name?.endsWith('.mp3'));
      if (!mp3) return null;
      const asStr = (v: any) => (Array.isArray(v) ? v[0] : v);
      return compact({
        id: d.identifier,
        title: asStr(d.title) || String(mp3.name).replace(/\.[^/.]+$/, ''),
        artist: asStr(d.creator) || 'Unattributed',
        url: `https://archive.org/download/${d.identifier}/${mp3.name}`,
        thumbnailUrl: `https://archive.org/services/img/${d.identifier}`,
        source: 'INTERNET_ARCHIVE' as const,
        genre: subgenre || asStr(d.subject),
        year: yearOf(asStr(d.date)),
        kind,
        subgenre,
        description: stripHtml(d.description),
        context: iaContext(d, collection),
        sourcePageUrl: `https://archive.org/details/${d.identifier}`,
        collection,
        rights: typeof d.licenseurl === 'string' ? d.licenseurl : undefined,
        conservatory: conservatory || undefined,
      }) as ArchiveTrack;
    });

    return tracks.filter((t): t is ArchiveTrack => !!t);
  }).catch(err => {
    console.error(`[Vault] Internet Archive query failed: ${query}`, err);
    return [];
  });
};

// ── The taxonomy ───────────────────────────────────────────────────────────
// PRIMARY axis = kind of audio. SECONDARY axis = genre/subcategory, scoped to
// that kind. Sorting is a THIRD, independent axis (VaultSort) — "Trending" is
// deliberately absent here, because nothing *is* a trending.

export interface VaultSubgenreDef {
  id: string;
  label: string;
  /** How this slice is fetched. Every query below was verified to return results. */
  fetch: (limit: number) => Promise<ArchiveTrack[]>;
}

export interface VaultKindDef {
  id: AudioKind;
  label: string;
  /** One line explaining what this kind actually is. */
  tagline: string;
  subgenres: VaultSubgenreDef[];
  fetch: (limit: number) => Promise<ArchiveTrack[]>;
}

/** Internet Archive shellac-disc slice. `collection:78rpm` = 307,889 items. */
const ia78 = (subject: string, label: string, conservatory = false) => (limit: number) =>
  fetchIaTracks(`mediatype:audio AND collection:78rpm AND subject:"${subject}"`, {
    kind: 'MUSIC', subgenre: label, collection: 'Great 78 Project', conservatory, limit,
  });

/** LibriVox slice. `collection:librivoxaudio` = 21,638 items. */
const librivox = (subject: string, label: string) => (limit: number) =>
  fetchIaTracks(`mediatype:audio AND collection:librivoxaudio AND subject:"${subject}"`, {
    kind: 'AUDIOBOOK', subgenre: label, collection: 'LibriVox', limit,
  });

/** Filter Jukebox items to an era using their own catalogued date. */
const jukeboxEra = (from: number, to: number, label: string) => async (limit: number) => {
  const pool = await fetchNationalJukebox({ subgenre: label, limit: Math.max(limit * 3, 60) });
  return pool.filter(t => {
    const y = Number(t.year);
    return Number.isFinite(y) && y >= from && y <= to;
  }).slice(0, limit);
};

export const VAULT_TAXONOMY: VaultKindDef[] = [
  {
    id: 'MUSIC',
    label: 'Music',
    tagline: 'Recorded performance — from shellac discs to Creative Commons releases.',
    fetch: (limit) => fetchIaTracks('mediatype:audio AND collection:78rpm', {
      kind: 'MUSIC', collection: 'Great 78 Project', limit,
    }),
    subgenres: [
      { id: 'jazz',      label: 'Jazz',      fetch: ia78('jazz', 'Jazz') },
      { id: 'classical', label: 'Classical', fetch: ia78('classical', 'Classical', true) },
      { id: 'blues',     label: 'Blues',     fetch: ia78('blues', 'Blues') },
      { id: 'gospel',    label: 'Gospel',    fetch: ia78('gospel', 'Gospel') },
      { id: 'ragtime',   label: 'Ragtime',   fetch: ia78('ragtime', 'Ragtime', true) },
      { id: 'folk',      label: 'Folk',      fetch: ia78('folk', 'Folk') },
      { id: 'opera',     label: 'Opera',     fetch: ia78('opera', 'Opera', true) },
      { id: 'country',   label: 'Country',   fetch: ia78('country', 'Country') },
      { id: 'world',     label: 'World',     fetch: ia78('world', 'World') },
    ],
  },
  {
    id: 'HISTORIC',
    label: 'Historic',
    tagline: 'Archival and early recordings, held by the institutions that preserved them.',
    fetch: (limit) => fetchNationalJukebox({ limit }),
    subgenres: [
      { id: 'jukebox',   label: 'National Jukebox', fetch: (l) => fetchNationalJukebox({ subgenre: 'National Jukebox', limit: l }) },
      { id: 'era-1900s', label: '1900–1909',        fetch: jukeboxEra(1900, 1909, '1900–1909') },
      { id: 'era-1910s', label: '1910–1919',        fetch: jukeboxEra(1910, 1919, '1910–1919') },
      { id: 'era-1920s', label: '1920–1925',        fetch: jukeboxEra(1920, 1925, '1920–1925') },
      { id: 'cylinder',  label: 'Cylinder Era',     fetch: (l) => fetchLocAudio('cylinder recording', { kind: 'HISTORIC', subgenre: 'Cylinder Era', limit: l }) },
      { id: 'great78',   label: 'Great 78s',        fetch: (l) => fetchIaTracks('mediatype:audio AND collection:georgeblood', { kind: 'HISTORIC', subgenre: 'Great 78s', collection: 'Great 78 Project', limit: l }) },
    ],
  },
  {
    id: 'SPEECH',
    label: 'Speech',
    tagline: 'Addresses and oratory — words committed to a record because they mattered.',
    fetch: (limit) => fetchLocAudio('speech', { kind: 'SPEECH', limit }),
    subgenres: [
      { id: 'addresses', label: 'Historic Addresses', fetch: (l) => fetchLocAudio('speech', { kind: 'SPEECH', subgenre: 'Historic Addresses', limit: l }) },
      { id: 'political', label: 'Political',          fetch: (l) => fetchIaTracks('mediatype:audio AND (subject:"speeches" OR subject:"oratory")', { kind: 'SPEECH', subgenre: 'Political', limit: l }) },
      { id: 'sermons',   label: 'Sermons',            fetch: (l) => fetchLocAudio('sermon', { kind: 'SPEECH', subgenre: 'Sermons', limit: l }) },
    ],
  },
  {
    id: 'AUDIOBOOK',
    label: 'Audiobook',
    tagline: 'Public-domain literature, read aloud by volunteers.',
    fetch: (limit) => fetchIaTracks('mediatype:audio AND collection:librivoxaudio', {
      kind: 'AUDIOBOOK', collection: 'LibriVox', limit,
    }),
    subgenres: [
      { id: 'fiction',       label: 'Fiction',       fetch: librivox('fiction', 'Fiction') },
      { id: 'poetry',        label: 'Poetry',        fetch: librivox('poetry', 'Poetry') },
      { id: 'philosophy',    label: 'Philosophy',    fetch: librivox('philosophy', 'Philosophy') },
      { id: 'history',       label: 'History',       fetch: librivox('history', 'History') },
      { id: 'science',       label: 'Science',       fetch: librivox('science', 'Science') },
      { id: 'short-stories', label: 'Short Stories', fetch: librivox('short stories', 'Short Stories') },
      { id: 'biography',     label: 'Biography',     fetch: librivox('biography', 'Biography') },
      { id: 'drama',         label: 'Drama',         fetch: librivox('drama', 'Drama') },
    ],
  },
  {
    id: 'PODCAST',
    label: 'Podcast',
    tagline: 'Independent programmes archived in the open.',
    fetch: (limit) => fetchIaTracks('mediatype:audio AND collection:podcasts', {
      kind: 'PODCAST', collection: 'Internet Archive Podcasts', limit,
    }),
    subgenres: [],
  },
  {
    id: 'FIELD_RECORDING',
    label: 'Field Recording',
    tagline: 'Folklife and ethnographic audio, captured where it was actually made.',
    fetch: (limit) => fetchLocAudio('field recording', { kind: 'FIELD_RECORDING', limit }),
    subgenres: [
      { id: 'songs-of-america', label: 'Songs of America', fetch: (l) => fetchLocCollection('songs-of-america', { kind: 'FIELD_RECORDING', subgenre: 'Songs of America', collection: 'Songs of America', limit: l }) },
      { id: 'folk-song',        label: 'Folk Song',        fetch: (l) => fetchLocAudio('folk song', { kind: 'FIELD_RECORDING', subgenre: 'Folk Song', limit: l }) },
      { id: 'in-the-field',     label: 'In the Field',     fetch: (l) => fetchLocAudio('field recording', { kind: 'FIELD_RECORDING', subgenre: 'In the Field', limit: l }) },
    ],
  },
  {
    id: 'INTERVIEW',
    label: 'Interview',
    tagline: 'Oral history — people describing what they lived through, in their own voices.',
    fetch: (limit) => fetchLocAudio('oral history interview', { kind: 'INTERVIEW', limit }),
    subgenres: [
      { id: 'oral-history', label: 'Oral History', fetch: (l) => fetchLocAudio('oral history interview', { kind: 'INTERVIEW', subgenre: 'Oral History', limit: l }) },
      { id: 'slavery',      label: 'Remembering Slavery', fetch: (l) => fetchLocCollection('voices-remembering-slavery', { kind: 'INTERVIEW', subgenre: 'Remembering Slavery', collection: 'Voices Remembering Slavery', limit: l }) },
    ],
  },
];

export const vaultKind = (id: AudioKind): VaultKindDef | undefined =>
  VAULT_TAXONOMY.find(k => k.id === id);

export const vaultSubgenres = (id: AudioKind): VaultSubgenreDef[] =>
  vaultKind(id)?.subgenres ?? [];

/** Resolve the two-axis selection to tracks. `subgenreId` is scoped to `kind`. */
export const fetchVaultTracks = async (
  kind: AudioKind,
  subgenreId?: string | null,
  limit = 32
): Promise<ArchiveTrack[]> => {
  const def = vaultKind(kind);
  if (!def) return [];
  if (subgenreId) {
    const sub = def.subgenres.find(s => s.id === subgenreId);
    if (sub) return sub.fetch(limit);
  }
  return def.fetch(limit);
};

/** Sorting is its own axis. TRENDING preserves upstream popularity ordering
 *  (Internet Archive sorts by downloads; Audius returns its own trending rank). */
export const sortVaultTracks = (tracks: ArchiveTrack[], sort: VaultSort): ArchiveTrack[] => {
  const out = [...tracks];
  const yr = (t: ArchiveTrack) => Number(t.year) || 0;
  switch (sort) {
    case 'RECENT': return out.sort((a, b) => yr(b) - yr(a));
    case 'OLDEST': return out.sort((a, b) => (yr(a) || 9999) - (yr(b) || 9999));
    case 'AZ':     return out.sort((a, b) => a.title.localeCompare(b.title));
    default:       return out;
  }
};

// ── Curated shelves — the "why this matters" rail ──────────────────────────
// Editorial copy here is deliberately narrow: each line states something that
// is true of the source material and verifiable from the item metadata itself.

export interface VaultShelf {
  id: string;
  title: string;
  /** One editorial line worth standing behind. */
  blurb: string;
  kind: AudioKind;
  accent: string;
  fetch: (limit: number) => Promise<ArchiveTrack[]>;
}

export const VAULT_SHELVES: VaultShelf[] = [
  {
    id: 'national-jukebox',
    title: 'The National Jukebox',
    blurb: 'Victor and Columbia discs pressed between 1900 and 1925. Each one still carries its label, catalogue number and matrix/take.',
    kind: 'HISTORIC',
    accent: '#ff8c00',
    fetch: (l) => fetchNationalJukebox({ limit: l }),
  },
  {
    id: 'before-the-microphone',
    title: 'Before the Microphone',
    blurb: 'Acoustic-era recordings made without electricity: performers played into a horn and the sound cut the groove directly.',
    kind: 'HISTORIC',
    accent: '#c084fc',
    fetch: (l) => fetchLocAudio('cylinder recording', { kind: 'HISTORIC', subgenre: 'Cylinder Era', collection: 'Library of Congress', limit: l }),
  },
  {
    id: 'remembering-slavery',
    title: 'Voices Remembering Slavery',
    blurb: 'Interviews with people born into slavery in the United States — among the only known audio recordings of their voices.',
    kind: 'INTERVIEW',
    accent: '#f87171',
    fetch: (l) => fetchLocCollection('voices-remembering-slavery', { kind: 'INTERVIEW', subgenre: 'Remembering Slavery', collection: 'Voices Remembering Slavery', limit: l }),
  },
  {
    id: 'voices-of-record',
    title: 'Voices of Record',
    blurb: 'Speeches committed to disc — including 1903 Victor pressings of Lincoln at Gettysburg and McKinley’s last speech, recited for the record.',
    kind: 'SPEECH',
    accent: '#60a5fa',
    fetch: (l) => fetchLocAudio('speech', { kind: 'SPEECH', subgenre: 'Historic Addresses', collection: 'Library of Congress', limit: l }),
  },
  {
    id: 'folklife',
    title: 'Folklife in the Field',
    blurb: 'Ethnographic recordings made on location rather than in a studio — the music people actually sang where they lived.',
    kind: 'FIELD_RECORDING',
    accent: '#34d399',
    fetch: (l) => fetchLocCollection('songs-of-america', { kind: 'FIELD_RECORDING', subgenre: 'Songs of America', collection: 'Songs of America', limit: l }),
  },
  {
    id: 'great-78s',
    title: 'The Great 78 Project',
    blurb: 'Shellac 78s transferred disc by disc and preserved as digital audio before the originals degrade any further.',
    kind: 'HISTORIC',
    accent: '#fbbf24',
    fetch: (l) => fetchIaTracks('mediatype:audio AND collection:georgeblood', { kind: 'HISTORIC', subgenre: 'Great 78s', collection: 'Great 78 Project', limit: l }),
  },
  {
    id: 'read-aloud',
    title: 'Read Aloud',
    blurb: 'Public-domain literature recorded by volunteer readers — complete works, free to keep.',
    kind: 'AUDIOBOOK',
    accent: '#a78bfa',
    fetch: (l) => fetchIaTracks('mediatype:audio AND collection:librivoxaudio', { kind: 'AUDIOBOOK', collection: 'LibriVox', limit: l }),
  },
  {
    id: 'conservatory',
    title: 'For the Conservatory',
    blurb: 'Classical, operatic and ragtime performance marked for study — repertoire, period practice and historic interpretation.',
    kind: 'MUSIC',
    accent: '#38bdf8',
    fetch: (l) => fetchConservatoryRecordings({ limit: l }),
  },
];

export const vaultShelf = (id: string): VaultShelf | undefined =>
  VAULT_SHELVES.find(s => s.id === id);

export const fetchVaultShelf = async (id: string, limit = 16): Promise<ArchiveTrack[]> => {
  const shelf = vaultShelf(id);
  if (!shelf) return [];
  return shelf.fetch(limit);
};

/** Load the featured rail. Shelves that fail or come back empty are dropped
 *  rather than rendered as an empty row. */
export const fetchVaultShelves = async (limitPerShelf = 12): Promise<Array<VaultShelf & { items: ArchiveTrack[] }>> => {
  const settled = await Promise.allSettled(
    VAULT_SHELVES.map(async shelf => ({ ...shelf, items: await shelf.fetch(limitPerShelf) }))
  );
  return settled
    .filter((r): r is PromiseFulfilledResult<VaultShelf & { items: ArchiveTrack[] }> =>
      r.status === 'fulfilled' && r.value.items.length > 0)
    .map(r => r.value);
};

// ── Conservatory API ───────────────────────────────────────────────────────
// The Chora Conservatory consumes this instead of duplicating archive plumbing.
// Everything returned carries `conservatory: true`, plus description/context so
// a study card can be rendered without a second round-trip.

const CONSERVATORY_TERMS = [
  'classical', 'opera', 'operatic', 'symphony', 'symphonic', 'sonata', 'concerto',
  'chamber', 'quartet', 'orchestra', 'orchestral', 'choral', 'chorale', 'oratorio',
  'piano', 'violin', 'cello', 'organ', 'ragtime', 'etude', 'aria', 'baroque',
];

/** Heuristic: is this recording plausibly useful for musical study? */
export const isConservatoryRelevant = (track: ArchiveTrack): boolean => {
  if (track.conservatory) return true;
  if (track.kind && !['MUSIC', 'HISTORIC'].includes(track.kind)) return false;
  const hay = [track.genre, track.subgenre, track.title, track.description, track.context]
    .filter(Boolean).join(' ').toLowerCase();
  return CONSERVATORY_TERMS.some(t => hay.includes(t));
};

export interface ConservatoryQueryOpts {
  limit?: number;
  /** Restrict to one discipline: 'classical' | 'opera' | 'ragtime' | 'historic'. */
  discipline?: 'classical' | 'opera' | 'ragtime' | 'historic';
}

/**
 * Recordings marked as Conservatory-relevant, deduped by id.
 *
 * Intended consumer: components/chora/PublicDomainLibrary.tsx and any other
 * Conservatory surface —
 *   import { fetchConservatoryRecordings } from '../../services/archiveContentService';
 *   const items = await fetchConservatoryRecordings({ discipline: 'opera', limit: 24 });
 * Every item is an ArchiveTrack with `conservatory: true`, a playable `url`,
 * and (where the archive published one) `description` / `context` / `rights`.
 */
export const fetchConservatoryRecordings = async (
  opts: ConservatoryQueryOpts = {}
): Promise<ArchiveTrack[]> => {
  const { limit = 24, discipline } = opts;
  const per = Math.max(6, Math.ceil(limit / (discipline ? 1 : 4)));

  const jobs: Array<Promise<ArchiveTrack[]>> = [];
  const want = (d: string) => !discipline || discipline === d;

  if (want('classical')) {
    jobs.push(fetchIaTracks('mediatype:audio AND collection:78rpm AND subject:"classical"', {
      kind: 'MUSIC', subgenre: 'Classical', collection: 'Great 78 Project', conservatory: true, limit: per,
    }));
  }
  if (want('opera')) {
    jobs.push(fetchIaTracks('mediatype:audio AND collection:78rpm AND subject:"opera"', {
      kind: 'MUSIC', subgenre: 'Opera', collection: 'Great 78 Project', conservatory: true, limit: per,
    }));
  }
  if (want('ragtime')) {
    jobs.push(fetchIaTracks('mediatype:audio AND collection:78rpm AND subject:"ragtime"', {
      kind: 'MUSIC', subgenre: 'Ragtime', collection: 'Great 78 Project', conservatory: true, limit: per,
    }));
  }
  if (want('historic')) {
    jobs.push(fetchNationalJukebox({ subgenre: 'National Jukebox', conservatory: true, limit: per }));
  }

  const settled = await Promise.allSettled(jobs);
  const merged = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));

  const seen = new Set<string>();
  const deduped: ArchiveTrack[] = [];
  for (const t of merged) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    deduped.push(t.conservatory ? t : { ...t, conservatory: true });
  }
  return deduped.slice(0, limit);
};
