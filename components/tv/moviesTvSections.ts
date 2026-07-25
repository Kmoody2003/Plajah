// What the Taleo TV screen shows — a TV-shaped projection of the same platform catalogue the
// pointer-driven MoviesTVView browses, flattened into titled rails of poster cards so the whole
// screen navigates as one declared useTvGrid (no geometric guessing, which is what made the old
// Taleo nav jump). Selection returns the raw Video / VIDEO-Album that MovieUXView expects.

import type { Album, Video } from '../../types';
import { fetchAllPublicAlbums, fetchAllVideos } from '../../services/backendService';
import { getContinueWatching } from '../../services/watchHistoryService';
import { fetchArchiveByAllGenres, type ArchiveVideo } from '../../services/archiveContentService';

// The genres that ARE cinema (the inverse of what Reello keeps). Same list MoviesTVView uses.
const TALEO_GENRES = ['Movie', 'Short Film', 'TV Series', 'Short', 'Teaser', 'Trailer', 'Feature Film'];
const isCinema = (v: Video): boolean =>
  (!!v.genre && TALEO_GENRES.includes(v.genre)) || v.subType === 'MOVIE' || v.subType === 'TV_SERIES';

export type TaleoAction =
  | { kind: 'ITEM'; item: Video | Album }   // open directly in MovieUXView
  | { kind: 'RESUME'; id: string }           // continue-watching: re-fetch by id, then open
  | { kind: 'ARCHIVE'; archive: ArchiveVideo }; // Internet Archive: resolve a playable url, then open

export interface TaleoItem {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  /** 0..1 resume fraction — draws the little progress bar on continue-watching cards. */
  progress?: number;
  action: TaleoAction;
}
export interface TaleoRail { id: string; title: string; items: TaleoItem[]; }

const imgV = (v: any) => v?.thumbnailUrl || v?.coverImageUrl || v?.coverImage;
const vItem = (v: Video): TaleoItem => ({
  id: v.id, title: v.title, subtitle: (v as any).genre || (v as any).artist || '',
  image: imgV(v), action: { kind: 'ITEM', item: v },
});
const aItem = (a: Album): TaleoItem => ({
  id: a.id, title: a.title, subtitle: a.artist || a.genre || '',
  image: (a as any).coverImage || (a as any).coverImageUrl, action: { kind: 'ITEM', item: a },
});
const ts = (x: any) => x?.timestamp || x?.createdAt || 0;
const archItem = (v: ArchiveVideo): TaleoItem => ({
  id: v.identifier, title: v.title, subtitle: v.genre || v.year || '',
  image: v.thumbnailUrl, action: { kind: 'ARCHIVE', archive: v },
});
const dedupe = (rails: TaleoRail[]): TaleoRail[] =>
  rails
    .map(r => { const seen = new Set<string>(); return { ...r, items: r.items.filter(i => (i.id && !seen.has(i.id)) ? (seen.add(i.id), true) : false) }; })
    .filter(r => r.items.length > 0);

/** The platform rails — fast (Firestore). Loaded first so the screen appears immediately. */
export async function loadPlatformRails(): Promise<TaleoRail[]> {
  const [albums, videos, cont] = await Promise.all([
    fetchAllPublicAlbums().catch(() => [] as Album[]),
    fetchAllVideos().catch(() => [] as Video[]),
    getContinueWatching('TALEO').catch(() => [] as any[]),
  ]);

  const videoAlbums = (albums as Album[]).filter(a => a.type === 'VIDEO');
  const cinema = (videos as Video[]).filter(isCinema);
  const movies = cinema.filter(v => v.subType === 'MOVIE' || v.genre === 'Movie' || v.genre === 'Feature Film' || v.genre === 'Short Film');
  const series = cinema.filter(v => v.subType === 'TV_SERIES' || v.genre === 'TV Series');
  const newest = [...videoAlbums, ...cinema].sort((a, b) => ts(b) - ts(a)).slice(0, 14);

  return dedupe([
    {
      id: 'continue', title: 'Continue Watching',
      items: (cont as any[]).map(e => ({
        id: e.id, title: e.title || 'Resume', subtitle: e.ownerName || '', image: e.thumbnailUrl,
        progress: e.durationSec ? Math.min(1, e.positionSec / e.durationSec) : undefined,
        action: { kind: 'RESUME', id: e.id } as TaleoAction,
      })),
    },
    { id: 'new', title: 'New to Taleo', items: newest.map(it => ((it as any).type === 'VIDEO' ? aItem(it as Album) : vItem(it as Video))) },
    { id: 'movies', title: 'Movies', items: movies.map(vItem) },
    { id: 'series', title: 'TV Series', items: series.map(vItem) },
    { id: 'creators', title: 'Films & Series by Creators', items: cinema.map(vItem) },
    { id: 'uploads', title: 'Film Uploads', items: videoAlbums.map(aItem) },
  ]);
}

/** The Internet Archive rails — one per movie/TV genre collection, pulled generously so the screen
 *  reflects the full public-domain catalogue Archive.org has that fits film & TV. Loaded AFTER the
 *  platform rails (it's ~20 network queries) and appended, so the screen never waits on it.
 *  fetchArchiveByAllGenres walks ARCHIVE_GENRE_SOURCES (Feature Films, Classic TV, Animation,
 *  Horror, Comedy, Drama, Action, Romance, Sci-Fi, Western, Documentary, Thriller, Adventure,
 *  Musical, Film Noir, Silent, Short, Sports, Prelinger, TV Archive) and is cached for an hour. */
export async function loadArchiveRails(limitPerGenre = 50): Promise<TaleoRail[]> {
  const collections = await fetchArchiveByAllGenres(limitPerGenre).catch(() => []);
  return dedupe(collections.map(c => ({
    id: `arch-${c.genre.toLowerCase().replace(/\s+/g, '-')}`,
    title: c.genre,
    items: c.items.map(archItem),
  })));
}
