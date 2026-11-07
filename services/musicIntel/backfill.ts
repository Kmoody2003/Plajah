// Track-analysis backfill — gives songs uploaded before analysis moved to upload time the same shared
// record new uploads get: waveform peaks, beat grid, meter and the song map in `trackAnalysis/{trackId}`,
// plus the song map on the song's Music Intelligence read when it has one.
//
// Audio only (decode → DSP), no listening model, so it costs nothing per song. Budgeted and resumable:
// albums are walked in id order from a saved cursor, a song that already has a current analysis with a
// song map is skipped with one read, and every finished song is written before the next starts.
//
// All I/O is injected (routes/musicIntel.ts wires the real thing; tests use fakes).

import { measureAudio } from './dsp';
import { analysisFromMono, downmix, ANALYSIS_VERSION } from '../trackAnalysisCore';
import { buildSongMap, fineEnvelope, type SongMap } from '../fabula/songMap';
import type { AudioAnalysis } from '../../types';
import type { MeasuredAudio } from './types';
import type { IntelAlbum, IntelTrack } from './worker';

export interface DecodedAudio { pcm: Float32Array; sampleRate: number; channels: 1 | 2 }

/** Everything one decode gives: the measurement, the shared analysis and the song map. */
export function analyzeDecoded(d: DecodedAudio): { measured: MeasuredAudio; analysis: AudioAnalysis; songMap: SongMap; duration: number } {
  const measured = measureAudio(d.pcm, d.sampleRate, d.channels);
  const mono = downmix(d.pcm, d.channels), duration = mono.length / d.sampleRate;
  const analysis = analysisFromMono(mono, d.sampleRate, duration);
  const songMap = buildSongMap(measured, { bpm: analysis.bpm, firstBeat: analysis.downbeatSec ?? analysis.firstBeatSec }, fineEnvelope(mono, d.sampleRate));
  return { measured, analysis, songMap, duration };
}

/** A stored analysis that predates the current algorithm, or has no song map, gets redone. */
export function needsBackfill(a: Partial<AudioAnalysis> | null | undefined): boolean {
  return !a || !a.songMap || (a.version ?? 0) < ANALYSIS_VERSION || !a.peaks?.length;
}

/** Songs worth analysing: audio with a url (video tracks belong to Story Intelligence). */
export function audioTracks(album: IntelAlbum): IntelTrack[] {
  if (album.type && album.type !== 'MUSIC') return [];
  return (album.tracks || []).filter(t => t?.id && t.url && !/video/i.test(String(t.mediaKind || '')));
}

export interface BackfillDeps {
  /** Every album id (ids only — cheap); the walk sorts them. */
  listAlbumIds(): Promise<string[]>;
  readAlbum(albumId: string): Promise<IntelAlbum | null>;
  readAnalysis(trackId: string): Promise<Partial<AudioAnalysis> | null>;
  /** Decode up to `capSec` seconds. Null when the file can't be decoded. */
  decode(url: string, capSec: number): Promise<DecodedAudio | null>;
  writeAnalysis(trackId: string, analysis: AudioAnalysis): Promise<void>;
  /** Put the song map on the song's Music Intelligence read, when one exists. */
  attachSongMap?(albumId: string, trackId: string, songMap: SongMap): Promise<void>;
  now?(): number;
}

export interface BackfillResult {
  analyzed: number;
  skipped: number;
  failed: number;
  albums: number;
  /** Album id to resume after (exclusive); null once the walk reached the end. */
  next: string | null;
  done: boolean;
  errors: string[];
  durationMs: number;
}

/** Longest song the backfill reads whole (s). Longer ones are left as they are rather than saved truncated. */
export const BACKFILL_CAP_SEC = 20 * 60;

export async function runBackfill(deps: BackfillDeps, opts: { cursor?: string | null; budgetMs?: number; force?: boolean } = {}): Promise<BackfillResult> {
  const now = deps.now || Date.now;
  const started = now(), budget = opts.budgetMs ?? 4 * 60_000;
  const out: BackfillResult = { analyzed: 0, skipped: 0, failed: 0, albums: 0, next: opts.cursor ?? null, done: false, errors: [], durationMs: 0 };
  const ids = (await deps.listAlbumIds()).sort();
  const from = opts.cursor ? ids.findIndex(id => id > opts.cursor!) : 0;
  if (from < 0 || from >= ids.length) { out.done = true; out.next = null; out.durationMs = now() - started; return out; }

  for (let i = from; i < ids.length; i++) {
    // Never start an album without room to finish a song or two; the cursor stays on the last whole album.
    if (now() - started > budget * 0.75) { out.durationMs = now() - started; return out; }
    const albumId = ids[i];
    const album = await deps.readAlbum(albumId).catch(() => null);
    if (album) {
      let albumComplete = true;
      for (const t of audioTracks({ ...album, id: albumId })) {
        if (!opts.force && !needsBackfill(await deps.readAnalysis(t.id).catch(() => null))) { out.skipped++; continue; }
        if (now() - started > budget) { albumComplete = false; break; }
        try {
          const d = await deps.decode(t.url!, BACKFILL_CAP_SEC);
          if (!d) { out.failed++; out.errors.push(`${t.id}: could not decode`); continue; }
          if (d.pcm.length / d.channels / d.sampleRate >= BACKFILL_CAP_SEC - 1) { out.skipped++; continue; }
          const r = analyzeDecoded(d);
          await deps.writeAnalysis(t.id, { ...r.analysis, songMap: r.songMap });
          if (deps.attachSongMap) await deps.attachSongMap(albumId, t.id, r.songMap).catch(() => {});
          out.analyzed++;
        } catch (e: any) {
          out.failed++; out.errors.push(`${t.id}: ${e?.message || e}`);
        }
      }
      // Out of time mid-album: resume at this album (already-done songs skip with one read each).
      if (!albumComplete) { out.durationMs = now() - started; return out; }
    }
    out.albums++;
    out.next = albumId;
  }
  out.done = true; out.next = null; out.durationMs = now() - started;
  return out;
}
