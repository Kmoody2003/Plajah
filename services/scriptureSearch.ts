// scriptureSearch — the operator's "type anything" scripture box, for Ambo and Lectio.
//
// parseRef() is strict on purpose (it scans prose and transcripts, so it must
// not guess). An operator's search box is the opposite: half a book name, a
// misspelling, "second pet 3 9", "II Peter", "jn3 16", "rev 21 4". This module
// anticipates:
//
//   · the BOOK from whatever was typed so far — prefix, alias, abbreviation,
//     a word inside the name ("solomon"), or a near-miss spelling
//     ("phillipians", "revalation", "ecclesiates")
//   · an ORDINAL in any form (2, 2nd, second, II, ii) — and an ordinal alone
//     ("2", "second", "II") filters to every book that has one
//   · NUMBERS with or without operators: the first is the chapter, the second
//     the verse, a third the end verse ("john 3 16", "john 3:16", "john 3.16",
//     "john 3 v16", "john 3 16 18", "john 3:16-18")
//
// Numbers with no book ("3 16") come back as `contextual` so the caller can
// apply them to the book already open.

import { BOOKS, type BibleBook } from './bibleService';
import { bookAliases, SINGLE_CHAPTER, type ScriptureRef } from './scriptureRef';

export interface BookMatch { book: BibleBook; score: number; }

export interface ScriptureQuery {
  /** 1–4 when an ordinal was typed ("2", "II", "second"). */
  ordinal: number | null;
  /** The book text as typed, lowercased, ordinal removed. */
  bookText: string;
  /** Ranked candidate books — every book the text could mean, best first. */
  matches: BookMatch[];
  /** The anticipated book (the top match), or null. */
  book: BibleBook | null;
  chapter?: number;
  verse?: number;
  endVerse?: number;
  /** A full reference when a book and a valid chapter are known. */
  ref: ScriptureRef | null;
  /** Numbers with no book text — apply them to the book already open. */
  contextual: boolean;
  /** Only an ordinal was typed: `matches` is the whole numbered family. */
  ordinalOnly: boolean;
}

const ORD_WORD: Record<string, number> = {
  '1': 1, '1st': 1, first: 1, i: 1,
  '2': 2, '2nd': 2, second: 2, ii: 2,
  '3': 3, '3rd': 3, third: 3, iii: 3,
  '4': 4, '4th': 4, fourth: 4, iv: 4,
};

/** Digits may run straight into the book ("2pet", "1cor13"); words and roman numerals need a break ("ii peter", not "isaiah"). */
const ORD_DIGIT = /^([1-4])(?:st|nd|rd|th)?\.?\s*(?=[a-z]|$)/;
const ORD_WORDS = /^(first|second|third|fourth|iv|iii|ii|i)(?:\.\s*|\s+|$)/;

function bookOrdinal(b: BibleBook): { ordinal: number | null; base: string } {
  const m = /^([1-4])\s+(.*)$/.exec(b.name);
  return m ? { ordinal: Number(m[1]), base: m[2].toLowerCase() } : { ordinal: null, base: b.name.toLowerCase() };
}

/** Optimal-string-alignment distance (Levenshtein + adjacent swaps), capped for speed. */
function editDistance(a: string, b: string, cap = 4): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
    if (rowMin > cap) return cap + 1;
  }
  return prev[b.length];
}

function isSubsequence(t: string, k: string): boolean {
  let i = 0;
  for (let j = 0; j < k.length && i < t.length; j++) if (k[j] === t[i]) i++;
  return i === t.length;
}

const squash = (s: string) => s.replace(/[\s.]+/g, '');

/** Alias table grouped by book number, built once. */
let ALIAS_BY_BOOK: Map<number, string[]> | null = null;
function aliasesFor(num: number): string[] {
  if (!ALIAS_BY_BOOK) {
    ALIAS_BY_BOOK = new Map();
    for (const [alias, , n] of bookAliases()) {
      const list = ALIAS_BY_BOOK.get(n) ?? [];
      list.push(alias);
      ALIAS_BY_BOOK.set(n, list);
    }
  }
  return ALIAS_BY_BOOK.get(num) ?? [];
}

/** How well `t` (lowercase, ordinal stripped) names this book. 0 = not at all. */
function scoreBook(t: string, b: BibleBook): number {
  const { base } = bookOrdinal(b);
  const tq = squash(t);
  if (!tq) return 0;
  const name = squash(base);
  let best = 0;

  if (name === tq) best = 100;
  else if (name.startsWith(tq)) best = 92 - Math.min(6, (name.length - tq.length) * 0.2);

  for (const alias of aliasesFor(b.num)) {
    const a = squash(alias);
    if (a === tq) best = Math.max(best, 96);
    else if (a.startsWith(tq)) best = Math.max(best, 84);
  }
  if (best) return best;

  // A word inside the name: "solomon" → Song of Solomon, "jeremiah" → Letter of Jeremiah.
  if (tq.length >= 3 && base.split(/\s+/).some(w => w.startsWith(tq))) best = 70;

  // Abbreviations that skip letters: "dt", "phlp", "hbk", "zph".
  if (!best && tq.length >= 2 && tq[0] === name[0] && isSubsequence(tq, name)) best = 55 + Math.min(10, tq.length * 2);

  // Misspellings: compare against the whole name and against a same-length prefix
  // (the operator may still be typing).
  if (tq.length >= 3) {
    const allowed = tq.length <= 4 ? 1 : tq.length <= 7 ? 2 : 3;
    const d = Math.min(editDistance(tq, name, allowed), editDistance(tq, name.slice(0, tq.length), allowed));
    if (d <= allowed) best = Math.max(best, 48 - d * 6);
  }
  return best;
}

