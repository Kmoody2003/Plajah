// songFollower — Ambo knows what's being sung, so the operator doesn't have to.
//
// Listens through Plajah's live transcription (sharing any session that is
// already open — auto-scripture, live lyrics, playback transcription — via the
// transcriber's word tap) and:
//
//   · detects the song from its first line or two (n-gram match against every
//     song in the library), and switches to it — no playlist clicking
//   · follows it line by line or word by word (songFollowCore aligner)
//   · when the leader goes off script, holds on the last sung word and writes
//     what they say as an ADLIB line (drawn blue), then picks the song back up
//   · when a FILE is playing (audio playlist / DJ deck) with synced lyrics, it
//     simply follows that file's clock — exact timing, nothing to detect; a
//     file without lyrics is matched to a library song by title
//
// It publishes all of that as the 'follow' lyric clock, so the LYRICS layer,
// every lyric look and the output windows work unchanged.

import { registerLyricClock, getLyricClock, lyricsFor, type LyricTrackMeta, type LyricSourceId } from './lyricFeed';
import { lineSpan, timeWords, type LyricLine } from './lyricStyles';
import { createSongAligner, createSongDetector, type SongAligner, type SongDetector, type AlignEvent } from './songFollowCore';
import { listSongs, getSong, subscribeSongs, songsVersion, findSongByTitle, type Song } from './songLibrary';
import {
  startLiveTranscription, subscribeTranscript, activeTranscriptions, subscribeTranscriptionSessions,
  type TranscriberHandle, type TranscribeSource,
} from './liveTranscriber';

export type FollowListenSource = { kind: 'mic' } | { kind: 'device'; deviceId: string } | { kind: 'program' };

export interface SongFollowPrefs {
  mode: 'line' | 'word';
  autoDetect: boolean;
  adlibs: boolean;
  /** Unmatched words before an adlib line starts. */
  adlibAfter: number;
  /** Follow a playing file (audio playlist / DJ deck) when there is one. */
  followPlayback: boolean;
  /** Line mode: put the next line up as the last word of this one is sung. */
  preRoll: boolean;
  /** What to listen to when no other feature already has a session open. */
  source: FollowListenSource;
}

export interface FollowEntry { text: string; kind: 'song' | 'adlib'; songLine?: number }

export interface SongFollowState {
  listening: boolean;
  starting: boolean;
  status: string;
  error: string;
  /** Who is supplying the words ("Song follow", "Auto scripture", …). */
  sharedWith: string[];
  songId: string | null;
  title: string;
  artist: string;
  entries: FollowEntry[];
  /** Entry on screen (-1 = title card / nothing sung yet). */
  entry: number;
  /** Word lit in that entry (word mode), -1 = none. */
  word: number;
  offScript: boolean;
  heard: string;
  playback: { source: 'bus' | 'dj'; title: string; synced: boolean } | null;
  detections: Array<{ songId: string; title: string; via: 'audio' | 'file' | 'title'; at: number; score?: number }>;
}

const KEY = 'ambo_song_follow_v1';
const DEFAULTS: SongFollowPrefs = {
  mode: 'line', autoDetect: true, adlibs: true, adlibAfter: 3, followPlayback: true, preRoll: true, source: { kind: 'mic' },
};
function readPrefs(): SongFollowPrefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

let prefs: SongFollowPrefs = typeof localStorage !== 'undefined' ? readPrefs() : { ...DEFAULTS };
let state: SongFollowState = {
  listening: false, starting: false, status: 'Off', error: '', sharedWith: [],
  songId: null, title: '', artist: '', entries: [], entry: -1, word: -1, offScript: false, heard: '',
  playback: null, detections: [],
};
const subs = new Set<() => void>();
const emit = () => subs.forEach(fn => { try { fn(); } catch { /* */ } });
const set = (p: Partial<SongFollowState>) => { state = { ...state, ...p }; emit(); };

export const getSongFollowPrefs = () => prefs;
export const getSongFollowState = () => state;
export const subscribeSongFollow = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export function setSongFollowPrefs(p: Partial<SongFollowPrefs>) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* */ }
  if (p.adlibAfter !== undefined && state.songId) rebuildAligner();
  emit();
}

// ── song + aligner ──────────────────────────────────────────────────────────

let song: Song | null = null;
let aligner: SongAligner | null = null;
let forcedLine: number | null = null;
let structVersion = 0;
let lastAdvanceAt = 0;
let lastSwitchAt = 0;

