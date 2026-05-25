
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

export interface ArchiveTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  thumbnailUrl: string;
  source: 'INTERNET_ARCHIVE' | 'WIKIMEDIA' | 'JAMENDO' | 'SOUND_CLOUD';
  genre?: string;
  year?: string;
  license?: string;
  duration?: number;
}

const GUTENDEX_BASE = 'https://gutendex.com/books';
const INTERNET_ARCHIVE_BASE = 'https://archive.org/advancedsearch.php';
const INTERNET_ARCHIVE_DETAILS = 'https://archive.org/metadata';

export const fetchArchiveMusic = async (genre: string = 'Jazz', limit: number = 30): Promise<ArchiveTrack[]> => {
  try {
    // Improved query for better quality and relevance
    let query = '';
    if (genre === 'Jazz') {
      query = 'mediatype:audio AND (subject:"jazz" OR subject:"jazz music" OR collection:"78rpm_jazz")';
    } else if (genre === 'Classical') {
      query = 'mediatype:audio AND (subject:"classical" OR subject:"classical music" OR collection:"78rpm_classical")';
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
  try {
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
  } catch (error) {
    console.error('Error fetching archive books:', error);
    return [];
  }
};
export const fetchClassicBooks = async (genre?: string): Promise<ArchiveBook[]> => {
  try {
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
  } catch (error) {
    console.error('Error fetching classic books:', error);
    return [];
  }
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
  { genre: 'Sci-Fi',         query: 'subject:"science fiction" AND mediatype:movies' },
  { genre: 'Western',        query: 'subject:western AND mediatype:movies' },
  { genre: 'Documentary',    query: 'subject:documentary AND mediatype:movies' },
  { genre: 'Film Noir',      query: 'subject:"film noir" AND mediatype:movies' },
  { genre: 'Silent Film',    query: 'subject:silent AND mediatype:movies' },
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
  try {
    const targetUrl = `${INTERNET_ARCHIVE_DETAILS}/${identifier}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    // Filter out very small files which are likely fingerprints or metadata stubs
    return (data.files || []).filter((f: any) => {
      const size = parseInt(f.size) || 0;
      return size > 50000; // > 50KB
    });
  } catch (error) {
    console.error('Error fetching archive files:', error);
    return [];
  }
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
