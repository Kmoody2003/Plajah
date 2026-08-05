// licenseAttach — attach a licensed Chora track to a Fabula project (film) from
// OUTSIDE the Fabula editor. When a filmmaker licenses a song in Chora, we drop it
// straight into the chosen film's Media Pool ("Licensed Music" bin) and persist the
// project, so it's waiting on the timeline when they next open the film — and shows
// up in their Fabula film hub. The sync-license grant itself is keyed by editId
// (= projectId) via the normal Stripe flow.
import type { Track, Album } from '../types';
import type { MusicBinTrack } from './fabulaMusic';
import { loadProjectCloud, saveProjectCloud } from './fabulaProjects';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Normalize a Chora Track (+ its Album) into the licensing MusicBinTrack shape. */
export function choraTrackToMusicBin(t: Track, album: Album): MusicBinTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist || album.artist,
    url: t.url,
    duration: t.duration,
    license: t.license,
    rightsOwnerId: t.rightsOwnerId || album.ownerId,
    albumTitle: album.title,
    albumId: album.id,
    syncLicenseFee: Number(t.syncLicenseFee || 0),
    syncLicenseTerms: t.syncLicenseTerms,
    cover: (album as any).coverImage || (t as any).albumCover,
    genre: t.genre || (album as any).genre,
  };
}

/**
 * Add a licensed track to a Fabula project's Media Pool and save it. Mirrors
 * Fabula's in-editor `addLicensedTrackToPool` so the asset shape is identical
 * (bin "Licensed Music", musicMeta with licensedEditId). Dedupes by musicTrackId.
 * Returns { ok, already, title } so the caller can toast appropriately.
 */
export async function attachLicensedTrackToProject(
  projectId: string,
  track: MusicBinTrack,
): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  if (!projectId || !track?.id) return { ok: false, error: 'missing-args' };
  const project = await loadProjectCloud(projectId);
  if (!project) return { ok: false, error: 'project-not-found' };
  project.mediaPool = project.mediaPool || [];
  if (project.mediaPool.some((m: any) => m.musicTrackId === track.id)) {
    return { ok: true, already: true };
  }
  project.mediaPool.push({
    id: uid(),
    musicTrackId: track.id,
    name: `${track.title} — ${track.artist}`,
    type: 'audio',
    url: track.url || '',
    duration: track.duration || 0,
    bin: 'Licensed Music',
    tags: ['music', 'licensed'],
    musicMeta: { ...track, licensedEditId: projectId },
  });
  const res = await saveProjectCloud(project);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
