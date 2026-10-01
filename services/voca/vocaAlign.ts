/**
 * Voca alignment engine — pure, framework-free, unit-tested (tests/voca.test.ts).
 *
 * Turns a stream of recognised words into reading events against the expected passage:
 *  • the reader's place is a pointer; a heard word is matched against the CURRENT word first, then a short
 *    look-ahead (skips), then a short look-back (re-reading is normal and never penalised);
 *  • matching forgives recogniser artefacts, never the child: homophones ("their/there", "two/to") and
 *    number formats always match; small function words the recogniser commonly drops are inferred;
 *  • beginners (levels ≤ 3) also get credit for an ending slip (dig/digs) — decoding the word is the goal;
 *  • anything that does not resemble the current word (another voice, "um", room noise) is NOISE: it is
 *    counted for the listening-quality meter but never marks a word wrong;
 *  • a plausible wrong attempt climbs the coaching ladder: 1 try again · 2 syllables · 3 hear it · 4 move on.
 */

export type WordStatus = 'pending' | 'good' | 'miss' | 'coached';
export interface VWord {
  display: string; norm: string; status: WordStatus;
  attempts: number; helped: boolean; comeback: boolean; inferred: boolean; isFunction: boolean;
}
export interface AlignState {
  words: VWord[]; i: number; level: number;
  noise: number; tokens: number;
  startedAt: number | null; endedAt: number | null;
}
export type AlignEvent =
  | { type: 'good'; index: number; comeback: boolean }
  | { type: 'skip'; index: number; inferred: boolean }
  | { type: 'attempt'; index: number; attempt: number }
  | { type: 'reread' }
  | { type: 'noise' }
  | { type: 'done' };

export const MAX_ATTEMPTS = 4;
const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'in', 'on', 'at', 'is', 'it', 'as', 'or', 'for', 'by', 'so', 'be', 'that', 'this', 'with', 'from', 'are', 'was', 'i']);
const FILLERS = new Set(['um', 'uh', 'er', 'ah', 'erm', 'hmm', 'mm', 'uhm', 'huh']);
const HOMOPHONES: string[][] = [
  ['to', 'too', 'two', '2'], ['there', 'their', 'theyre'], ['your', 'youre'], ['its', 'it'], ['by', 'buy', 'bye'], ['for', 'four', '4'],
  ['one', 'won', '1'], ['hear', 'here'], ['see', 'sea'], ['sun', 'son'], ['know', 'no'], ['new', 'knew'], ['right', 'write'],
  ['red', 'read'], ['ate', 'eight', '8'], ['blue', 'blew'], ['flower', 'flour'], ['night', 'knight'], ['week', 'weak'], ['wait', 'weight'],
  ['tail', 'tale'], ['road', 'rode'], ['pair', 'pear'], ['hole', 'whole'], ['meet', 'meat'], ['peace', 'piece'], ['plain', 'plane'],
  ['sail', 'sale'], ['wear', 'where'], ['which', 'witch'], ['weather', 'whether'], ['mom', 'mum', 'mam'], ['okay', 'ok'], ['mr', 'mister'],
  ['grey', 'gray'], ['through', 'threw'], ['made', 'maid'], ['cent', 'scent', 'sent'], ['flu', 'flew'], ['dear', 'deer'], ['hare', 'hair'],
  ['bear', 'bare'], ['would', 'wood'], ['not', 'knot'], ['sum', 'some'], ['sore', 'soar'], ['whole', 'hole'], ['tide', 'tied'],
  ['won', 'one'], ['in', 'inn'], ['be', 'bee'], ['oh', 'o', 'owe'], ['ill', 'll'], ['lead', 'led'], ['rows', 'rose'], ['brake', 'break'],
];
const homoIndex = new Map<string, number>();
HOMOPHONES.forEach((g, i) => g.forEach(w => { if (!homoIndex.has(w)) homoIndex.set(w, i); }));
const NUMBER_WORDS = new Set(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'oh']);

