// typoText — the words Ambo's typographic visualizers spell.
//
// A TYPO visualizer can take its words from:
//   scripture   the verse on Program (or the last one sent)
//   lyrics      the song being sung — the song follower's line, the playing
//               file's synced lyric, or (with no lyric file) a live
//               transcription of whatever is playing
//   transcript  whatever the transcriber hears right now
//   custom      operator text (per visualizer, or the shared default)
//   data        a JSON / text feed polled from a URL
//   auto        the best of the above at this moment (see resolveTypoText)
//
// The studio window owns the sources (typoTextDriver); every window that
// imports this module mirrors the latest state over a BroadcastChannel, so an
// output window's GeneratorSource can resolve the words locally.

export type TypoTextSource = 'auto' | 'scripture' | 'lyrics' | 'transcript' | 'custom' | 'data';

export const TYPO_TEXT_SOURCES: Array<{ id: TypoTextSource; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'Song lyrics while a song is going, else scripture sent from the Scripture tab, else what the room hears, else your text' },
  { id: 'scripture', label: 'Scripture', hint: 'The verse on Program' },
  { id: 'lyrics', label: 'Song / audio playing', hint: 'The followed song, the playing file’s lyrics, or a live transcription of what is playing' },
  { id: 'transcript', label: 'Live transcription', hint: 'Whatever the transcriber hears right now' },
  { id: 'custom', label: 'Custom text', hint: 'Text you type' },
  { id: 'data', label: 'Data source', hint: 'A JSON or text feed polled from a URL' },
];

export interface TypoChannel { text: string; at: number; label?: string; adlib?: boolean }

export interface TypoTextPrefs {
  /** Scripture tab checkbox: verses drive Auto visualizers. */
  sendScripture: boolean;
  /** Lyrics tab checkbox: the followed song drives Auto visualizers. */
  sendLyrics: boolean;
  /** Shared custom text (a visualizer can override it). */
  customText: string;
  dataUrl: string;
  /** Dot path into the JSON ("items.0.title", "verses[].text"); empty = whole body as text. */
  dataPath: string;
  dataIntervalSec: number;
  /** When a song with no lyric file plays, transcribe the program mix for the words. */
  autoTranscribePlayback: boolean;
  /** Audio source for live transcription feeding typographic visualizers. */
  transcribeAudioSource?: 'auto' | 'program' | 'playlist' | 'dj' | 'mic' | 'system';
}

export interface TypoTextState {
  scripture: TypoChannel;
  lyrics: TypoChannel;
  transcript: TypoChannel;
  data: TypoChannel & { error?: string };
  prefs: TypoTextPrefs;
}

const KEY = 'ambo_typo_text_v1';
const CH = 'ambo-typo-text-v1';
const DEFAULT_PREFS: TypoTextPrefs = {
  sendScripture: false, sendLyrics: true, customText: '', dataUrl: '', dataPath: '', dataIntervalSec: 30, autoTranscribePlayback: false,
  transcribeAudioSource: 'auto',
};
const empty = (): TypoChannel => ({ text: '', at: 0 });

function readPrefs(): TypoTextPrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
}

let state: TypoTextState = {
  scripture: empty(), lyrics: empty(), transcript: empty(), data: empty(),
  prefs: typeof localStorage !== 'undefined' ? readPrefs() : { ...DEFAULT_PREFS },
};
const subs = new Set<() => void>();
const notify = () => subs.forEach(fn => { try { fn(); } catch { /* */ } });

let bc: BroadcastChannel | null = null;
/** True in the studio window (typoTextDriver claims it) — only it answers late windows. */
let owner = false;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(CH);
    (bc as unknown as { unref?: () => void }).unref?.();
    bc.onmessage = e => {
      const d = e.data;
      if (d && d.t === 'state' && d.state) { state = d.state; notify(); }
      else if (d && d.t === 'hello' && owner) { try { bc?.postMessage({ t: 'state', state }); } catch { /* */ } }
    };
    // A late-opening output window asks for the current words.
    bc.postMessage({ t: 'hello' });
  }
} catch { /* */ }

