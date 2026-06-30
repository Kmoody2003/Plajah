// studioService.ts — turns a recorded studio master into a published podcast episode. Uploads the
// audio, then appends it as an episode (Track w/ podcastMetadata) to the user's podcast Album —
// creating the show on the first episode — so it flows straight into the existing RSS generation +
// distribution hub.

import { auth, uploadFile, publishToCloud, updateAlbum, fetchUserAlbums } from '../backendService';
import type { Album, Track } from '../../types';

export interface SaveEpisodeOpts {
  uid: string;
  blob: Blob;
  title: string;
  durationMs: number;
  albumId?: string;       // append to a specific show; else the user's first PODCAST album, else new
  showTitle?: string;
  description?: string;
  coverImage?: string;
}
export interface SavedEpisode { albumId: string; trackId: string; episodeNumber: number }

export async function saveStudioEpisode(opts: SaveEpisodeOpts): Promise<SavedEpisode> {
  const { uid, blob, durationMs } = opts;
  const title = opts.title?.trim() || 'Untitled Episode';
  const artist = auth.currentUser?.displayName || 'Host';
  const epId = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const url = await uploadFile(`podcasts/${uid}/${epId}.webm`, blob);

  const track: Track = {
    id: epId, title, artist, url,
    duration: Math.round(durationMs / 1000),
    podcastMetadata: { episodeNumber: 1, showTitle: opts.showTitle || title },
  };

  // pick a target show
  let albumId = opts.albumId;
  const albums = await fetchUserAlbums(uid).catch(() => [] as Album[]);
  if (!albumId) albumId = albums.find(a => a.subType === 'PODCAST')?.id;

  if (albumId) {
    const album = albums.find(a => a.id === albumId);
    const tracks = [...(album?.tracks || []), track];
    const episodeNumber = tracks.length;
    track.podcastMetadata!.episodeNumber = episodeNumber;
    await updateAlbum(albumId, { tracks });
    return { albumId, trackId: epId, episodeNumber };
  }

  // first episode → create the show
  const album: Album = {
    id: `album_${Date.now()}`,
    ownerId: uid,
    title: opts.showTitle || title,
    artist,
    coverImage: opts.coverImage || '',
    description: opts.description || '',
    tracks: [track],
    createdAt: Date.now(),
    themeColor: '#FF8C00',
    type: 'MUSIC',
    subType: 'PODCAST',
    genre: 'Podcast',
    isPublic: true,
  };
  await publishToCloud(album);
  return { albumId: album.id, trackId: epId, episodeNumber: 1 };
}
