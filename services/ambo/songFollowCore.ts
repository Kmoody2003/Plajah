// songFollowCore — "the band is singing THIS word of THIS song".
//
// Pure (no audio, no DOM, no clock) so it is testable:
//   transcript words in  →  a cursor in the song's lyrics out, plus adlib lines
//   when the singer leaves the script, plus "which song is this?" detection.
//
// ── Aligner ────────────────────────────────────────────────────────────────
// The lyric is flattened to a token list. Each heard word is scored against
// candidate positions by how well the last few heard words line up with the
// tokens ending there (ASR drops and inserts words, so one skip either way is
// allowed). Acceptance gets stricter the further the jump:
//   near    (next 1–3 tokens)        one matching word is enough
//   forward (up to LOOKAHEAD tokens) two words must line up
//   anywhere (back to the chorus…)   three words must line up
// Words that match nothing are held; once `adlibAfter` of them arrive in a row
// the singer is off script — the cursor stays on the last sung word (the sync
// "pauses") and the words become an adlib line. The first confident match
// resumes the song.
//
// ── Detector ───────────────────────────────────────────────────────────────
// Every song is indexed by word trigrams (and non-stopword bigrams). The last
// couple of heard lines are looked up; a song wins when it has enough hits and
// clearly beats the runner-up — normally within the first line or two.

export interface AlignToken { n: string; line: number; word: number }

const FILLERS = new Set(['uh', 'um', 'umm', 'hmm', 'mm', 'erm', 'ah']);
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'is', 'it', 'i', 'you', 'my', 'me', 'we', 'be', 'for', 'oh', 'so', 'at', 'as', 'that', 'this', 'with', 'are', 'your', 'our', 'all']);

const CANON_WORD: Record<string, string> = {
  alleluia: 'hallelujah',
  saviour: 'savior',
  honour: 'honor',
  favour: 'favor',
  colour: 'color',
  spirt: 'spirit',
};

/** Lowercase, strip punctuation and apostrophes ("You're" → "youre"). */
export function normWord(w: string): string {
  const clean = w.toLowerCase().replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  return CANON_WORD[clean] || clean;
}

function stemWord(w: string): string {
  if (w.length <= 4) return w;
  return w.replace(/(?:ing|eth|est|ed|es|s)$/, '');
}

export function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).map(normWord).filter(w => w && !FILLERS.has(w));
}

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Same word as far as a singer + ASR are concerned. */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const L = Math.min(a.length, b.length);
  if (L < 4) return false;
  // plural / tense drift: "praise" ~ "praises", "sing" ~ "singing"
  if ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 3) return true;
  return lev(a, b, L >= 7 ? 2 : 1) <= (L >= 7 ? 2 : 1);
}

export function flattenLyrics(lines: string[]): AlignToken[] {
  const out: AlignToken[] = [];
  lines.forEach((text, line) => {
    text.split(/\s+/).forEach((raw, word) => {
      const n = normWord(raw);
      if (n) out.push({ n, line, word });
    });
  });
  return out;
}

export interface AlignerOptions {
  /** Unmatched words in a row before the singer counts as off script. Default 3. */
  adlibAfter?: number;
  /** How far ahead a two-word match may jump. Default 14 tokens. */
  lookahead?: number;
  /** Words per adlib line before it rolls to a new one. Default 8. */
  adlibMaxWords?: number;
}

export type AlignEvent =
  | { type: 'advance'; line: number; word: number; jumped: boolean }
  | { type: 'adlib-start'; text: string }
  | { type: 'adlib-grow'; text: string }
  | { type: 'adlib-roll'; text: string }
  | { type: 'resume'; line: number; word: number };

export interface AlignerPosition { token: number; line: number; word: number; offScript: boolean; adlib: string }

export interface SongAligner {
  /** Feed NEW heard words. Returns what happened, in order. */
  feed(text: string): AlignEvent[];
  /** Operator override: put the cursor at the start of `line` (or on `word`). */
  jump(line: number, word?: number): void;
  /** Put the cursor ON a token (song detection knows exactly which words it heard). */
  seek(token: number): void;
  position(): AlignerPosition;
  tokens(): AlignToken[];
  reset(): void;
}

