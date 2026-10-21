/**
 * PeerTube catalog for Cinema — films and documentaries only.
 *
 * Open federation search (Sepia) surfaces TV rips and unlicensed uploads, so Cinema
 * never searches the fediverse. It reads a fixed allowlist of channels whose owners
 * publish the work themselves (Blender Studio) or label every upload with a
 * Creative Commons / public-domain licence (fedi.video curators).
 *
 * Videos stream from their home server (MP4 or HLS) and are never copied into the
 * film vault or Mux — several are NC/ND-licensed, so playback stays at the source.
 */
import type { ArchiveVideo } from './archiveContentService';

interface PeerTubeChannelSource {
  host: string;
  channel: string;
  /** Rail the channel's videos land in. */
  shelf: 'OPEN_MOVIES' | 'DOCUMENTARIES';
  provider: string;
  /** Uploads append taglines ("Charge - Blender Open Movie"); keep only the film's name. */
  trimTitleTagline?: boolean;
  /** Blender Studio leaves many uploads as "Unknown" licence; its open movies are CC. */
  fallbackRights?: string;
  /** Only keep videos with an explicit CC/PD licence. */
  requireLicence: boolean;
  minDurationSec?: number;
}

export const PEERTUBE_CHANNELS: PeerTubeChannelSource[] = [
  {
    host: 'video.blender.org',
    channel: 'blender_open_movies',
    shelf: 'OPEN_MOVIES',
    provider: 'Blender Studio',
    trimTitleTagline: true,
    fallbackRights: 'Creative Commons · Blender Open Movie',
    requireLicence: false,
  },
  {
    host: 'fedi.video',
    channel: 'documentaries',
    shelf: 'DOCUMENTARIES',
    provider: 'fedi.video',
    requireLicence: true,
  },
  {
    host: 'fedi.video',
    channel: 'historical',
    shelf: 'DOCUMENTARIES',
    provider: 'fedi.video',
    requireLicence: true,
    minDurationSec: 8 * 60,
  },
];

/** PeerTube licence ids 1–7 are the CC family and Public Domain Dedication. */
const OPEN_LICENCE_IDS = new Set([1, 2, 3, 4, 5, 6, 7]);
const LICENCE_LABELS: Record<number, string> = {
  1: 'CC BY',
  2: 'CC BY-SA',
  3: 'CC BY-ND',
  4: 'CC BY-NC',
  5: 'CC BY-NC-SA',
  6: 'CC BY-NC-ND',
  7: 'Public Domain',
};

/** Behind-the-scenes uploads move to the documentary shelf; teasers and pitches are dropped. */
const MAKING_OF = /\bmaking[ -]of\b/i;
const NOT_A_FILM = /\bteaser\b|\btrailer\b|what will you get|60fps 4k/i;

export const PEERTUBE_ID_PREFIX = 'peertube_';

export const isPeerTubeItem = (item: any): boolean =>
  item?.source === 'PEERTUBE' || String(item?.id || item?.identifier || '').startsWith(PEERTUBE_ID_PREFIX);

const fetchJson = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`PeerTube ${res.status} for ${url}`);
  return res.json();
};

const formatRuntime = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

const firstParagraph = (text: string) =>
  String(text || '').split(/\n\s*\n/).map(s => s.trim()).find(Boolean) || '';

/** Blender descriptions open with a Blender Studio pitch, then "--", then the synopsis. */
const synopsisOf = (text: string) => {
  const parts = String(text || '').split(/\s*\n\s*--+\s*\n\s*/);
  return (parts.length > 1 ? parts.slice(1).join('\n\n') : parts[0]).trim();
};

