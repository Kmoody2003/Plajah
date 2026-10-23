// publishAsUser — the records an admin writes when publishing a music album ON BEHALF of another user.
//
// Pure builders, no I/O: scripts/publishAlbumForUser.ts (the manual seed) and the admin route
// POST /api/admin/publish-as/* both build their Firestore docs here, so a seeded album is
// indistinguishable from one the artist uploaded through AlbumCreator → publishToCloud.
//
// Attribution rule: EVERY ownership field names the target user (album.ownerId, track.rightsOwnerId,
// track.artistId, mediaAssets.artistId, feed.authorId, Storage ownerUid). The admin who did the work
// appears nowhere on the content; the server keeps its own audit record in adminPublishLog.

export interface PublishAsTrackInput {
  id: string;
  title: string;
  url: string;
  storagePath: string;
  durationSec?: number;
  trackNo: number;
}

export interface PublishAsAlbumInput {
  albumId: string;
  ownerUid: string;
  title: string;
  artist: string;
  genre: string;
  description?: string;
  tags?: string[];
  cover: { display: string; thumb?: string; original: string };
  artistImage?: string;
  tracks: PublishAsTrackInput[];
  createdAt: number;
  releaseDate?: string;
  license?: string;
  themeColor?: string;
}

export const PUBLISH_AS_ORIGIN = 'https://plajah.com';

/** Track ids double as choraStreams doc ids, which are global, so they are derived from the album id. */
export const publishAsTrackId = (albumId: string, trackNo: number): string =>
  `${albumId.replace(/^album_/, '')}_t${String(trackNo).padStart(2, '0')}`;

/** "07_whyisitevertime.wav" → "whyisitevertime"; a fallback title only — real titles come from the uploader. */
export const titleFromFilename = (name: string): string =>
  name.replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[\s._-]*/, '').replace(/[._]+$/, '').replace(/[_]+/g, ' ').trim() || 'Untitled';

export const slugify = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'album';

export function buildPublishAsAlbum(i: PublishAsAlbumInput): Record<string, unknown> {
  const license = i.license || 'ALL_RIGHTS_RESERVED';
  return {
    id: i.albumId,
    ownerId: i.ownerUid,
    title: i.title,
    artist: i.artist,
    type: 'MUSIC',
    genre: i.genre,
    description: i.description || '',
    ...(i.tags?.length ? { tags: i.tags } : {}),
    coverImage: i.cover.display,
    coverThumb: i.cover.thumb || i.cover.display,
    coverOriginal: i.cover.original,
    artistImage: i.artistImage || i.cover.display,
    ...(i.themeColor ? { themeColor: i.themeColor } : {}),
    price: 0,
    isPaywalled: false,
    previewOnly: false,
    license,
    tracks: i.tracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: i.artist,
      artistId: i.ownerUid,
      url: t.url,
      ...(t.durationSec ? { duration: Math.round(t.durationSec) } : {}),
      trackNo: t.trackNo,
      genre: i.genre,
      price: 0,
      isPaywalled: false,
      license,
      mediaKind: 'AUDIO',
      isGlobalArchive: true,
      rightsOwnerId: i.ownerUid,
    })),
    createdAt: i.createdAt,
    ...(i.releaseDate ? { releaseDate: i.releaseDate } : {}),
    isPublic: true,
    isPrivate: false,   // fetchAllPublicAlbums queries isPrivate == false, so it must be present
    isDraft: false,
    isScheduled: false,
    galleryUrl: '',
    likesCount: 0,
    commentsCount: 0,
  };
}

/** mediaAssets/{albumId}: the same record upsertMediaAssetFromAlbum writes on a normal publish. */
export function buildPublishAsMediaAsset(album: Record<string, any>): Record<string, unknown> {
  return {
    id: album.id,
    artistId: album.ownerId,
    title: album.title || 'Untitled',
    type: 'MUSIC',
    service: 'CHORA',
    status: 'PUBLIC',
    originUrl: `${PUBLISH_AS_ORIGIN}/share?type=album&id=${encodeURIComponent(album.id)}`,
    cover: album.coverImage,
    ...(album.releaseDate ? { releaseDate: album.releaseDate } : {}),
    playCount: 0,
    updatedAt: Date.now(),
  };
}

/** feed doc: the artist's own "just published" card, authored by the artist (never the admin). */
export function buildPublishAsFeedItem(album: Record<string, any>, owner: { displayName?: string; photoURL?: string }): Record<string, unknown> {
  const first = album.tracks?.[0];
  const now = Date.now();
  return {
    authorId: album.ownerId,
    authorName: owner.displayName || album.artist || 'Artist',
    authorPhoto: owner.photoURL || '',
    type: 'SONG',
    content: `Just published a new music: ${album.title}`,
    imageUrl: album.coverImage,
    albumId: album.id,
    songTitle: first?.title || album.title,
    songUrl: first?.url || '',
    shareCount: 0,
    timestamp: now,
    score: 0,
    scoreUpdatedAt: now,
    interactions: { deep: {}, medium: {}, base: {}, dmSharerIds: [] },
  };
}

/** choraStreams/{trackId}: queue the HLS/FLAC transcode exactly as /api/chora/enqueue-album does. */
export function buildPublishAsStreamJob(album: Record<string, any>, track: { id: string; url: string }): Record<string, unknown> {
  return { status: 'pending', srcUrl: track.url, ownerId: album.ownerId, albumId: album.id, updatedAt: Date.now() };
}
