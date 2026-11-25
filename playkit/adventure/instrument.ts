// playkit/adventure/instrument.ts
//
// A playable instrument for adventure games (the ocarina pattern). The player plays notes; when the last
// notes played match a song, the song fires. Songs are data ({ id, notes }), so a creator writes them in
// the Studio: Lexicon's songs are words (notes = letters), another game could use five buttons.
// Pure logic + a pitch helper; the game makes the sound.

export interface Song { id: string; name?: string; notes: string[] }

export interface PlayResult { note: string; song?: Song; buffer: string[] }

export class Instrument {
  private buf: string[] = [];
  private lastAt = -Infinity;
  private songs: Song[];
  /** Seconds of silence after which the phrase starts over. */
  resetAfter: number;
  maxLen: number;

  constructor(songs: Song[] = [], opts: { resetAfter?: number } = {}) {
    this.songs = [...songs];
    this.resetAfter = opts.resetAfter ?? 1.6;
    this.maxLen = Math.max(8, ...this.songs.map((s) => s.notes.length));
  }

  setSongs(songs: Song[]) {
    this.songs = [...songs];
    this.maxLen = Math.max(8, ...this.songs.map((s) => s.notes.length));
  }

  get phrase(): readonly string[] { return this.buf; }

  clear() { this.buf = []; }

  /** Play one note at time `t` (seconds). Returns the song it completes, if any (and clears the phrase). */
  play(note: string, t: number): PlayResult {
    if (t - this.lastAt > this.resetAfter) this.buf = [];
    this.lastAt = t;
    this.buf.push(note);
    if (this.buf.length > this.maxLen) this.buf.shift();
    // longest song first, so TIME doesn't steal TIMEKEEPER
    const bySize = [...this.songs].sort((a, b) => b.notes.length - a.notes.length);
    for (const s of bySize) {
      const n = s.notes.length;
      if (n && n <= this.buf.length && s.notes.every((x, i) => x === this.buf[this.buf.length - n + i])) {
        const buffer = [...this.buf];
        this.buf = [];
        return { note, song: s, buffer };
      }
    }
    return { note, buffer: [...this.buf] };
  }

  /** Could the current phrase still become a song? (UI: dim the phrase when it can't.) */
  onTrack(): boolean {
    if (!this.buf.length) return true;
    return this.songs.some((s) => {
      for (let start = 0; start < this.buf.length; start++) {
        const tail = this.buf.slice(start);
        if (tail.length <= s.notes.length && tail.every((x, i) => x === s.notes[i])) return true;
      }
      return false;
    });
  }
}

/**
 * Pitch for a note symbol on a pentatonic ladder. Letters A–Z climb ~5 octaves of a major pentatonic,
 * so any word plays as a melody that never clashes; other symbols hash onto the same ladder.
 */
export function noteFrequency(symbol: string, rootHz = 196 /* G3 */): number {
  const steps = [0, 2, 4, 7, 9];
  const c = symbol.toUpperCase();
  const idx = c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 65 : [...c].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 26;
  const oct = Math.floor(idx / 5), deg = steps[idx % 5];
  return rootHz * Math.pow(2, (oct * 12 + deg) / 12);
}
