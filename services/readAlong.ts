// readAlong — follow a passage word by word while someone reads it out loud.
//
// The scripture listener only says *which* passage was announced. This follows the reading
// itself: the words heard in the stream are aligned against the words of the open chapter
// (a small local alignment, forgiving of speech-to-text slips like "the" for "thee"), so the
// panel can light the verse being read and the word the reader is on, and keep moving as they
// read on. When the reader stops reading (back to the sermon) nothing matches any more and the
// position goes quiet instead of wandering.
//
// Pure: no React, no timers. The panel feeds it words and asks where the reader is.

export interface ReadAlongLine { id: string; text: string }

export interface ReadAlongPosition {
  /** Index into the lines. */
  line: number;
  /** Index of the word the reader is on, within that line (by the line's own word split). */
  word: number;
  /** When it last matched (ms). */
  at: number;
  /** 0..1, how well the last stretch of speech matched. */
  confidence: number;
}

interface Tok { norm: string; line: number; word: number; stop: boolean }

const STOP = new Set([
  'the', 'and', 'of', 'to', 'a', 'in', 'that', 'is', 'he', 'it', 'for', 'was', 'his', 'i', 'be', 'with',
  'not', 'shall', 'unto', 'they', 'him', 'them', 'all', 'but', 'my', 'me', 'you', 'thee', 'thou', 'thy',
  'your', 'ye', 'are', 'on', 'as', 'by', 'have', 'which', 'this', 'so', 'or', 'at', 'from', 'an', 'we',
  'us', 'our', 'her', 'she', 'who', 'will', 'were', 'had', 'their', 'there', 'then', 'when', 'out', 'up',
]);

// Archaic forms and the modern word a transcriber writes for them.
const SAME: Record<string, string> = {
  thee: 'the', thou: 'you', thy: 'your', thine: 'yours', ye: 'you', hath: 'has', doth: 'does', saith: 'says',
  unto: 'to', art: 'are', shalt: 'shall', wilt: 'will', hast: 'have', didst: 'did', spake: 'spoke',
  lord: 'lord', god: 'god', o: 'oh',
};

/** Lowercase, strip punctuation; "LORD's" → "lords". Used for both sides. */
export function normWord(w: string): string {
  return w.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9]/g, '');
}

/** The words of a line as the panel will draw them (whitespace split, punctuation kept). */
export function lineWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function canon(w: string): string {
  const s = SAME[w] ?? w;
  // crude stemming: eth/est endings, plurals
  return s.replace(/(eth|est)$/, '').replace(/(ies)$/, 'y').replace(/s$/, '');
}

function editWithin1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** 2 = same word, 1 = near enough (spelling / archaic / one letter), 0 = different. */
function wordMatch(heard: string, text: string): number {
  if (!heard || !text) return 0;
  if (heard === text) return 2;
  const a = canon(heard), b = canon(text);
  if (a === b) return 2;
  if (a.length >= 4 && b.length >= 4 && (editWithin1(a, b) || a.startsWith(b) || b.startsWith(a))) return 1;
  return 0;
}

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

export interface ReadAlongTracker {
  /** New words heard (a delta, not the whole transcript). Returns the position if it moved. */
  feed(text: string, now: number): ReadAlongPosition | null;
  position(): ReadAlongPosition | null;
  /** The panel opened a different text. `startLine` is where the reference pointed. */
  setLines(lines: ReadAlongLine[], startLine?: number): void;
  reset(): void;
}

const TAIL = 10;          // heard words compared each time
const LOCKED_BACK = 12;   // once following, how far back a re-read can jump without a full search
const LOCKED_AHEAD = 70;  // …and how far forward