function rebuildAligner() {
  aligner = song ? createSongAligner(song.lines, { adlibAfter: prefs.adlibAfter }) : null;
}

function songEntries(s: Song): FollowEntry[] {
  return s.lines.map((text, i) => ({ text, kind: 'song' as const, songLine: i }));
}

const entryOfLine = (line: number) => state.entries.findIndex(e => e.kind === 'song' && e.songLine === line);

/** Select a song (operator or detection). `line` puts that line up now. */
export function selectSong(id: string | null, line?: number, via?: 'audio' | 'file' | 'title', score?: number): void {
  song = getSong(id);
  rebuildAligner();
  forcedLine = null;
  structVersion++;
  if (!song) { set({ songId: null, title: '', artist: '', entries: [], entry: -1, word: -1, offScript: false }); return; }
  const entries = songEntries(song);
  const detections = via ? [{ songId: song.id, title: song.title, via, at: Date.now(), score }, ...state.detections].slice(0, 8) : state.detections;
  state = { ...state, songId: song.id, title: song.title, artist: song.artist || '', entries, entry: -1, word: -1, offScript: false, detections };
  if (line !== undefined && line >= 0) jumpToLine(line); else emit();
}

/** Operator click on a line: put it up now; the follower carries on from there. */
export function jumpToLine(line: number): void {
  if (!song || !aligner) return;
  aligner.jump(line, 0);
  forcedLine = line;
  set({ entry: entryOfLine(line), word: -1, offScript: false });
}

/** Step to the next / previous song line (keyboard, clicker). */
export function stepLine(dir: 1 | -1): void {
  if (!song) return;
  const cur = forcedLine ?? (state.entry >= 0 ? state.entries[state.entry]?.songLine ?? -1 : -1);
  const next = Math.max(0, Math.min(song.lines.length - 1, (cur ?? -1) + dir));
  jumpToLine(next);
}

export function clearAdlibs(): void {
  if (!song) return;
  const curLine = state.entries[state.entry]?.songLine;
  const entries = state.entries.filter(e => e.kind === 'song');
  structVersion++;
  set({ entries, entry: curLine !== undefined ? entries.findIndex(e => e.songLine === curLine) : -1, offScript: false });
}

function applyEvents(evs: AlignEvent[]) {
  if (!song || !evs.length) return;
  let { entries, entry, word, offScript } = state;
  let structural = false;
  for (const ev of evs) {
    if (ev.type === 'advance' || ev.type === 'resume') {
      forcedLine = null;
      offScript = false;
      lastAdvanceAt = Date.now();
      let e = entries.findIndex(x => x.kind === 'song' && x.songLine === ev.line);
      const words = (song.lines[ev.line] || '').split(/\s+/).filter(Boolean).length;
      // Line mode pre-roll: the last word of a line is being sung → the next line goes up.
      if (prefs.mode === 'line' && prefs.preRoll && ev.word >= words - 1 && ev.line + 1 < song.lines.length) {
        const n = entries.findIndex(x => x.kind === 'song' && x.songLine === ev.line + 1);
        if (n >= 0) { e = n; word = -1; entry = e; continue; }
      }
      entry = e; word = ev.word;
    } else if (!prefs.adlibs) {
      // adlibs off: just hold on the last sung word
      offScript = true;
    } else if (ev.type === 'adlib-start' || ev.type === 'adlib-roll') {
      // a new adlib line right after what is on screen
      const at = Math.max(0, entry + 1);
      entries = [...entries.slice(0, at), { text: ev.text, kind: 'adlib' as const }, ...entries.slice(at)];
      // keep the list from growing without bound over a long service
      const adlibIdx = entries.map((x, i) => (x.kind === 'adlib' ? i : -1)).filter(i => i >= 0);
      if (adlibIdx.length > 16) {
        const drop = adlibIdx[0];
        entries = entries.filter((_, i) => i !== drop);
        if (drop < at) entry = at - 1; else entry = at;
      } else entry = at;
      word = -1; offScript = true; structural = true;
    } else if (ev.type === 'adlib-grow') {
      if (entries[entry]?.kind === 'adlib') {
        entries = entries.map((x, i) => (i === entry ? { ...x, text: ev.text } : x));
        structural = true;
      }
      offScript = true;
    }
  }
  if (structural) structVersion++;
  set({ entries, entry, word, offScript });
}

// ── detection ───────────────────────────────────────────────────────────────

