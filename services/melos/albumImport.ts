// Album → Melos: reopening a finished record.
//
// A Chora release is the END of a Melos production, but creators keep working: a remaster, a
// deluxe edition, a re-sequence, lyrics that were transcribed after release. This turns any
// album back into a working production so none of that starts from a blank page.
//
// What flows where:
//   album title/artist/genre/year/label/©/description/cover → the Project's PublishingInfo
//   album.tracks[]                                          → Project tracks (audio ingested
//                                                              to OPFS) AND MelosSong rows
//   track.lyrics / timeCodedLyrics                          → the song's writing-pad blocks
//                                                              AND the Project track's lyrics
//   running order                                           → a primary MelosArrangement
//
// Nothing is destroyed: importing twice updates the same production (deterministic id derived
// from the album), and a song that already exists is matched by its source track id.

import type { Album, Track } from '../../types';
import { cleanDescription } from '../../utils/description';
import {
  createProduction, fetchProduction, putSong, putArrangement, newSong, uid,
  type MelosSong, type MelosArrangement, type LyricBlock, type BlockKind,
} from '../melosService';
import { ingestSample, backupToLocker } from './beats/sampleStore';
import {
  decodeCtx, loadMasterProject, saveMasterProject, newMasterProject, projectUid,
  type MasterProjectDoc, type ProjectTrack,
} from './beats/masterProject';

/** One production per album, derived so a re-import updates rather than duplicates. */
export const productionIdForAlbum = (albumId: string) => `album_${albumId}`.slice(0, 90);

// ── Lyrics: text → the writing pad's typed blocks ───────────────────────────

const KIND_WORDS: [RegExp, BlockKind][] = [
  [/^intro\b/i, 'INTRO'], [/^verse\b/i, 'VERSE'], [/^pre[- ]?chorus\b/i, 'PRE'],
  [/^chorus\b/i, 'CHORUS'], [/^hook\b/i, 'HOOK'], [/^bridge\b/i, 'BRIDGE'],
  [/^refrain\b/i, 'REFRAIN'], [/^outro\b/i, 'OUTRO'], [/^ad[- ]?lib/i, 'AD_LIB'],
];

/**
 * Parse a lyrics blob into writing-pad blocks. Honours the bracketed section headers that
 * transcripts and AI generators emit ("[Verse 1]", "(Chorus)"); otherwise splits on blank
 * lines and calls the alternating sections Verse/Chorus, which is a sane starting guess a
 * writer can re-label in one click. Never returns an empty pad for non-empty lyrics.
 */
export function parseLyricsToBlocks(text: string): LyricBlock[] {
  const raw = (text || '').replace(/\r/g, '');
  if (!raw.trim()) return [];
  const blocks: LyricBlock[] = [];
  let current: { kind: BlockKind; label?: string; lines: string[] } | null = null;
  const push = () => {
    if (current && current.lines.length) {
      blocks.push({ id: uid('blk'), kind: current.kind, label: current.label, lines: current.lines });
    }
    current = null;
  };

  const headerOf = (line: string): { kind: BlockKind; label: string } | null => {
    const m = line.match(/^\s*[[(]\s*([^\])]+?)\s*[\])]\s*$/);
    const inner = m ? m[1] : null;
    if (!inner) return null;
    for (const [re, kind] of KIND_WORDS) if (re.test(inner)) return { kind, label: inner };
    return { kind: 'NOTE', label: inner };
  };

  const lines = raw.split('\n');
  let sawHeader = false;
  for (const line of lines) {
    const h = headerOf(line);
    if (h) { sawHeader = true; push(); current = { kind: h.kind, label: h.label, lines: [] }; continue; }
    if (!line.trim()) { if (sawHeader) continue; push(); continue; }  // blank = block break when unheaded
    if (!current) current = { kind: 'VERSE', lines: [] };
    current.lines.push(line.trim());
  }
  push();

  if (!sawHeader) {
    // No headers: alternate Verse/Chorus as a first guess, which reads better than ten Verses.
    blocks.forEach((b, i) => { b.kind = i % 2 === 1 ? 'CHORUS' : 'VERSE'; });
  }
  return blocks.length ? blocks : [{ id: uid('blk'), kind: 'VERSE', lines: raw.split('\n').map((l) => l.trim()).filter(Boolean) }];
}

/** The lyric text a track carries — typed lyrics, else the transcribed caption lines. */
export function trackLyricText(t: Track): string {
  if (t.lyrics && t.lyrics.trim()) return t.lyrics;
  const timed = t.timeCodedLyrics || [];
  return timed.map((l) => (l.text || '').trim()).filter(Boolean).join('\n');
}

// ── The import ───────────────────────────────────────────────────────────────

export interface AlbumImportResult {
  productionId: string;
  songsCreated: number;
  tracksImported: number;
  audioMissing: string[];   // titles whose audio couldn't be fetched (lyrics still imported)
  lyricsImported: number;
}

export interface AlbumImportOptions {
  /** Pull the audio into OPFS so the Project view can master it. Off = metadata + lyrics only. */
  withAudio?: boolean;
  /**
   * Where to land it. Defaults to the album's own production (one production per release);
   * pass the open production to back-port the record into the room you're already working in.
   */
  productionId?: string;
  onProgress?: (message: string, done: number, total: number) => void;
}