const mapVideo = (v: any, src: PeerTubeChannelSource): ArchiveVideo | null => {
  if (v.nsfw || v.isLive) return null;
  const licenceId = v.licence?.id;
  const hasOpenLicence = OPEN_LICENCE_IDS.has(licenceId);
  if (src.requireLicence && !hasOpenLicence) return null;
  if (src.minDurationSec && v.duration < src.minDurationSec) return null;
  if (NOT_A_FILM.test(v.name)) return null;

  const isMakingOf = MAKING_OF.test(v.name);
  const year = String(v.originallyPublishedAt || v.publishedAt || '').slice(0, 4);
  const titleYear = v.name.match(/\((\d{4})\)/)?.[1];
  const base = `https://${src.host}`;
  const title = src.trimTitleTagline
    ? v.name.split(/\s+[-–]\s+/)[0].replace(/^"(.*)"$/, '$1')
    : v.name.replace(/\s*\((\d{4})\)\s*\(.*\)\s*$/, ' ($1)');
  return {
    identifier: `${PEERTUBE_ID_PREFIX}${src.host}_${v.shortUUID || v.uuid}`,
    title: title.trim(),
    description: synopsisOf(v.description || v.truncatedDescription || ''),
    mediatype: 'movies',
    collection: [src.host, src.channel],
    genre: src.shelf === 'OPEN_MOVIES' && !isMakingOf ? 'Animation' : 'Documentary',
    thumbnailUrl: `${base}${v.previewPath || v.thumbnailPath}`,
    year: titleYear || year,
    runtime: formatRuntime(v.duration),
    source: 'PEERTUBE',
    embedUrl: `${base}/videos/embed/${v.shortUUID || v.uuid}?autoplay=1&title=0&warningTitle=0&peertubeLink=0`,
    sourceUrl: `${base}/w/${v.shortUUID || v.uuid}`,
    dataProvider: src.provider,
    director: v.channel?.displayName || src.provider,
    rights: hasOpenLicence ? LICENCE_LABELS[licenceId] : (src.fallbackRights || 'See source'),
    language: v.language?.label && v.language.label !== 'Unknown' ? v.language.label : undefined,
    subType: 'MOVIE',
    curatorNote: isMakingOf ? 'Behind the scenes of a Blender Studio open movie.' : undefined,
  };
};

const fetchChannel = async (src: PeerTubeChannelSource): Promise<ArchiveVideo[]> => {
  const data = await fetchJson(
    `https://${src.host}/api/v1/video-channels/${encodeURIComponent(src.channel)}/videos?count=100&sort=-publishedAt&skipCount=true&nsfw=false`
  );
  return (data.data || []).map((v: any) => mapVideo(v, src)).filter(Boolean) as ArchiveVideo[];
};

export interface PeerTubeShelves {
  openMovies: ArchiveVideo[];
  documentaries: ArchiveVideo[];
}

let shelvesCache: { at: number; value: Promise<PeerTubeShelves> } | null = null;
const SHELF_TTL_MS = 60 * 60 * 1000;

/** Cinema's two PeerTube rails. A channel that fails to load is skipped, never substituted. */
export const fetchPeerTubeShelves = (): Promise<PeerTubeShelves> => {
  if (shelvesCache && Date.now() - shelvesCache.at < SHELF_TTL_MS) return shelvesCache.value;
  const value = Promise.allSettled(PEERTUBE_CHANNELS.map(fetchChannel)).then(results => {
    const openMovies: ArchiveVideo[] = [];
    const documentaries: ArchiveVideo[] = [];
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const isFilmShelf = PEERTUBE_CHANNELS[i].shelf === 'OPEN_MOVIES';
      for (const film of r.value) {
        (isFilmShelf && film.genre !== 'Documentary' ? openMovies : documentaries).push(film);
      }
    });
    // Feature-length documentaries lead; making-ofs and short PSAs follow. Episodes of a
    // series ("… - Episode 3 - …") stay together in episode order.
    const minutes = (f: ArchiveVideo) => {
      const [, h = '0', m = '0'] = String(f.runtime).match(/(?:(\d+)h\s*)?(\d+)\s*m/) || [];
      return Number(h) * 60 + Number(m);
    };
    const episode = (f: ArchiveVideo) => f.title.match(/^(.*?)\s*-\s*Episode\s+(\d+)/i);
    const seriesOf = (f: ArchiveVideo) => episode(f)?.[1] || f.title;
    const seriesLength = new Map<string, number>();
    for (const f of documentaries) {
      seriesLength.set(seriesOf(f), Math.max(seriesLength.get(seriesOf(f)) || 0, minutes(f)));
    }
    documentaries.sort((a, b) =>
      Number(!!a.curatorNote) - Number(!!b.curatorNote)
      || seriesLength.get(seriesOf(b))! - seriesLength.get(seriesOf(a))!
      || seriesOf(a).localeCompare(seriesOf(b))
      || Number(episode(a)?.[2] || 0) - Number(episode(b)?.[2] || 0));
    return { openMovies, documentaries };
  });
  shelvesCache = { at: Date.now(), value };
  value.catch(() => { shelvesCache = null; });
  return value;
};

