// Music Intelligence — the pipeline driver.
//
// Runs inside an API request (Cloud Run only gives CPU while a request is open), bounded by a
// time budget, and RESUMABLE: every finished song is written before the next starts, and the
// job doc records which url each song was heard at. Whoever calls next — the uploader's
// browser looping on /analyze, an album page asking for its report, or the cron — picks up
// where the last run stopped. A lease on the job doc keeps two runs off the same album.
//
//   1. For each song not yet heard at its current url: make sure it has lyrics (the Chora lyric
//      sync), measure the audio (dsp.ts), then have the listening model hear the recording
//      with those facts + lyrics + the creator's notes, and normalise its read.
//   2. When every song is in: synthesise the album read (overview, sequencing, liner notes,
//      host intro/outro), with the film's Story Intelligence report as context when this is
//      the creator's soundtrack for one of their films.
//
// All I/O is injected (see routes/musicIntel.ts for the real wiring, tests for fakes).

import { measureAudio } from './dsp';
import {
  albumPrompt, looksLikeSoundtrack, normalizeAlbumIntel, normalizeTrackIntel, parseJsonLoose, trackPrompt,
} from './prompts';
import {
  MUSIC_INTEL_VERSION, type FilmContext, type MeasuredAudio, type MusicIntelJob, type TrackIntel,
} from './types';

export interface IntelTrack {
  id: string;
  title?: string;
  url?: string;
  mediaKind?: string;
  lyrics?: string;
  timeCodedLyrics?: { time: number; text: string }[];
  artistNotes?: string[];
  description?: string;
}

export interface IntelAlbum {
  id: string;
  ownerId?: string;
  title?: string;
  artist?: string;
  type?: string;
  genre?: string;
  tags?: string[];
  description?: string;
  linerNotes?: string;
  relatedProjectIds?: string[];
  tracks?: IntelTrack[];
}

export interface MusicIntelDeps {
  readAlbum(albumId: string): Promise<IntelAlbum | null>;
  readJob(albumId: string): Promise<MusicIntelJob | null>;
  patchJob(albumId: string, patch: Partial<MusicIntelJob> & Record<string, unknown>): Promise<void>;
  readTracks(albumId: string): Promise<Record<string, TrackIntel>>;
  writeTrack(albumId: string, intel: TrackIntel): Promise<void>;
  /** Decode to interleaved f32 PCM. Null when the file can't be decoded. */
  decode(url: string): Promise<{ pcm: Float32Array; sampleRate: number; channels: 1 | 2 } | null>;
  /** A compressed copy the listening model can take inline. */
  encodeForListening(url: string): Promise<{ base64: string; mimeType: string } | null>;
  /** Listening model: audio + prompt → raw text (JSON expected). */
  listen(prompt: string, audio: { base64: string; mimeType: string } | null): Promise<string>;
  /** Text-only model call → raw text (JSON expected). */
  think(prompt: string): Promise<string>;
  /** Make sure the song has synced lyrics; returns them (empty for instrumentals). */
  ensureLyrics?(album: IntelAlbum, track: IntelTrack): Promise<{ time: number; text: string }[]>;
  /** The creator's film this soundtrack belongs to, with its Story Intelligence read. */
  findFilm?(album: IntelAlbum): Promise<FilmContext>;
  now?(): number;
}

export interface RunOptions {
  budgetMs?: number;
  /** Re-hear every song even if its url is unchanged. */
  force?: boolean;
  /** Owner of the run (written on first create). */
  ownerId?: string;
  /** Only re-synthesise the album read (e.g. the film's Story Intelligence just landed). */
  albumOnly?: boolean;
}

export interface RunSummary {
  status: MusicIntelJob['status'] | 'BUSY' | 'NOT_MUSIC' | 'MISSING';
  heard: number;
  remaining: number;
  errors: string[];
}

export const LEASE_MS = 9 * 60 * 1000;
const MAX_TRACK_ATTEMPTS = 3;
const DEFAULT_BUDGET_MS = 6 * 60 * 1000;