export function normalize(w: string): string {
  return w.toLowerCase().replace(/[’‘`]/g, "'").replace(/'/g, '').replace(/[^a-z0-9]/g, '');
}

/** Split passage text into display words (hyphenated compounds become two words, punctuation stays on display). */
export function splitPassage(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const parts = raw.split(/(?<=[A-Za-z0-9])-(?=[A-Za-z0-9])/);
    parts.forEach((p, k) => out.push(k < parts.length - 1 ? p + '-' : p));
  }
  return out.filter(d => normalize(d).length > 0);
}

export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
const stemOf = (w: string) => w.replace(/(ies|es|s|ed|ing|d)$/, '');
const spellingKey = (w: string) => w.replace(/([a-z])(?=\1)/g, '').replace(/our/g, 'or').replace(/re$/, 'er').replace(/ise$/, 'ize');

/** Does a heard word count as the expected word? Forgives recogniser artefacts; leniency grows for beginners. */
export function wordsMatch(expected: string, heard: string, level: number): boolean {
  if (!expected || !heard) return false;
  if (expected === heard) return true;
  const he = homoIndex.get(expected), hh = homoIndex.get(heard);
  if (he !== undefined && he === hh) return true;
  if (/^\d+s?$/.test(expected) && (/^\d+s?$/.test(heard) || NUMBER_WORDS.has(heard))) return /^\d+s?$/.test(heard) ? heard.replace(/s$/, '') === expected.replace(/s$/, '') : true;
  if (level <= 3 && expected.length >= 3 && stemOf(expected) === stemOf(heard)) return true;
  // recogniser SPELLING variants only (traveller/traveler, colour/color, centre/center) — never a near-miss
  // pronunciation like "enormus", which is exactly what the coaching ladder is for
  if (expected.length >= 5 && spellingKey(expected) === spellingKey(heard)) return true;
  return false;
}

/** Is this heard word a plausible attempt at the expected word (vs. noise / another speaker)? */
export function plausibleAttempt(expected: string, heard: string): boolean {
  if (!heard || FILLERS.has(heard)) return false;
  if (heard[0] === expected[0]) return true;
  const d = lev(expected, heard), L = Math.max(expected.length, heard.length);
  return d / L <= 0.6;
}

export function createAlign(text: string, level: number): AlignState {
  const words = splitPassage(text).map(display => {
    const norm = normalize(display);
    return { display, norm, status: 'pending' as WordStatus, attempts: 0, helped: false, comeback: false, inferred: false, isFunction: FUNCTION_WORDS.has(norm) };
  });
  return { words, i: 0, level, noise: 0, tokens: 0, startedAt: null, endedAt: null };
}

function finish(s: AlignState, now: number, ev: AlignEvent[]) {
  if (s.i >= s.words.length && s.endedAt === null) { s.endedAt = now; ev.push({ type: 'done' }); }
}

function markGood(s: AlignState, idx: number, now: number, ev: AlignEvent[]) {
  const w = s.words[idx];
  w.comeback = w.attempts > 0 || w.helped;
  w.status = 'good';
  ev.push({ type: 'good', index: idx, comeback: w.comeback });
}

/** Feed one recognised word (plus the recogniser's alternative guesses for it). */
export function feedWord(s: AlignState, heardRaw: string, alts: string[] = [], now = Date.now()): AlignEvent[] {
  const ev: AlignEvent[] = [];
  if (s.i >= s.words.length) return ev;
  const cands = [heardRaw, ...alts].map(normalize).filter(Boolean);
  if (!cands.length) return ev;
  s.tokens++;
  if (s.startedAt === null) s.startedAt = now;
  const L = s.level, cur = s.i;
  const hits = (idx: number) => idx >= 0 && idx < s.words.length && cands.some(c => wordsMatch(s.words[idx].norm, c, L));

  // 1) the current word
  if (hits(cur)) { markGood(s, cur, now, ev); s.i = cur + 1; finish(s, now, ev); return ev; }
  // 2) look-ahead: the reader moved on (or the recogniser dropped short words)
  for (let k = 1; k <= 3; k++) {
    if (!hits(cur + k)) continue;
    for (let j = cur; j < cur + k; j++) {
      const w = s.words[j];
      if (w.isFunction && w.attempts === 0) { w.status = 'good'; w.inferred = true; ev.push({ type: 'skip', index: j, inferred: true }); }
      else { w.status = 'miss'; w.attempts = Math.max(1, w.attempts); ev.push({ type: 'skip', index: j, inferred: false }); }
    }
    markGood(s, cur + k, now, ev); s.i = cur + k + 1; finish(s, now, ev); return ev;
  }
  // 3) look-back: re-reading for meaning or a running start — never penalised
  for (let k = 1; k <= 3; k++) if (hits(cur - k)) { ev.push({ type: 'reread' }); return ev; }
  // 4) a plausible try at the current word climbs the coaching ladder; anything else is noise
  const w = s.words[cur];
  if (cands.some(c => plausibleAttempt(w.norm, c))) {
    w.attempts++;
    ev.push({ type: 'attempt', index: cur, attempt: w.attempts });
    if (w.attempts >= MAX_ATTEMPTS) { w.status = 'coached'; s.i = cur + 1; finish(s, now, ev); }
    return ev;
  }
  s.noise++;
  ev.push({ type: 'noise' });
  return ev;
}

/** The coach modelled the current word (hear-it button or ladder step 3). The next correct read is a comeback. */
export function markHelped(s: AlignState) { const w = s.words[s.i]; if (w) w.helped = true; }

/** Move past the current word without a correct read (skip button / long silence after modelling). */
export function moveOn(s: AlignState, now = Date.now()): AlignEvent[] {
  const ev: AlignEvent[] = []; const w = s.words[s.i]; if (!w) return ev;
  w.status = 'coached'; w.attempts = Math.max(w.attempts, 1); s.i++; finish(s, now, ev); return ev;
}

/** Listener mode: an adult judges the current word. */
export function judge(s: AlignState, correct: boolean, now = Date.now()): AlignEvent[] {
  const ev: AlignEvent[] = []; const w = s.words[s.i]; if (!w) return ev;
  if (s.startedAt === null) s.startedAt = now;
  if (correct) { markGood(s, s.i, now, ev); s.i++; finish(s, now, ev); }
  else { w.attempts++; ev.push({ type: 'attempt', index: s.i, attempt: w.attempts }); if (w.attempts >= MAX_ATTEMPTS) { w.status = 'coached'; s.i++; finish(s, now, ev); } }
  return ev;
}

export interface ReadingSummary {
  words: number; reached: number; correct: number; firstTry: number; accuracy: number; wcpm: number;
  comebacks: string[]; practice: string[]; noiseRatio: number; noisy: boolean; seconds: number;
}

/** Accuracy = words read correctly on the first try ÷ words reached. WCPM = correct words per reading minute. */
export function summarize(s: AlignState, pausedMs = 0, now = Date.now()): ReadingSummary {
  const reached = s.words.filter(w => w.status !== 'pending');
  const correct = reached.filter(w => w.status === 'good');
  const firstTry = correct.filter(w => w.attempts === 0 && !w.helped);
  const end = s.endedAt ?? now, start = s.startedAt ?? end;
  const seconds = Math.max(1, (end - start - pausedMs) / 1000);
  const uniq = (a: string[]) => [...new Set(a)];
  const noiseRatio = s.tokens ? s.noise / s.tokens : 0;
  return {
    words: s.words.length, reached: reached.length, correct: correct.length, firstTry: firstTry.length,
    accuracy: reached.length ? firstTry.length / reached.length : 0,
    wcpm: Math.round(correct.length / (seconds / 60)),
    comebacks: uniq(reached.filter(w => w.comeback && w.status === 'good').map(w => w.norm)),
    practice: uniq(reached.filter(w => w.status !== 'good' || w.comeback).map(w => w.norm)),
    noiseRatio, noisy: noiseRatio > 0.35 && s.tokens > 12, seconds,
  };
}

/** Syllables for the coaching ladder: passage overrides first, then a vowel-group heuristic. */
export function syllabify(word: string, overrides?: Record<string, string[]>): string[] {
  const w = normalize(word);
  if (overrides?.[w]) return overrides[w];
  if (w.length <= 3) return [w];
  const parts: string[] = []; let curr = '';
  const isV = (c: string) => 'aeiouy'.includes(c);
  for (let i = 0; i < w.length; i++) {
    curr += w[i];
    const next = w[i + 1], after = w[i + 2];
    if (isV(w[i]) && next && !isV(next) && after && isV(after) && i < w.length - 2) { parts.push(curr); curr = ''; }
    else if (!isV(w[i]) && next && !isV(next) && i > 0 && isV(w[i - 1]) && after && isV(after) && w[i] !== next) { parts.push(curr); curr = ''; }
  }
  if (curr) parts.push(curr);
  // a trailing silent-e syllable is not a syllable ("make" not "ma-ke")
  if (parts.length > 1 && /^[^aeiouy]*e$/.test(parts[parts.length - 1])) { const last = parts.pop()!; parts[parts.length - 1] += last; }
  return parts.length ? parts : [w];
}