let detector: SongDetector | null = null;
let detectorVersion = -1;
function ensureDetector(): SongDetector {
  if (!detector || detectorVersion !== songsVersion()) {
    detector = createSongDetector(listSongs().map(s => ({ id: s.id, lines: s.lines })));
    detectorVersion = songsVersion();
  }
  return detector;
}

function maybeDetect() {
  if (!prefs.autoDetect || state.playback?.synced) return;
  const hit = ensureDetector().detect();
  if (!hit || hit.songId === state.songId) return;
  const now = Date.now();
  if (now - lastSwitchAt < 8000) return;
  // Don't yank a song that is tracking fine unless the evidence is strong.
  const tracking = state.songId && !state.offScript && now - lastAdvanceAt < 6000;
  if (tracking && hit.score < 3) return;
  lastSwitchAt = now;
  selectSong(hit.songId, undefined, 'audio', hit.score);
  aligner?.seek(hit.token);
  const p = aligner?.position();
  if (p && p.line >= 0) set({ entry: entryOfLine(p.line), word: p.word });
}

// ── listening ───────────────────────────────────────────────────────────────

let own: TranscriberHandle | null = null;
let unTap: (() => void) | null = null;
let unSessions: (() => void) | null = null;
let heardWords: string[] = [];
let session = 0;

function onHeard(text: string, final = false) {
  heardWords = heardWords.concat(text.split(/\s+/).filter(Boolean)).slice(-14);
  if (capture.on) {
    captureWords(text, final);
    set({ heard: heardWords.join(' ') });
    return;   // a new song nobody has words for: write it down, don't chase it
  }
  if (prefs.autoDetect) ensureDetector().feed(text);
  if (aligner && !state.playback?.synced) applyEvents(aligner.feed(text));
  maybeDetect();
  set({ heard: heardWords.join(' ') });
}

// ── capture: transcribe a song the library doesn't have, then save it ───────
//
// The operator turns Transcribe on, marks IN when the new song starts and OUT
// when it ends; the lines in between become a new song (editable before save),
// so the next time it is sung Ambo detects and follows it like any other.

export interface CaptureLine { text: string; at: number }
export interface CaptureState {
  on: boolean;
  lines: CaptureLine[];
  /** The phrase still being heard (not yet a line). */
  partial: string;
  /** Inclusive line indexes; null = not set. */
  inIdx: number | null;
  outIdx: number | null;
}

const CAPTURE_MAX_LINES = 400;
const LINE_WORDS = 9;
const LINE_GAP_MS = 1600;
let capture: CaptureState = { on: false, lines: [], partial: '', inIdx: null, outIdx: null };
let lastWordAt = 0;
const setCapture = (p: Partial<CaptureState>) => { capture = { ...capture, ...p }; emit(); };

export const getCaptureState = () => capture;

function pushPartial(): void {
  const text = capture.partial.trim();
  if (!text) return;
  let lines = [...capture.lines, { text: text[0].toUpperCase() + text.slice(1), at: Date.now() }];
  let { inIdx, outIdx } = capture;
  if (lines.length > CAPTURE_MAX_LINES) {
    const drop = lines.length - CAPTURE_MAX_LINES;
    lines = lines.slice(drop);
    inIdx = inIdx === null ? null : Math.max(0, inIdx - drop);
    outIdx = outIdx === null ? null : Math.max(0, outIdx - drop);
  }
  capture = { ...capture, lines, partial: '', inIdx, outIdx };
}

function captureWords(text: string, final: boolean): void {
  const now = Date.now();
  if (capture.partial && now - lastWordAt > LINE_GAP_MS) pushPartial();   // a breath = a new line
  lastWordAt = now;
  let partial = `${capture.partial} ${text}`.replace(/\s+/g, ' ').trim();
  capture = { ...capture, partial };
  // long phrase → break at the line length, carrying the rest
  let words = partial.split(' ');
  while (words.length > LINE_WORDS) {
    capture = { ...capture, partial: words.slice(0, LINE_WORDS).join(' ') };
    pushPartial();
    words = words.slice(LINE_WORDS);
    partial = words.join(' ');
    capture = { ...capture, partial };
  }
  if (final) pushPartial();
  emit();
}

/** Start transcribing everything heard (opens listening if needed). */
export async function startCapture(): Promise<void> {
  if (!capture.on) setCapture({ on: true });
  if (!state.listening) await startSongFollow();
}
export function stopCapture(): void { pushPartial(); setCapture({ on: false }); }