export function createSongAligner(lines: string[], opts: AlignerOptions = {}): SongAligner {
  const adlibAfter = Math.max(1, opts.adlibAfter ?? 3);
  const LOOK = opts.lookahead ?? 14;
  const adlibMax = opts.adlibMaxWords ?? 8;
  const tok = flattenLyrics(lines);
  let cursor = -1;
  let heard: string[] = [];
  let unmatched: string[] = [];
  let offScript = false;
  let adlibWords: string[] = [];

  /** How well the trailing heard words line up with tokens ending at j (0 = latest word doesn't match j). */
  const scoreAt = (j: number): number => {
    const last = heard.length - 1;
    if (last < 0 || !wordsMatch(heard[last], tok[j].n)) return 0;
    let s = 1, t = j - 1;
    for (let i = last - 1, used = 1; i >= 0 && used < 4 && t >= 0; i--, used++) {
      if (wordsMatch(heard[i], tok[t].n)) { s += 1; t -= 1; }
      else if (t - 1 >= 0 && wordsMatch(heard[i], tok[t - 1].n)) { s += 0.8; t -= 2; }   // ASR dropped a word
      // else: ASR inserted a word — skip it without moving t
    }
    return s;
  };

  const best = (): { j: number; jumped: boolean } | null => {
    if (!tok.length) return null;
    // near: the next few tokens, one word is enough — two while off script, so a
    // single spoken word that happens to be in the lyric doesn't snap the sync back
    const nearMin = offScript ? 2 : 1;
    for (let j = cursor + 1; j <= Math.min(tok.length - 1, cursor + 3); j++) {
      if (scoreAt(j) >= nearMin) return { j, jumped: false };
    }
    // forward: two words lined up (including when ASR skipped one word in between: 1.8)
    let fj = -1, fs = 0;
    for (let j = cursor + 4; j <= Math.min(tok.length - 1, cursor + LOOK); j++) {
      const s = scoreAt(j);
      if (s >= 1.8 && s > fs) { fs = s; fj = j; }
    }
    if (fj >= 0) return { j: fj, jumped: true };
    // anywhere: three words lined up (repeat of a chorus, the band skipped back)
    let gj = -1, gs = 0, gd = Infinity;
    for (let j = 0; j < tok.length; j++) {
      if (j > cursor && j <= cursor + LOOK) continue;
      const s = scoreAt(j);
      if (s < 2.5) continue;
      // nearest forward from the cursor wins ties (the NEXT chorus, not the last one)
      const d = j > cursor ? j - cursor : tok.length + j - cursor;
      if (s > gs + 0.01 || (Math.abs(s - gs) <= 0.01 && d < gd)) { gs = s; gj = j; gd = d; }
    }
    return gj >= 0 ? { j: gj, jumped: true } : null;
  };

  const pos = (): AlignerPosition => {
    const t = cursor >= 0 ? tok[cursor] : null;
    return { token: cursor, line: t ? t.line : -1, word: t ? t.word : -1, offScript, adlib: adlibWords.join(' ') };
  };

  return {
    feed(text) {
      const events: AlignEvent[] = [];
      for (const w of tokenizeWords(text)) {
        heard.push(w);
        if (heard.length > 8) heard.shift();
        const hit = best();
        if (hit) {
          cursor = hit.j;
          unmatched = [];
          const t = tok[cursor];
          if (offScript) {
            offScript = false;
            adlibWords = [];
            events.push({ type: 'resume', line: t.line, word: t.word });
          } else {
            events.push({ type: 'advance', line: t.line, word: t.word, jumped: hit.jumped });
          }
          continue;
        }
        if (offScript) {
          if (adlibWords.length >= adlibMax) { adlibWords = [w]; events.push({ type: 'adlib-roll', text: w }); }
          else { adlibWords.push(w); events.push({ type: 'adlib-grow', text: adlibWords.join(' ') }); }
          continue;
        }
        unmatched.push(w);
        if (unmatched.length >= adlibAfter) {
          offScript = true;
          adlibWords = unmatched.slice(-adlibMax);
          unmatched = [];
          events.push({ type: 'adlib-start', text: adlibWords.join(' ') });
        }
      }
      return events;
    },
    jump(line, word = 0) {
      const i = tok.findIndex(t => t.line === line && t.word >= word);
      cursor = i >= 0 ? i : tok.findIndex(t => t.line >= line);
      if (cursor < 0) cursor = tok.length - 1;
      // `word` 0 means "the line is up, nothing sung yet" — park just before it.
      if (word === 0 && cursor >= 0) cursor -= 1;
      heard = []; unmatched = []; offScript = false; adlibWords = [];
    },
    seek(token) {
      cursor = Math.max(-1, Math.min(tok.length - 1, token));
      unmatched = []; offScript = false; adlibWords = [];
    },
    position: pos,
    tokens: () => tok,
    reset() { cursor = -1; heard = []; unmatched = []; offScript = false; adlibWords = []; },
  };
}

// ── detection ────────────────────────────────────────────────────────────────

export interface DetectSong { id: string; lines: string[] }
export interface DetectHit { songId: string; score: number; runnerUp: number; token: number; line: number }