export function claimTypoTextOwner(): void { owner = true; }

const publish = () => { try { bc?.postMessage({ t: 'state', state }); } catch { /* */ } notify(); };

export const getTypoTextState = () => state;
export const subscribeTypoText = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

export function setTypoTextPrefs(p: Partial<TypoTextPrefs>): void {
  state = { ...state, prefs: { ...state.prefs, ...p } };
  try { localStorage.setItem(KEY, JSON.stringify(state.prefs)); } catch { /* */ }
  publish();
}

type ChannelId = 'scripture' | 'lyrics' | 'transcript' | 'data';
/** Studio side: new words on a channel. Unchanged text is not re-broadcast. */
export function publishTypoChannel(ch: ChannelId, next: Partial<TypoChannel> & { text: string; error?: string }): void {
  const cur = state[ch];
  if (cur.text === next.text && cur.label === next.label && cur.adlib === next.adlib && (cur as any).error === next.error) {
    // keep "freshness" without a broadcast storm: refresh the stamp at most every 5 s
    if (Date.now() - cur.at < 5000) return;
  }
  state = { ...state, [ch]: { ...next, at: next.at ?? Date.now() } };
  publish();
}

const LYRIC_FRESH_MS = 30_000;
const HEARD_FRESH_MS = 20_000;

/** The words a visualizer with this source should spell right now ('' = nothing yet). */
export function resolveTypoText(source: TypoTextSource = 'auto', customOverride?: string, s: TypoTextState = state, now = Date.now()): string {
  const fresh = (c: TypoChannel, ms: number) => !!c.text && now - c.at <= ms;
  const custom = (customOverride ?? '').trim() || s.prefs.customText.trim();
  switch (source) {
    case 'scripture': return s.scripture.text;
    case 'lyrics':
      if (fresh(s.lyrics, LYRIC_FRESH_MS)) return s.lyrics.text;
      if (fresh(s.transcript, HEARD_FRESH_MS)) return s.transcript.text;   // auto-pulled lyrics of what's playing
      return s.lyrics.text;
    case 'transcript': return s.transcript.text;
    case 'custom': return custom;
    case 'data': return s.data.text;
    case 'auto':
    default:
      if (s.prefs.sendLyrics && fresh(s.lyrics, LYRIC_FRESH_MS)) return s.lyrics.text;
      if (s.prefs.sendScripture && s.scripture.text) return s.scripture.text;
      if (fresh(s.transcript, HEARD_FRESH_MS)) return s.transcript.text;
      if (custom) return custom;
      return s.scripture.text || s.lyrics.text;
  }
}

// ── data feeds (pure helpers; the driver polls) ─────────────────────────────

/** Walk "a.b.0.c" / "items[].title" into parsed JSON; arrays of strings are joined. */
export function pickDataPath(json: unknown, path: string): string {
  const flat = (v: unknown): string =>
    v == null ? '' : Array.isArray(v) ? v.map(flat).filter(Boolean).join(' · ') : typeof v === 'object' ? Object.values(v as object).map(flat).filter(Boolean).join(' · ') : String(v);
  if (!path.trim()) return flat(json);
  const walk = (v: unknown, parts: string[]): unknown => {
    if (!parts.length) return v;
    const [head, ...rest] = parts;
    if (head.endsWith('[]')) {
      const k = head.slice(0, -2);
      const arr = k ? (v as any)?.[k] : v;
      return Array.isArray(arr) ? arr.map(x => walk(x, rest)) : undefined;
    }
    return walk((v as any)?.[head], rest);
  };
  return flat(walk(json, path.split('.').filter(Boolean)));
}

export function dataBodyToText(body: string, path: string): string {
  const t = body.trim();
  if (/^[[{]/.test(t)) { try { return pickDataPath(JSON.parse(t), path).slice(0, 600); } catch { /* not JSON after all */ } }
  return t.replace(/\s+/g, ' ').slice(0, 600);
}