/** IN: the song starts at the phrase being heard now (or the one that just ended). */
export function markCaptureIn(at?: number): void {
  if (at !== undefined) { setCapture({ inIdx: at, outIdx: capture.outIdx !== null && capture.outIdx < at ? null : capture.outIdx }); return; }
  const justEnded = !capture.partial && capture.lines.length && Date.now() - capture.lines[capture.lines.length - 1].at < 2500;
  setCapture({ inIdx: justEnded ? capture.lines.length - 1 : capture.lines.length, outIdx: null });
}

/** OUT: the song ends with the phrase just sung. */
export function markCaptureOut(at?: number): void {
  if (at === undefined) pushPartial();
  const idx = at ?? capture.lines.length - 1;
  if (idx < 0) return;
  setCapture({ outIdx: idx, inIdx: capture.inIdx !== null && capture.inIdx > idx ? idx : capture.inIdx });
}

export function clearCapture(): void { setCapture({ lines: [], partial: '', inIdx: null, outIdx: null }); }
export function clearCaptureMarks(): void { setCapture({ inIdx: null, outIdx: null }); }

/** The lines between IN and OUT (OUT defaults to everything heard so far). */
export function capturedLines(): string[] {
  if (capture.inIdx === null) return [];
  const all = capture.partial ? [...capture.lines, { text: capture.partial, at: Date.now() }] : capture.lines;
  const end = capture.outIdx ?? all.length - 1;
  return all.slice(capture.inIdx, end + 1).map(l => l.text);
}

async function resolveSource(): Promise<TranscribeSource> {
  const s = prefs.source;
  if (s.kind === 'device') return { kind: 'device', deviceId: s.deviceId };
  if (s.kind === 'program') {
    const { amboAudio } = await import('./amboAudioEngine');
    const stream = amboAudio.programStream();
    if (!stream) throw new Error('The Ambo program mix is not available yet');
    return { kind: 'stream', stream };
  }
  return { kind: 'mic' };
}

async function ensureOwnSession() {
  if (own || !state.listening) return;
  const others = activeTranscriptions().filter(l => l !== 'Song follow');
  if (others.length) { set({ sharedWith: others, status: `Listening via ${others.join(', ')}` }); return; }
  const my = session;
  try {
    set({ status: 'Starting…' });
    const h = await startLiveTranscription(await resolveSource(), {
      onWords: () => { /* words arrive through the tap */ },
      onStatus: s => set({ status: s }),
      onError: m => set({ error: m }),
    }, 'en-US', 'Song follow');
    if (my !== session || !state.listening) { h.stop(); return; }
    own = h;
    set({ status: 'Listening', sharedWith: [] });
  } catch (e) {
    set({ error: String((e as Error)?.message || 'Could not start listening'), status: 'Off' });
  }
}

export async function startSongFollow(): Promise<void> {
  if (state.listening || state.starting) return;
  session++;
  set({ listening: true, starting: true, error: '' });
  unTap = subscribeTranscript((t, final) => onHeard(t, final));
  // When another feature stops its session, take over the mic; when one starts, share it.
  unSessions = subscribeTranscriptionSessions(() => {
    const others = activeTranscriptions().filter(l => l !== 'Song follow');
    set({ sharedWith: others });
    if (!others.length && !own) void ensureOwnSession();
  });
  await ensureOwnSession();
  set({ starting: false });
}

export function stopSongFollow(): void {
  session++;
  try { own?.stop(); } catch { /* */ }
  own = null;
  unTap?.(); unTap = null;
  unSessions?.(); unSessions = null;
  heardWords = [];
  detector?.reset();
  set({ listening: false, starting: false, status: 'Off', sharedWith: [], heard: '' });
}

/** Restart on a new listen source. */
export function setSongFollowSource(source: FollowListenSource) {
  const was = state.listening;
  setSongFollowPrefs({ source });
  if (was) { stopSongFollow(); void startSongFollow(); }
}

// ── playback follow (a file is playing) ─────────────────────────────────────

let playbackClock: { id: LyricSourceId; track: LyricTrackMeta } | null = null;