/**
 * Full record for one video. `streamUrl` is a progressive MP4 (≤1080p) when the server
 * keeps web videos, else its HLS master playlist, else '' so the player falls back to
 * the PeerTube embed. Channel listings only carry a truncated description, so the full
 * synopsis comes from here too.
 */
export const resolvePeerTubeVideo = async (identifier: string): Promise<{ streamUrl: string; description?: string }> => {
  const rest = identifier.slice(PEERTUBE_ID_PREFIX.length);
  const sep = rest.lastIndexOf('_');
  if (!identifier.startsWith(PEERTUBE_ID_PREFIX) || sep < 0) return { streamUrl: '' };
  const host = rest.slice(0, sep);
  if (!PEERTUBE_CHANNELS.some(c => c.host === host)) return { streamUrl: '' };
  const v = await fetchJson(`https://${host}/api/v1/videos/${encodeURIComponent(rest.slice(sep + 1))}`);
  const mp4s = (v.files || [])
    .filter((f: any) => f.fileUrl && f.resolution?.id > 0 && f.resolution.id <= 1080)
    .sort((a: any, b: any) => b.resolution.id - a.resolution.id);
  return {
    streamUrl: mp4s[0]?.fileUrl || v.streamingPlaylists?.[0]?.playlistUrl || '',
    description: v.description ? synopsisOf(v.description) : undefined,
  };
};

/**
 * Album shape for MovieUXView. Deliberately has no `identifier` and an ownerId other
 * than 'internet-archive', so the archive resolver and ensure-on-platform ingest never run.
 */
export const peerTubeVideoToAlbum = (item: ArchiveVideo, streamUrl?: string): any => ({
  id: item.identifier,
  title: item.title,
  artist: item.director || item.dataProvider,
  director: item.director,
  description: item.description,
  coverImage: item.thumbnailUrl,
  thumbnailUrl: item.thumbnailUrl,
  headerImage: item.thumbnailUrl,
  type: 'MOVIES' as const,
  subType: 'MOVIE' as const,
  isMovie: true,
  genre: item.genre,
  year: item.year,
  runtime: item.runtime,
  language: item.language,
  releaseDate: item.year ? `${item.year}-01-01` : new Date().toISOString(),
  ownerId: 'peertube',
  isPublic: true,
  url: streamUrl || undefined,
  videoUrl: streamUrl || undefined,
  customVideoUrl: streamUrl || undefined,
  embedUrl: item.embedUrl,
  source: 'PEERTUBE',
  sourceUrl: item.sourceUrl,
  dataProvider: item.dataProvider,
  rights: item.rights,
  curatorNote: item.curatorNote,
  movieMetadata: {
    director: item.director,
    releaseYear: item.year ? parseInt(item.year, 10) : undefined,
    duration: item.runtime,
    rating: 'NR',
    synopsis: firstParagraph(item.description),
  },
});