export interface SongDetector {
  feed(text: string): void;
  /** Best candidate when it is confident; null otherwise. */
  detect(): DetectHit | null;
  /** Every candidate with a score, best first (for an operator readout). */
  ranking(limit?: number): Array<{ songId: string; score: number }>;
  reset(): void;
}

export interface DetectorOptions {
  /** Minimum score to call it (trigram = 1, bigram = 0.42). Default 1.25. */
  minScore?: number;
  /** Winner must beat the runner-up by this factor. Default 1.5. */
  margin?: number;
  /** Heard words kept. Default 24 (about two sung lines). */
  windowWords?: number;
}

export function createSongDetector(songs: DetectSong[], opts: DetectorOptions = {}): SongDetector {
  const minScore = opts.minScore ?? 1.25;
  const margin = opts.margin ?? 1.5;
  const win = opts.windowWords ?? 24;
  const tri = new Map<string, Array<{ s: number; t: number }>>();
  const bi = new Map<string, Array<{ s: number; t: number }>>();
  const stemBi = new Map<string, Array<{ s: number; t: number }>>();
  const skipBi = new Map<string, Array<{ s: number; t: number }>>();
  const toks = songs.map(s => flattenLyrics(s.lines));
  const add = (m: typeof tri, k: string, v: { s: number; t: number }) => {
    const a = m.get(k);
    if (a) { if (!a.some(x => x.s === v.s)) a.push(v); else return; } else m.set(k, [v]);
  };
  toks.forEach((tk, s) => {
    for (let i = 0; i < tk.length; i++) {
      if (i + 2 < tk.length) {
        add(tri, `${tk[i].n} ${tk[i + 1].n} ${tk[i + 2].n}`, { s, t: i + 2 });
        if (!STOP.has(tk[i].n) && !STOP.has(tk[i + 2].n)) {
          add(skipBi, `${tk[i].n} ${tk[i + 2].n}`, { s, t: i + 2 });
        }
      }
      if (i + 1 < tk.length && !(STOP.has(tk[i].n) && STOP.has(tk[i + 1].n))) {
        add(bi, `${tk[i].n} ${tk[i + 1].n}`, { s, t: i + 1 });
        add(stemBi, `${stemWord(tk[i].n)} ${stemWord(tk[i + 1].n)}`, { s, t: i + 1 });
      }
    }
  });
  let heard: string[] = [];

  const score = () => {
    const sc = new Map<number, { score: number; t: number }>();
    const bump = (s: number, v: number, t: number) => {
      const cur = sc.get(s);
      if (cur) { cur.score += v; if (t > cur.t) cur.t = t; } else sc.set(s, { score: v, t });
    };
    const seenTri = new Set<string>(), seenBi = new Set<string>(), seenSkip = new Set<string>();
    for (let i = 0; i + 1 < heard.length; i++) {
      if (i + 2 < heard.length) {
        const k = `${heard[i]} ${heard[i + 1]} ${heard[i + 2]}`;
        if (!seenTri.has(k)) { seenTri.add(k); for (const h of tri.get(k) || []) bump(h.s, 1, h.t); }
      }
      const b = `${heard[i]} ${heard[i + 1]}`;
      if (!seenBi.has(b)) {
        seenBi.add(b);
        const exactHits = bi.get(b);
        if (exactHits && exactHits.length) {
          for (const h of exactHits) bump(h.s, 0.42, h.t);
        } else {
          const sb = `${stemWord(heard[i])} ${stemWord(heard[i + 1])}`;
          for (const h of stemBi.get(sb) || []) bump(h.s, 0.34, h.t);
        }
      }
      if (!STOP.has(heard[i]) && !STOP.has(heard[i + 1])) {
        if (!seenSkip.has(b)) {
          seenSkip.add(b);
          for (const h of skipBi.get(b) || []) bump(h.s, 0.30, h.t);
        }
      }
    }
    return [...sc.entries()].sort((a, b) => b[1].score - a[1].score);
  };

  return {
    feed(text) { heard = heard.concat(tokenizeWords(text)).slice(-win); },
    detect() {
      const r = score();
      if (!r.length) return null;
      const [s, v] = r[0];
      const runnerUp = r[1]?.[1].score ?? 0;
      if (v.score < minScore || v.score < runnerUp * margin) return null;
      const t = toks[s][v.t];
      return { songId: songs[s].id, score: v.score, runnerUp, token: v.t, line: t ? t.line : 0 };
    },
    ranking(limit = 5) { return score().slice(0, limit).map(([s, v]) => ({ songId: songs[s].id, score: v.score })); },
    reset() { heard = []; },
  };
}