/** Best local alignment of the heard tail inside toks[from, to). Returns end token + score. */
function align(toks: Tok[], from: number, to: number, tail: string[]) {
  const n = tail.length, m = to - from;
  if (!n || m <= 0) return null;
  let prev = new Float32Array(m + 1), cur = new Float32Array(m + 1);
  // track how many heard words matched along the best path (approximate: per cell count)
  let prevC = new Uint8Array(m + 1), curC = new Uint8Array(m + 1);
  // length of the unbroken run of matched words ending at each cell
  let prevR = new Uint8Array(m + 1), curR = new Uint8Array(m + 1);
  let best = 0, bestJ = -1, bestCount = 0;
  for (let i = 1; i <= n; i++) {
    cur[0] = 0; curC[0] = 0; curR[0] = 0;
    for (let j = 1; j <= m; j++) {
      const t = toks[from + j - 1];
      const mt = wordMatch(tail[i - 1], t.norm);
      const gain = mt ? (t.stop ? 1 : mt === 2 ? 3 : 2) : -1.2;
      const diag = prev[j - 1] + gain;
      const up = prev[j] - 1;      // heard word not in the text (filler, "amen")
      const left = cur[j - 1] - 0.7; // text word not heard (transcriber dropped it)
      let v = 0, c = 0, r = 0;
      if (diag > v) { v = diag; c = prevC[j - 1] + (mt ? 1 : 0); r = mt ? prevR[j - 1] + 1 : 0; }
      if (up > v) { v = up; c = prevC[j]; r = 0; }
      if (left > v) { v = left; c = curC[j - 1]; r = 0; }
      cur[j] = v; curC[j] = c; curR[j] = r;
      // Where the reader is now: an alignment that ends on a word just heard (the very last, or
      // the one before it when the last was half-heard), and on a real word — a lone "that"
      // after some sermon talk is not the reading going on.
      if (r && i >= n - 1 && (!t.stop || r >= 2)) {
        const sc = v - (i === n ? 0 : 1);
        if (sc > best) { best = sc; bestJ = j; bestCount = c; }
      }
    }
    [prev, cur] = [cur, prev];
    [prevC, curC] = [curC, prevC];
    [prevR, curR] = [curR, prevR];
  }
  return bestJ < 0 ? null : { end: from + bestJ - 1, score: best, count: bestCount };
}

function tokenize(lines: ReadAlongLine[]): Tok[] {
  const toks: Tok[] = [];
  lines.forEach((l, li) => lineWords(l.text).forEach((w, wi) => {
    const n = normWord(w);
    if (n) toks.push({ norm: n, line: li, word: wi, stop: STOP.has(n) });
  }));
  return toks;
}

function heardWords(text: string): string[] {
  return text.split(/\s+/).map(normWord).filter(Boolean).map(w => {
    const k = NUM_WORDS.indexOf(w);
    return k >= 0 ? String(k) : w;
  });
}

/**
 * How well a stretch of heard speech matches a text: the summed alignment scores of its recent
 * 10-word windows. Used to tell which edition the reader is reading from — the same passage in
 * the reader's own wording scores well above any other.
 */
export function matchStrength(lines: ReadAlongLine[], heard: string, windows = 3): number {
  const toks = tokenize(lines);
  const words = heardWords(heard);
  if (!toks.length || !words.length) return 0;
  let total = 0;
  for (let k = 0; k < windows; k++) {
    const endAt = words.length - k * TAIL;
    if (endAt < 4) break;
    const hit = align(toks, 0, toks.length, words.slice(Math.max(0, endAt - TAIL), endAt));
    total += hit ? hit.score : 0;
  }
  return total;
}

export function createReadAlong(): ReadAlongTracker {
  let toks: Tok[] = [];
  let heard: string[] = [];
  let cursor = -1;        // index into toks of the last matched word
  let pos: ReadAlongPosition | null = null;
  let misses = 0;         // words heard since the last good match

  const setLines = (lines: ReadAlongLine[], startLine = 0) => {
    toks = tokenize(lines);
    void startLine;
    heard = [];
    cursor = -1;
    pos = null;
    misses = 0;
  };

  const feed = (text: string, now: number): ReadAlongPosition | null => {
    if (!toks.length) return null;
    const words = heardWords(text);
    if (!words.length) return null;
    heard = heard.concat(words).slice(-TAIL * 2);
    misses += words.length;
    const tail = heard.slice(-TAIL);

    const locked = cursor >= 0 && misses <= 14;
    let hit = locked
      ? align(toks, Math.max(0, cursor - LOCKED_BACK), Math.min(toks.length, cursor + LOCKED_AHEAD), tail)
      : null;
    const need = locked ? 6 : 9; // a fresh lock needs a longer stretch (≈3 content words)
    if (!hit || hit.score < need) {
      const wide = align(toks, 0, toks.length, tail);
      if (wide && wide.score >= 9 && (!hit || wide.score > hit.score + 2)) hit = wide;
    }
    if (!hit || hit.score < need || hit.count < 3) return null;
    // Never jump backwards by a word or two on noise; a real re-read moves more than that.
    if (cursor >= 0 && hit.end < cursor && cursor - hit.end < 3) return null;
    cursor = hit.end;
    misses = 0;
    const t = toks[cursor];
    pos = { line: t.line, word: t.word, at: now, confidence: Math.min(1, hit.score / (TAIL * 2.4)) };
    return pos;
  };

  return {
    feed,
    position: () => pos,
    setLines,
    reset: () => { heard = []; cursor = -1; pos = null; misses = 0; },
  };
}
