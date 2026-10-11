// lyricsProgram — what the LYRICS layer on Program follows, and whether it is up.
//
// Shared by the audio bar's Lyrics control (which stays mounted and runs the
// clock-anchor sync loop) and the Lyrics tab in the library, so either one can
// take lyrics to Program and both always agree on what is live.

import type { LyricSourceId } from './lyricFeed';
import { DEFAULT_LYRIC_STYLE } from './lyricStyles';

export interface LyricsProgramState { source: LyricSourceId; styleId: string; wantLive: boolean }

const KEY = 'ambo_lyrics_prefs_v1';
function read(): LyricsProgramState {
  const base: LyricsProgramState = { source: 'bus', styleId: DEFAULT_LYRIC_STYLE, wantLive: false };
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...base, source: p.source ?? base.source, styleId: p.styleId ?? base.styleId };
  } catch { return base; }
}

let state: LyricsProgramState = typeof localStorage !== 'undefined' ? read() : { source: 'bus', styleId: DEFAULT_LYRIC_STYLE, wantLive: false };
const subs = new Set<() => void>();

export const getLyricsProgram = () => state;
export const subscribeLyricsProgram = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export function setLyricsProgram(p: Partial<LyricsProgramState>): void {
  state = { ...state, ...p };
  try { localStorage.setItem(KEY, JSON.stringify({ source: state.source, styleId: state.styleId })); } catch { /* */ }
  subs.forEach(fn => { try { fn(); } catch { /* */ } });
}