/**
 * Back-port a released album into a working Melos production + Project.
 * Safe to run twice: the production id is derived from the album, songs are matched by the
 * album track id they came from, and existing lyrics are never overwritten with emptier ones.
 */
export async function importAlbumToMelos(
  album: Album,
  ownerUid: string,
  opts: AlbumImportOptions = {},
): Promise<AlbumImportResult> {
  const withAudio = opts.withAudio !== false;
  const prodId = opts.productionId || productionIdForAlbum(album.id);
  const tracks: Track[] = Array.isArray(album.tracks) ? album.tracks : [];
  const total = tracks.length;
  const report = (m: string, i: number) => opts.onProgress?.(m, i, total);

  // 1. The production — created once, updated on re-import.
  const existing = await fetchProduction(prodId);
  if (!existing) {
    await createProduction(ownerUid, {
      id: prodId,
      title: album.title || 'Untitled Album',
      workingTitle: album.title || undefined,
      status: 'RELEASED' as never,        // it IS released; the shell tolerates unknown statuses
      coverImage: album.coverImage || undefined,
      notes: `Imported from the Chora release "${album.title}".`,
    } as never);
  }

  // 2. The Project doc — publishing info inherited from the release.
  const project: MasterProjectDoc = (await loadMasterProject(prodId)) ?? newMasterProject(ownerUid);
  project.publishing = {
    title: album.title || project.publishing.title,
    artist: album.artist || project.publishing.artist,
    genre: album.genre || project.publishing.genre,
    year: String((album as { releaseYear?: string | number }).releaseYear ?? project.publishing.year ?? ''),
    label: (album as { recordLabel?: string }).recordLabel || project.publishing.label,
    copyright: (album as { copyrightLine?: string }).copyrightLine || project.publishing.copyright,
    description: cleanDescription(album.description) || project.publishing.description,
  };
  if (album.coverImage) project.coverImage = album.coverImage;

  // 3. Songs + Project tracks, in the album's running order.
  const songIds: string[] = [];
  let songsCreated = 0, tracksImported = 0, lyricsImported = 0;
  const audioMissing: string[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    report(`Importing ${t.title || `track ${i + 1}`}…`, i);
    const lyricText = trackLyricText(t);

    // ── the writing pad ──
    const songId = `song_${t.id}`.slice(0, 90);
    songIds.push(songId);
    const song: MelosSong = newSong(i, {
      id: songId,
      title: t.title || `Track ${i + 1}`,
      // A released song is finished and definitely on the record.
      state: 'FINISHED',
      commitment: 'VERIFIED',
      confidence: 100,
      lyrics: lyricText ? parseLyricsToBlocks(lyricText) : [],
      durationSec: t.duration || undefined,
      trackRef: t.url ? { trackId: t.id, url: t.url, title: t.title, source: 'ALBUM', durationSec: t.duration || undefined } : undefined,
      images: t.albumCover ? [t.albumCover] : [],
    });
    try { await putSong(prodId, song); songsCreated++; if (lyricText) lyricsImported++; } catch { /* keep going */ }

    // ── the Project's proof sheet ──
    const already = project.tracks.find((x) => x.sourceSongId === songId);
    if (already) {
      // Re-import refreshes lyrics/captions without disturbing mastering work already done.
      if (lyricText && !already.lyrics) already.lyrics = lyricText;
      if (t.timeCodedLyrics?.length && !already.timeCodedLyrics?.length) already.timeCodedLyrics = t.timeCodedLyrics;
      continue;
    }
    let projectTrack: ProjectTrack | null = null;
    if (withAudio && t.url && /^https?:/i.test(t.url)) {
      try {
        const res = await fetch(t.url);
        if (res.ok) {
          const blob = await res.blob();
          const ingested = await ingestSample(blob, `${t.title || 'Track'}.wav`, decodeCtx());
          if (ingested) {
            void backupToLocker(ingested.ref);
            projectTrack = {
              id: projectUid(),
              title: t.title || `Track ${i + 1}`,
              sample: ingested.ref,
              gainDb: 0,
              mastering: null,
              sourceSongId: songId,
            };
          }
        }
      } catch { /* fall through to the no-audio path */ }
    }
    if (!projectTrack) { if (t.url) audioMissing.push(t.title || `Track ${i + 1}`); continue; }
    projectTrack.lyrics = lyricText || undefined;
    if (t.timeCodedLyrics?.length) projectTrack.timeCodedLyrics = t.timeCodedLyrics;
    if (t.images?.length) projectTrack.images = t.images;
    if (t.videoUrl) projectTrack.videoUrl = t.videoUrl;
    project.tracks.push(projectTrack);
    tracksImported++;
  }

  // 4. The running order as the primary arrangement.
  if (songIds.length) {
    const arrangement: MelosArrangement = {
      id: `arr_${prodId}`.slice(0, 90),
      name: album.title ? `${album.title} (release order)` : 'Release order',
      songIds,
      isPrimary: true,
      notes: 'The order this record was released in.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try { await putArrangement(prodId, arrangement); project.arrangementId = arrangement.id; } catch { /* */ }
  }

  await saveMasterProject(prodId, project);
  report('Done', total);
  return { productionId: prodId, songsCreated, tracksImported, audioMissing, lyricsImported };
}