export function audioTracks(album: IntelAlbum): IntelTrack[] {
  return (album.tracks || []).filter(t => t?.id && t.mediaKind !== 'VIDEO' && /^https?:/i.test(String(t.url || '')));
}

export function lyricText(t: IntelTrack, synced?: { time: number; text: string }[]): string {
  if (t.lyrics?.trim()) return t.lyrics;
  const lines = (t.timeCodedLyrics?.length ? t.timeCodedLyrics : synced) || [];
  return lines.map(l => l.text).filter(x => x && !/^\(?\s*instrumental\s*\)?$/i.test(x.trim())).join('\n');
}

/** Songs that still need hearing at their current url. */
export function pendingTracks(album: IntelAlbum, job: MusicIntelJob | null, force = false): IntelTrack[] {
  const heard = job?.heard || {};
  const attempts = ((job as any)?.attempts || {}) as Record<string, number>;
  return audioTracks(album).filter(t => force || (heard[t.id] !== t.url && (attempts[t.id] || 0) < MAX_TRACK_ATTEMPTS));
}

export async function runMusicIntel(deps: MusicIntelDeps, albumId: string, opts: RunOptions = {}): Promise<RunSummary> {
  const now = deps.now || Date.now;
  const started = now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const errors: string[] = [];

  const album = await deps.readAlbum(albumId);
  if (!album) return { status: 'MISSING', heard: 0, remaining: 0, errors };
  if (album.type && album.type !== 'MUSIC') return { status: 'NOT_MUSIC', heard: 0, remaining: 0, errors };

  let job = await deps.readJob(albumId);
  const lease = Number((job as any)?.leaseUntil) || 0;
  if (lease > now()) return { status: 'BUSY', heard: 0, remaining: pendingTracks(album, job, false).length, errors };

  const tracks = audioTracks(album);
  const isSoundtrack = looksLikeSoundtrack(album);
  const heard: Record<string, string> = { ...(job?.heard || {}) };
  // Forget songs that left the album.
  for (const id of Object.keys(heard)) if (!tracks.some(t => t.id === id)) delete heard[id];
  const attempts: Record<string, number> = opts.force ? {} : { ...((job as any)?.attempts || {}) };
  const todo = opts.albumOnly ? [] : pendingTracks(album, job, opts.force);

  await deps.patchJob(albumId, {
    albumId,
    ownerId: job?.ownerId || opts.ownerId || album.ownerId || '',
    status: todo.length ? 'LISTENING' : 'SYNTHESIZING',
    progress: { done: tracks.length - todo.length, total: tracks.length, note: todo.length ? 'Listening' : 'Writing the album read' },
    isSoundtrack,
    heard,
    attempts,
    version: MUSIC_INTEL_VERSION,
    createdAt: job?.createdAt || now(),
    updatedAt: now(),
    leaseUntil: now() + LEASE_MS,
  });

  // Film context first: the songs are heard in its light when it exists.
  let film: FilmContext | undefined = job?.film;
  if (isSoundtrack && deps.findFilm && film?.status !== 'LINKED') {
    try { film = await deps.findFilm(album); } catch { film = { status: 'NONE' }; }
    await deps.patchJob(albumId, { film });
  }

  const existing = await deps.readTracks(albumId);
  const measuredById: Record<string, MeasuredAudio | null> = {};
  let heardNow = 0;

  for (const t of todo) {
    if (now() - started > budget) break;
    const n = tracks.findIndex(x => x.id === t.id);
    await deps.patchJob(albumId, {
      progress: { done: tracks.length - todo.length + heardNow, total: tracks.length, note: `Listening to “${t.title || `track ${n + 1}`}”` },
      updatedAt: now(),
      leaseUntil: now() + LEASE_MS,
    });
    try {
      let synced: { time: number; text: string }[] | undefined;
      if (!t.lyrics?.trim() && !t.timeCodedLyrics?.length && deps.ensureLyrics) {
        try { synced = await deps.ensureLyrics(album, t); } catch { /* lyrics are a bonus layer */ }
      }
      const lyrics = lyricText(t, synced);

      let measured: MeasuredAudio | null = null;
      try {
        const pcm = await deps.decode(t.url!);
        if (pcm) measured = measureAudio(pcm.pcm, pcm.sampleRate, pcm.channels);
      } catch (e: any) { errors.push(`${t.id}: measure ${e?.message || e}`); }
      measuredById[t.id] = measured;

      const audio = await deps.encodeForListening(t.url!).catch(() => null);
      const prompt = trackPrompt({
        albumTitle: album.title || 'Untitled', artist: album.artist || 'the artist', genre: album.genre,
        trackTitle: t.title || `Track ${n + 1}`, trackNumber: n + 1, trackCount: tracks.length,
        creatorNotes: [t.description, ...(t.artistNotes || [])].filter(Boolean).join('\n'),
        lyrics, measured, film,
      });
      const raw = parseJsonLoose(await deps.listen(prompt, audio));
      if (!raw) throw new Error('listening model returned no JSON');
      const intel = normalizeTrackIntel(raw, {
        trackId: t.id, title: t.title || `Track ${n + 1}`, version: MUSIC_INTEL_VERSION,
        analyzedAt: now(), sourceUrl: t.url!, measured,
      }, lyrics);
      await deps.writeTrack(albumId, intel);
      existing[t.id] = intel;
      heard[t.id] = t.url!;
      delete attempts[t.id];
      heardNow++;
    } catch (e: any) {
      attempts[t.id] = (attempts[t.id] || 0) + 1;
      errors.push(`${t.id}: ${e?.message || e}`);
    }
    await deps.patchJob(albumId, { heard, attempts, updatedAt: now() });
  }

  const remaining = pendingTracks(album, { ...(job as any), heard, attempts } as MusicIntelJob, false).length;
  if (remaining > 0) {
    await deps.patchJob(albumId, {
      status: 'LISTENING',
      progress: { done: tracks.length - remaining, total: tracks.length, note: 'Listening — continues in the background' },
      updatedAt: now(), leaseUntil: 0,
    });
    return { status: 'LISTENING', heard: heardNow, remaining, errors };
  }

  // Every song is in (or has exhausted its retries): write the album read.
  const reads = tracks.map(t => existing[t.id]).filter(Boolean) as TrackIntel[];
  if (!reads.length) {
    await deps.patchJob(albumId, { status: 'FAILED', error: errors[0] || 'No song could be heard', updatedAt: now(), leaseUntil: 0 });
    return { status: 'FAILED', heard: heardNow, remaining: 0, errors };
  }
  await deps.patchJob(albumId, { status: 'SYNTHESIZING', progress: { done: tracks.length, total: tracks.length, note: 'Writing the album read' }, updatedAt: now() });
  try {
    const raw = parseJsonLoose(await deps.think(albumPrompt({
      albumTitle: album.title || 'Untitled', artist: album.artist || 'the artist', genre: album.genre,
      description: album.description, creatorLinerNotes: album.linerNotes,
      tracks: reads,
      measured: reads.map(r => measuredById[r.trackId] ?? r.measured ?? null),
      film,
    })));
    if (!raw) throw new Error('album synthesis returned no JSON');
    const { filmConnection, ...albumIntel } = normalizeAlbumIntel(raw, reads.map(r => r.trackId));
    const status = reads.length < tracks.length ? 'PARTIAL' : 'READY';
    await deps.patchJob(albumId, {
      status,
      album: albumIntel,
      ...(film ? { film: { ...film, ...(filmConnection ? { connection: filmConnection } : {}) } } : {}),
      progress: { done: tracks.length, total: tracks.length },
      error: '',
      updatedAt: now(), leaseUntil: 0,
    });
    return { status, heard: heardNow, remaining: 0, errors };
  } catch (e: any) {
    errors.push(`album: ${e?.message || e}`);
    await deps.patchJob(albumId, { status: 'PARTIAL', error: 'Album read could not be written yet', updatedAt: now(), leaseUntil: 0 });
    return { status: 'PARTIAL', heard: heardNow, remaining: 0, errors };
  }
}
