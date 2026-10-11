// speechIntents — what the speaker MEANS, beyond a verse reference.
//
// Pure (no audio, no DOM, no clock of its own) so it is testable, like
// scriptureListener. Two jobs:
//
//   tagTokens        which words in the live transcript are "action words" —
//                    a spoken reference (book + chapter/verse), a scripture
//                    cue ("turn to", "open your bibles"), or giving language
//                    ("tithes and offerings"). The live waveform lights these up.
//
//   giving listener  the speaker moved into the offering ("let's receive
//                    today's tithes and offerings") → bring up the giving
//                    graphic. Single giving words ("offering") only light up;
//                    it takes a whole giving PHRASE to fire, because "offering
//                    our praise" and "give thanks" are not the offering.

import { bookAliases } from '../scriptureRef';

export type WordTag = 'scripture' | 'giving' | 'cue';

// ── tokens ──────────────────────────────────────────────────────────────────

/** Lowercase, keep word chars, digits, colons (3:16) and dashes (16-18). */
export const normToken = (w: string) => w.toLowerCase().replace(/[‘’]/g, "'").replace(/[^\w:'\-]/g, '').replace(/^'+|'+$/g, '');

const NUM_WORDS = new Set((
  'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen ' +
  'eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred'
).split(' '));
const ORDINALS = new Set(['1', '2', '3', '1st', '2nd', '3rd', 'first', 'second', 'third', 'i', 'ii', 'iii']);
const REF_GLUE = new Set(['chapter', 'chapters', 'verse', 'verses', 'and', 'through', 'to', 'colon', 'v', 'vs', 'ch']);

const isNum = (w: string) => /^\d+(?::\d+)?(?:-\d+)?$/.test(w) || NUM_WORDS.has(w) || /^(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-\w+$/.test(w);

/** Book names ≥ 3 letters (skips "is", "am", "re" style abbreviations). Context still has to confirm them. */
let BOOK_SET: Set<string> | null = null;
const books = () => (BOOK_SET ??= new Set(bookAliases().map(([a]) => a).filter(a => a.length >= 3 && !a.includes(' '))));

// ── phrases ─────────────────────────────────────────────────────────────────

/** "turn to", "open your bibles", "the bible says" — the speaker is heading for a text. */
const SCRIPTURE_CUES: RegExp[] = [
  /\bturn(?:ing)?\s+(?:with\s+me\s+)?(?:in\s+your\s+bibles?\s+)?to\b/g,
  /\bopen\s+(?:up\s+)?(?:your\s+)?(?:bibles?\s+)?(?:to|at)\b/g,
  /\bopen\s+your\s+bibles?\b/g,
  /\blet'?s\s+read\b/g,
  /\b(?:the\s+)?(?:bible|scripture|word(?:\s+of\s+god)?)\s+says\b/g,
  /\bit\s+is\s+written\b/g,
  /\bread(?:ing)?\s+(?:from|in)\b/g,
  /\b(?:the\s+)?(?:book|gospel)\s+of\b/g,
  /\bour\s+text\b/g,
];

/** A giving word, highlighted on its own (never fires on its own). */
const GIVING_WORDS = new Set([
  'offering', 'offerings', 'offertory', 'tithe', 'tithes', 'tithing', 'tithers', 'generosity', 'donation', 'donations',
  'stewardship', 'firstfruits',
]);

/** A whole giving phrase — this is what fires the giving graphic. */
const GIVING_TRIGGERS: RegExp[] = [
  /\btithes?\s+(?:(?:and|n)\s+)?offerings?\b/g,
  /\b(?:receive|take\s+up|collect|bring(?:\s+in)?|present|lift\s+up|give)\s+(?:(?:the|our|this|your|an|today'?s|this\s+morning'?s|tonight'?s|this\s+evening'?s)\s+)?(?:tithes?|offerings?|offertory)\b/g,
  /\b(?:receive|collect|take\s+up)\s+(?:(?:the|our|your)\s+)?gifts\b/g,
  /\b(?:time|moment|season|opportunity)\s+(?:of|for|to)\s+(?:(?:the|our)\s+)?(?:giving|give|offering|offerings|tithes?|tithing|generosity)\b(?!\s+(?:thanks|praise|glory|honou?r|him|god|the\s+lord))/g,
  /\b(?:it'?s|it\s+is|now\s+is|now\s+it'?s)\s+(?:(?:our|that)\s+)?(?:time\s+)?(?:to|for)\s+(?:give|giving|the\s+offering|our\s+offering|tithes?)\b(?!\s+(?:thanks|praise|glory|honou?r|him|god|the\s+lord))/g,
  /\b(?:ways?|places?)\s+to\s+give\b/g,
  /\btext\s+(?:to\s+give|give)\b/g,
  /\bgive\s+online\b/g,
  /\bonline\s+giving\b/g,
  /\bgiving\s+(?:app|kiosk|link|page|envelopes?|baskets?|buckets?)\b/g,
  /\b(?:offering|tithe)\s+(?:time|baskets?|buckets?|plates?|envelopes?)\b/g,
  /\boffertory\b/g,
  /\b(?:let'?s|let\s+us|we(?:'re|\s+are)?\s+(?:going\s+to|gonna)|we\s+will|as\s+we)\s+(?:now\s+)?(?:give\s+(?:generously|cheerfully|back\s+to\s+(?:the\s+lord|god|him))|worship\s+(?:the\s+lord\s+|him\s+|god\s+)?(?:in|through|with)\s+(?:our\s+)?(?:giving|tithes?|offerings?|generosity))\b/g,
  /\bushers?\s+(?:will|are|come|please)\b/g,
];

/** Joined text + each token's [start, end) so phrase matches map back to words. */
function joinWithOffsets(tokens: string[]) {
  const spans: Array<[number, number]> = [];
  let text = '';
  for (const t of tokens) {
    if (text) text += ' ';
    spans.push([text.length, text.length + t.length]);
    text += t;
  }
  return { text, spans };
}

function tagMatches(tags: (WordTag | null)[], spans: Array<[number, number]>, text: string, patterns: RegExp[], tag: WordTag, overwrite: (cur: WordTag | null) => boolean) {
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const s = m.index, e = s + m[0].length;
      spans.forEach(([a, b], i) => { if (a < e && b > s && overwrite(tags[i])) tags[i] = tag; });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
}

/**
 * Tag each (already normalised) token. Scripture references win over cues;
 * giving phrases win over a bare cue. A lone book name needs a number right
 * after it ("Mark 4", "John chapter three") — "mark my words" stays plain.
 */
export function tagTokens(rawTokens: string[]): (WordTag | null)[] {
  const tokens = rawTokens.map(normToken);
  const tags: (WordTag | null)[] = tokens.map(() => null);
  const { text, spans } = joinWithOffsets(tokens);
  const B = books();

  tagMatches(tags, spans, text, SCRIPTURE_CUES, 'cue', cur => cur === null);

  for (let i = 0; i < tokens.length; i++) {
    if (!B.has(tokens[i])) continue;
    // a number within the next two tokens ("john 3", "john chapter 3")
    let j = i + 1, found = -1;
    for (; j < Math.min(tokens.length, i + 3); j++) {
      if (isNum(tokens[j])) { found = j; break; }
      if (!REF_GLUE.has(tokens[j])) break;
    }
    if (found < 0) continue;
    let end = found;
    // run on through "3 verse 16 through 18"
    for (let k = found + 1; k < tokens.length; k++) {
      if (isNum(tokens[k])) end = k;
      else if (!REF_GLUE.has(tokens[k])) break;
    }
    const start = i > 0 && ORDINALS.has(tokens[i - 1]) ? i - 1 : i;
    for (let k = start; k <= end; k++) tags[k] = 'scripture';
  }

  tokens.forEach((t, i) => { if (GIVING_WORDS.has(t) && tags[i] !== 'scripture') tags[i] = 'giving'; });
  tagMatches(tags, spans, text, GIVING_TRIGGERS, 'giving', cur => cur !== 'scripture');
  return tags;
}

/** The last giving phrase in `text`, or null. */
export function detectGivingIntent(text: string): { phrase: string; index: number } | null {
  const t = text.split(/\s+/).map(normToken).filter(Boolean).join(' ');
  let best: { phrase: string; index: number } | null = null;
  for (const re of GIVING_TRIGGERS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      if (!best || m.index >= best.index) best = { phrase: m[0], index: m.index };
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return best;
}

// ── giving listener ─────────────────────────────────────────────────────────

export interface GivingHit { phrase: string; at: number; }

export interface GivingListenerOptions {
  /** A heard phrase waits this long before firing (lets "…tithes and offerings" finish). Default 700 ms. */
  settleMs?: number;
  /** Once fired, the giving graphic will not fire again inside this window. Default 5 min. */
  cooldownMs?: number;
  /** Rolling window, in words. Default 24. */
  windowWords?: number;
}

export interface GivingListener {
  feed(text: string, now: number): void;
  poll(now: number): GivingHit[];
  pending(): GivingHit | null;
  reset(): void;
}

export function createGivingListener(opts: GivingListenerOptions = {}): GivingListener {
  const settleMs = opts.settleMs ?? 700;
  const cooldownMs = opts.cooldownMs ?? 5 * 60_000;
  const windowWords = opts.windowWords ?? 24;
  let words: string[] = [];
  let pend: GivingHit | null = null;
  let lastFired = -Infinity;

  return {
    feed(text, now) {
      const next = text.split(/\s+/).map(normToken).filter(Boolean);
      if (!next.length) return;
      words = words.concat(next).slice(-windowWords);
      if (now - lastFired < cooldownMs) { pend = null; return; }
      const hit = detectGivingIntent(words.join(' '));
      // Later words can take it back ("it's time to give… thanks"). A phrase does not get
      // "more specific" like a verse does, so a standing match keeps its settle clock.
      if (!hit) pend = null;
      else if (!pend) pend = { phrase: hit.phrase, at: now };
    },
    poll(now) {
      if (!pend || now - pend.at < settleMs) return [];
      const hit = pend;
      pend = null;
      words = [];           // the phrase that fired must not fire again from the same window
      lastFired = now;
      return [hit];
    },
    pending() { return pend; },
    reset() { words = []; pend = null; },
  };
}