function pollPlayback() {
  if (!prefs.followPlayback) { if (state.playback) { playbackClock = null; set({ playback: null }); } return; }
  for (const id of ['dj', 'bus'] as const) {
    const c = getLyricClock(id);
    const t = c?.track();
    if (!c || !t || !c.isPlaying()) continue;
    const synced = lyricsFor(t).length > 0;
    const key = `${id}:${t.id ?? t.title}`;
    const was = state.playback ? `${state.playback.source}:${playbackClock?.track.id ?? playbackClock?.track.title}` : '';
    playbackClock = { id, track: t };
    if (key !== was) {
      if (synced) {
        structVersion++;
        set({
          playback: { source: id, title: t.title, synced: true }, title: t.title, artist: t.artist || '',
          detections: [{ songId: t.id ?? t.title, title: t.title, via: 'file' as const, at: Date.now() }, ...state.detections].slice(0, 8),
        });
      } else {
        // No lyric file: find the song by title and follow it by ear.
        const s = findSongByTitle(t.title);
        set({ playback: { source: id, title: t.title, synced: false } });
        if (s && s.id !== state.songId) selectSong(s.id, undefined, 'title');
      }
    }
    return;
  }
  if (state.playback) { playbackClock = null; set({ playback: null }); }
}

// ── the 'follow' lyric clock ────────────────────────────────────────────────

const SLOT = 8;

function virtualLines(): LyricLine[] {
  return state.entries.map((e, i) => (e.kind === 'adlib' ? { time: i * SLOT, text: e.text, adlib: true } : { time: i * SLOT, text: e.text }));
}

/** Virtual song position for the entry/word on screen. */
export function followPosition(lines: LyricLine[] = virtualLines()): number {
  const e = state.entry;
  if (e < 0 || !lines[e]) return -1;
  const span = lineSpan(lines, e);
  const base = lines[e].time;
  const fullyLit = base + span * 0.86;
  // Adlibs and line mode: the whole line, lit.
  if (lines[e].adlib || prefs.mode === 'line') return fullyLit;
  // Word mode, line put up ahead of the singing (operator jump / new song): unlit.
  if (state.word < 0) return base + 0.001;
  const words = timeWords(lines[e], span, 0);
  const w = words[Math.min(state.word, words.length - 1)];
  if (!w) return fullyLit;
  return Math.min(fullyLit, base + w.start + Math.min(0.18, (w.end - w.start) * 0.6) + 0.01);
}

function followTrack(): LyricTrackMeta | null {
  if (state.playback?.synced && playbackClock) {
    const c = getLyricClock(playbackClock.id);
    return c?.track() ?? null;
  }
  if (!song || !state.entries.length) return null;
  return { id: `follow-${song.id}-${structVersion}`, title: song.title, artist: song.artist, timeCodedLyrics: virtualLines() };
}

let installed = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Studio window: register the clock and start watching playback. Idempotent. */
export function installSongFollower(): () => void {
  if (installed) return () => {};
  installed = true;
  registerLyricClock('follow', {
    getTime: () => {
      if (state.playback?.synced && playbackClock) return getLyricClock(playbackClock.id)?.getTime() ?? 0;
      return followPosition();
    },
    isPlaying: () => (state.playback?.synced && playbackClock ? !!getLyricClock(playbackClock.id)?.isPlaying() : false),
    rate: () => (state.playback?.synced && playbackClock ? getLyricClock(playbackClock.id)?.rate() ?? 1 : 1),
    track: followTrack,
    grid: () => (state.playback?.synced && playbackClock ? getLyricClock(playbackClock.id)?.grid?.() ?? null : null),
  });
  pollTimer = setInterval(pollPlayback, 400);
  const unSongs = subscribeSongs(() => { if (song) { const fresh = getSong(song.id); if (fresh && fresh !== song) selectSong(fresh.id); } });
  return () => {
    installed = false;
    if (pollTimer) clearInterval(pollTimer);
    unSongs();
    registerLyricClock('follow', null);
  };
}

/** The line being sung right now, for typographic visualizers. */
export function followerCurrentLine(): { text: string; adlib: boolean; title: string } | null {
  if (state.playback?.synced && playbackClock) {
    const c = getLyricClock(playbackClock.id);
    const t = c?.track();
    const lines = lyricsFor(t);
    if (!c || !lines.length) return null;
    const pos = c.getTime();
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].time <= pos) idx = i; else break; }
    return idx >= 0 ? { text: lines[idx].text, adlib: false, title: t?.title || '' } : null;
  }
  const e = state.entries[state.entry];
  return e ? { text: e.text, adlib: e.kind === 'adlib', title: state.title } : null;
}