/** Rank books for the typed text. Ordinal given → only that numbered family. */
export function searchBooks(text: string, books: BibleBook[] = BOOKS): BookMatch[] {
  const q = parseShape(text);
  return rankBooks(q.ordinal, q.bookText, books);
}

function rankBooks(ordinal: number | null, bookText: string, books: BibleBook[]): BookMatch[] {
  const out: BookMatch[] = [];
  books.forEach(b => {
    const { ordinal: bo } = bookOrdinal(b);
    if (ordinal !== null && bo !== ordinal) return;
    if (!bookText) {
      if (ordinal !== null) out.push({ book: b, score: 50 });
      return;
    }
    let s = scoreBook(bookText, b);
    if (!s) return;
    // "john" means John before 1–3 John; the numbered books still show.
    if (ordinal === null && bo !== null) s -= 5;
    out.push({ book: b, score: s });
  });
  // Stable: equal scores keep canon order.
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.score - a.m.score || a.i - b.i)
    .map(x => x.m);
}

interface Shape { ordinal: number | null; bookText: string; nums: number[]; chapterRange: boolean; }

function parseShape(input: string): Shape {
  let s = (input || '').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  let ordinal: number | null = null;
  const om = ORD_DIGIT.exec(s) || ORD_WORDS.exec(s);
  if (om) { ordinal = ORD_WORD[om[1]]; s = s.slice(om[0].length).trim(); }

  // "john chapter 3 verse 16": the scaffolding words are not part of the book.
  s = s.replace(/\b(?:chapters?|verses?)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // Book text runs until the first digit; "song of solomon 2 4" keeps its spaces.
  const bm = /^([a-z][a-z .]*?)\s*(?=\d|$)/.exec(s);
  let bookText = '';
  if (bm) { bookText = bm[1].replace(/\.+$/, '').trim(); s = s.slice(bm[0].length); }
  // Mid-word "sec" / "thir": no book starts that way, so it is an ordinal being typed.
  if (ordinal === null && bookText.length >= 3 && !/\d/.test(s)) {
    const w = ['first', 'second', 'third', 'fourth'].findIndex(o => o.startsWith(bookText));
    if (w >= 0) { ordinal = w + 1; bookText = ''; }
  }
  // Spelled-out scaffolding between numbers ("3 verse 16", "3 v16", "16 to 18").
  const tail = s.replace(/\b(?:chapters?|ch|verses?|vv?|vs)\b\.?/g, ' ').replace(/\b(?:to|through|thru)\b/g, '-');
  const nums = (tail.match(/\d{1,3}/g) || []).map(Number);
  // "matt 5-7" (a dash straight after the first number, no verse operator) is a chapter range.
  const chapterRange = /^\s*\d{1,3}\s*[-–—]\s*\d/.test(tail) && !/[:.]/.test(tail);
  return { ordinal, bookText, nums, chapterRange };
}

/** The whole query: anticipated book, chapter, verse. */
export function resolveScriptureQuery(input: string, books: BibleBook[] = BOOKS): ScriptureQuery {
  const { ordinal, bookText, nums, chapterRange } = parseShape(input);
  const matches = rankBooks(ordinal, bookText, books);
  const ordinalOnly = ordinal !== null && !bookText && nums.length === 0;
  const contextual = ordinal === null && !bookText && nums.length > 0;
  const book = ordinalOnly ? null : matches[0]?.book ?? null;

  const out: ScriptureQuery = { ordinal, bookText, matches, book, ref: null, contextual, ordinalOnly };
  if (!nums.length) return out;

  let chapter = nums[0];
  let verse: number | undefined = chapterRange ? undefined : nums[1];
  let endVerse: number | undefined = chapterRange ? undefined : nums[2];
  // Jude 5 = verse 5; Jude 1 5 = 1:5.
  if (book && SINGLE_CHAPTER.has(book.num) && nums.length === 1 && chapter > 1) { verse = chapter; chapter = 1; }
  if (verse !== undefined && (verse < 1 || verse > 176)) verse = undefined;
  if (endVerse !== undefined && (verse === undefined || endVerse <= verse)) endVerse = undefined;

  out.chapter = chapter;
  out.verse = verse;
  out.endVerse = endVerse;
  if (book && chapter >= 1 && chapter <= book.chapters) {
    const ref: ScriptureRef = { book: book.num, bookName: book.name, chapter };
    if (verse !== undefined) ref.verse = verse;
    if (endVerse !== undefined) ref.endVerse = endVerse;
    out.ref = ref;
  }
  return out;
}

/** "2 Peter 3:9" / "2 Peter 3" / "2 Peter" — the operator-facing label for a query's anticipation. */
export function queryLabel(q: ScriptureQuery): string {
  if (!q.book) return '';
  let s = q.book.name;
  if (q.chapter !== undefined) s += ` ${q.chapter}`;
  if (q.verse !== undefined) s += `:${q.verse}`;
  if (q.endVerse !== undefined) s += `–${q.endVerse}`;
  return s;
}
