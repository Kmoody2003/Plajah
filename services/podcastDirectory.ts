// podcastDirectory — the public podcast directory Chora reads (Apple's podcast charts, search and
// episode lookup, no key required). Shared by the Podcasts tab and the Chora landing's podcast
// shelf so both show the same charts. Chart responses are cached in memory for 30 minutes.

export interface PodcastShow {
  id: string;
  title: string;
  artist: string;
  coverImage: string;
  feedUrl: string;
  genres: string[];
}

export interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  duration: number;
  releaseDate: string;
  imageUrl?: string;
}

/** Apple podcast genre ids used for Chora's category shelves and chips. */
export const PODCAST_CATEGORIES = [
  { id: '1303', name: 'Comedy' },
  { id: '1318', name: 'Technology' },
  { id: '1321', name: 'True Crime' },
  { id: '1324', name: 'Business' },
  { id: '1315', name: 'Science' },
  { id: '1317', name: 'Sports' },
  { id: '1323', name: 'Music' },
];

const chartCache = new Map<string, { at: number; shows: PodcastShow[] }>();

const fromChartEntry = (e: any, genre?: string): PodcastShow => ({
  id: e.id?.attributes?.['im:id'] ?? '',
  title: e['im:name']?.label ?? '',
  artist: e['im:artist']?.label ?? '',
  coverImage: e['im:image']?.[2]?.label || e['im:image']?.[0]?.label || '',
  feedUrl: '',
  genres: genre ? [genre] : e.category?.attributes?.label ? [e.category.attributes.label] : [],
});

/** The US top-podcasts chart, optionally for one Apple genre id. */
export async function fetchTopPodcasts(limit = 10, genreId?: string, genreName?: string): Promise<PodcastShow[]> {
  const key = `${genreId || 'all'}:${limit}`;
  const hit = chartCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.shows;
  const url = `https://itunes.apple.com/us/rss/toppodcasts/limit=${limit}${genreId ? `/genre=${genreId}` : ''}/json`;
  const res = await fetch(url);
  const data = await res.json();
  const shows = ((data?.feed?.entry || []) as any[]).map(e => fromChartEntry(e, genreName)).filter(p => p.id);
  chartCache.set(key, { at: Date.now(), shows });
  return shows;
}

export async function searchPodcasts(term: string, limit = 20): Promise<PodcastShow[]> {
  const res = await fetch(`https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(term)}&limit=${limit}`);
  const data = await res.json();
  return ((data.results || []) as any[]).filter(p => p.collectionId).map(p => ({
    id: String(p.collectionId),
    title: p.collectionName || '',
    artist: p.artistName || '',
    coverImage: p.artworkUrl600 || p.artworkUrl100 || '',
    feedUrl: p.feedUrl || '',
    genres: p.genres || [],
  }));
}

/** Streamable episodes for a show (episodes without an audio URL are skipped). */
export async function fetchPodcastEpisodes(show: PodcastShow, limit = 50): Promise<PodcastEpisode[]> {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${show.id}&media=podcast&entity=podcastEpisode&limit=${limit}`);
  const data = await res.json();
  return ((data.results || []) as any[]).slice(1)
    .filter(ep => ep.episodeUrl)
    .map(ep => ({
      id: String(ep.trackId),
      title: ep.trackName || 'Untitled episode',
      description: ep.description || '',
      audioUrl: ep.episodeUrl as string,
      duration: Math.floor((ep.trackTimeMillis || 0) / 1000),
      releaseDate: ep.releaseDate || '',
      imageUrl: ep.artworkUrl600 || ep.artworkUrl160 || show.coverImage,
    }));
}
