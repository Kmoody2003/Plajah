// JSON Chapters (application/json+chapters, spec version 1.2.0) for one episode.
// Sources, first match wins: owner-set chapters in podcast20 settings, chapters already on the track
// document (runtime field `chapters`/`podcastChapters`), then a Chora mix cue sheet for a mix's master track.

import type { Chapter, Podcast20Settings } from './types';

export const CHAPTERS_MIME = 'application/json+chapters';

export interface ChaptersDoc {
  version: '1.2.0';
  chapters: Array<{ startTime: number; title?: string; img?: string; url?: string; toc?: boolean; endTime?: number }>;
  author?: string;
  title?: string;
  podcastName?: string;
}

type AlbumLike = { title?: string; artist?: string; subType?: string; mixMeta?: { cueSheet?: Array<{ time: number; title: string; artist?: string }> }; tracks?: Array<{ id: string }> };
type TrackLike = { id: string; title?: string; duration?: number };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function fromTrackField(track: TrackLike): Chapter[] {
  const raw = (track as any).chapters ?? (track as any).podcastChapters;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any) => ({ startTime: Number(c?.startTime ?? c?.time ?? c?.start), title: typeof c?.title === 'string' ? c.title : (typeof c?.label === 'string' ? c.label : undefined), img: typeof c?.img === 'string' ? c.img : undefined, url: typeof c?.url === 'string' ? c.url : undefined }))
    .filter((c: Chapter) => Number.isFinite(c.startTime) && c.startTime >= 0);
}

/** Raw chapter list for a track, before normalisation. */
export function chapterSource(album: AlbumLike, track: TrackLike, settings?: Podcast20Settings): Chapter[] {
  const owner = settings?.episodes?.[track.id]?.chapters;
  if (owner?.length) return owner;
  const onTrack = fromTrackField(track);
  if (onTrack.length) return onTrack;
  const cues = album.mixMeta?.cueSheet;
  if (album.subType === 'MIX' && cues?.length && album.tracks?.[0]?.id === track.id) {
    return cues.map(c => ({ startTime: Number(c.time), title: c.artist ? `${c.artist} - ${c.title}` : c.title }));
  }
  return [];
}

/** Sort, drop duplicates/out-of-range points, clamp to the episode length. */
export function normalizeChapters(list: Chapter[], durationSec?: number): Chapter[] {
  const dur = durationSec && durationSec > 0 ? durationSec : undefined;
  const sorted = list
    .filter(c => Number.isFinite(c.startTime) && c.startTime >= 0 && (dur === undefined || c.startTime < dur))
    .map(c => ({ ...c, startTime: round3(c.startTime) }))
    .sort((a, b) => a.startTime - b.startTime);
  const out: Chapter[] = [];
  for (const c of sorted) {
    if (out.length && out[out.length - 1].startTime === c.startTime) continue;
    const next: Chapter = { startTime: c.startTime };
    if (c.title) next.title = c.title.slice(0, 256);
    if (c.img) next.img = c.img;
    if (c.url) next.url = c.url;
    if (c.toc === false) next.toc = false;
    if (c.endTime !== undefined && c.endTime > c.startTime) next.endTime = round3(dur ? Math.min(c.endTime, dur) : c.endTime);
    out.push(next);
  }
  return out;
}

export function buildChaptersDoc(album: AlbumLike, track: TrackLike, settings?: Podcast20Settings): ChaptersDoc | null {
  const chapters = normalizeChapters(chapterSource(album, track, settings), track.duration);
  if (!chapters.length) return null;
  return {
    version: '1.2.0',
    ...(track.title ? { title: track.title } : {}),
    ...(album.title ? { podcastName: album.title } : {}),
    ...(album.artist ? { author: album.artist } : {}),
    chapters,
  };
}

export const hasChapters = (album: AlbumLike, track: TrackLike, settings?: Podcast20Settings): boolean =>
  normalizeChapters(chapterSource(album, track, settings), track.duration).length > 0;
