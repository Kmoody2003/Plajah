// scriptureRef — the canonical Scripture reference parser for Plajah.
//
// One grammar, used everywhere a reference can appear:
//   · Ambo's composer          → parseRef('rom 8.28-31')
//   · sermon prep + prose      → findRefs(outlineText)   (offsets → live text decoration)
//   · Kairos live detection    → findRefs(normalizeSpoken(asrChunk)) → matchPrediction(...)
//   · notes, markers, Firestore→ refId(ref)  ("45.8.28-45.8.31")
//
// Everything resolves to the getbible book numbers already used by bibleService
// (1–66), so a parsed ref can be handed straight to fetchChapter().

import { BOOKS, type BibleBook } from './bibleService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScriptureRef {
  book: number;          // 1–66 (getbible numbering)
  bookName: string;      // canonical display name, e.g. "1 Corinthians"
  chapter: number;
  /** Omitted = the whole chapter. */
  verse?: number;
  /** Only set when a range crosses a chapter boundary (Gen 1:1–2:3). */
  endChapter?: number;
  /** Omitted alongside `verse` = a single verse. */
  endVerse?: number;
}

export interface DetectedRef extends ScriptureRef {
  /** The exact substring matched in the source text. */
  raw: string;
  start: number;
  end: number;
  /** 0–1. Full book name + chapter:verse scores highest; bare chapters and
   *  ambiguous abbreviations score lower. Kairos gates auto-fire on this. */
  confidence: number;
}

export interface ParseOptions {
  /** Resolve bare "v. 5" / "verses 3-5" against a ref already in scope. */
  context?: ScriptureRef | null;
  /** Drop refs whose chapter/verse fall outside the real book. Default true. */
  validate?: boolean;
  /**
   * Scanning free prose (a post, a chat message) rather than an operator's
   * input. Requires a capitalised book name unless an explicit chapter:verse
   * is present, so "he acts 2 ways" and "i am 30 today" stay plain text while
   * "Acts 2" and "acts 2:38" still resolve. Off by default — Ambo's composer
   * depends on bare lowercase working.
   */
  prose?: boolean;
  /** Discard detections below this confidence. Default 0 (keep everything). */
  minConfidence?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Book aliases
//
// Numbered books are keyed by their *base* name only ('corinthians', 'john'),
// with `n` holding the 1st/2nd/3rd forms and `plain` the unnumbered book if one
// exists. That keeps "1 Jn", "I John", "First John" and "1st John" as one rule
// instead of a combinatorial alias list.
// ─────────────────────────────────────────────────────────────────────────────

interface AliasEntry {
  plain?: number;
  n?: number[];          // index 0 = "1 X", 1 = "2 X", 2 = "3 X"
  /** Genuinely ambiguous in common usage — caps confidence. */
  ambiguous?: boolean;
}

const BASE_ALIASES: Record<string, AliasEntry> = {
  // ── Pentateuch / history ──
  genesis: { plain: 1 }, gen: { plain: 1 }, ge: { plain: 1 }, gn: { plain: 1 },
  exodus: { plain: 2 }, exod: { plain: 2 }, exo: { plain: 2 }, ex: { plain: 2 },
  leviticus: { plain: 3 }, lev: { plain: 3 }, lv: { plain: 3 },
  numbers: { plain: 4 }, num: { plain: 4 }, nu: { plain: 4 }, nm: { plain: 4 },
  deuteronomy: { plain: 5 }, deut: { plain: 5 }, deu: { plain: 5 }, dt: { plain: 5 },
  joshua: { plain: 6 }, josh: { plain: 6 }, jos: { plain: 6 },
  judges: { plain: 7 }, judg: { plain: 7 }, jdg: { plain: 7 }, jg: { plain: 7 },
  ruth: { plain: 8 }, ru: { plain: 8 },
  samuel: { n: [9, 10] }, sam: { n: [9, 10] }, sa: { n: [9, 10] }, sm: { n: [9, 10] },
  kings: { n: [11, 12] }, kgs: { n: [11, 12] }, kin: { n: [11, 12] }, ki: { n: [11, 12] },
  chronicles: { n: [13, 14] }, chron: { n: [13, 14] }, chr: { n: [13, 14] },
  ezra: { plain: 15 }, ezr: { plain: 15 },
  nehemiah: { plain: 16 }, neh: { plain: 16 },
  esther: { plain: 17 }, esth: { plain: 17 }, est: { plain: 17 },

  // ── Wisdom ──
  job: { plain: 18 },
  psalms: { plain: 19 }, psalm: { plain: 19 }, psa: { plain: 19 }, pss: { plain: 19 }, ps: { plain: 19 },
  proverbs: { plain: 20 }, prov: { plain: 20 }, prv: { plain: 20 }, pr: { plain: 20 },
  ecclesiastes: { plain: 21 }, eccles: { plain: 21 }, eccl: { plain: 21 }, ecc: { plain: 21 }, ec: { plain: 21 }, qoheleth: { plain: 21 },
  'song of solomon': { plain: 22 }, 'song of songs': { plain: 22 }, canticles: { plain: 22 },
  song: { plain: 22 }, sos: { plain: 22 }, cant: { plain: 22 },

  // ── Prophets ──
  isaiah: { plain: 23 }, isa: { plain: 23 }, is: { plain: 23 },
  jeremiah: { plain: 24 }, jer: { plain: 24 }, je: { plain: 24 },
  lamentations: { plain: 25 }, lam: { plain: 25 }, la: { plain: 25 },
  ezekiel: { plain: 26 }, ezek: { plain: 26 }, eze: { plain: 26 }, ezk: { plain: 26 },
  daniel: { plain: 27 }, dan: { plain: 27 }, dn: { plain: 27 },
  hosea: { plain: 28 }, hos: { plain: 28 }, ho: { plain: 28 },
  joel: { plain: 29 }, joe: { plain: 29 },
  amos: { plain: 30 }, am: { plain: 30 },
  obadiah: { plain: 31 }, obad: { plain: 31 }, ob: { plain: 31 },
  jonah: { plain: 32 }, jon: { plain: 32 }, jnh: { plain: 32 },
  micah: { plain: 33 }, mic: { plain: 33 },
  nahum: { plain: 34 }, nah: { plain: 34 }, na: { plain: 34 },
  habakkuk: { plain: 35 }, hab: { plain: 35 },
  zephaniah: { plain: 36 }, zeph: { plain: 36 }, zep: { plain: 36 },
  haggai: { plain: 37 }, hag: { plain: 37 },
  zechariah: { plain: 38 }, zech: { plain: 38 }, zec: { plain: 38 },
  malachi: { plain: 39 }, mal: { plain: 39 },

  // ── Gospels / Acts ──
  matthew: { plain: 40 }, matt: { plain: 40 }, mat: { plain: 40 }, mt: { plain: 40 },
  mark: { plain: 41 }, mrk: { plain: 41 }, mk: { plain: 41 }, mr: { plain: 41 },
  luke: { plain: 42 }, luk: { plain: 42 }, lk: { plain: 42 }, lu: { plain: 42 },
  john: { plain: 43, n: [62, 63, 64] }, jhn: { plain: 43, n: [62, 63, 64] },
  joh: { plain: 43, n: [62, 63, 64] }, jn: { plain: 43, n: [62, 63, 64] },
  acts: { plain: 44 }, act: { plain: 44 }, ac: { plain: 44 },

  // ── Epistles ──
  romans: { plain: 45 }, rom: { plain: 45 }, ro: { plain: 45 }, rm: { plain: 45 },
  corinthians: { n: [46, 47] }, cor: { n: [46, 47] }, co: { n: [46, 47] },
  galatians: { plain: 48 }, gal: { plain: 48 }, ga: { plain: 48 },
  ephesians: { plain: 49 }, eph: { plain: 49 },
  philippians: { plain: 50 }, phil: { plain: 50 }, php: { plain: 50 }, phi: { plain: 50 },
  colossians: { plain: 51 }, col: { plain: 51 },
  thessalonians: { n: [52, 53] }, thess: { n: [52, 53] }, thes: { n: [52, 53] }, th: { n: [52, 53] },
  timothy: { n: [54, 55] }, tim: { n: [54, 55] }, ti: { n: [54, 55] },
  titus: { plain: 56 }, tit: { plain: 56 },
  philemon: { plain: 57 }, philem: { plain: 57 }, phlm: { plain: 57 }, phm: { plain: 57 },
  hebrews: { plain: 58 }, heb: { plain: 58 },
  james: { plain: 59 }, jas: { plain: 59 }, jam: { plain: 59 },
  peter: { n: [60, 61] }, pet: { n: [60, 61] }, pe: { n: [60, 61] }, pt: { n: [60, 61] },
  jude: { plain: 65 },
  revelation: { plain: 66 }, revelations: { plain: 66 }, rev: { plain: 66 }, re: { plain: 66 },
  apocalypse: { plain: 66 }, apoc: { plain: 66 },

  // Bare "Jud" is read as Judges by Logos and as Jude by some print styles.
  // Judges is the more common citation, so it wins — but confidence is capped
  // so Kairos never auto-fires it without a prediction-set match.
  jud: { plain: 7, ambiguous: true },
};

/** Books where a lone number means a verse, not a chapter ("Jude 5"). */
const SINGLE_CHAPTER = new Set([31, 57, 63, 64, 65]);

const BOOK_BY_NUM = new Map<number, BibleBook>(BOOKS.map(b => [b.num, b]));

/** Longest-first so "song of solomon" beats "song", "chronicles" beats "chr". */
const ALIAS_KEYS = Object.keys(BASE_ALIASES).sort((a, b) => b.length - a.length);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BOOK_PATTERN = ALIAS_KEYS.map(escapeRe).join('|').replace(/ /g, '\\s+');
const ORDINAL_PATTERN = '1st|2nd|3rd|first|second|third|iii|ii|i|1|2|3';

function ordinalToIndex(raw: string | undefined): number | null {
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/\./g, '');
  if (t === '1' || t === '1st' || t === 'first' || t === 'i') return 0;
  if (t === '2' || t === '2nd' || t === 'second' || t === 'ii') return 1;
  if (t === '3' || t === '3rd' || t === 'third' || t === 'iii') return 2;
  return null;
}

/** Resolve a book name (with optional ordinal) to a canon book. */
export function lookupBook(name: string): BibleBook | null {
  const m = new RegExp(
    `^\\s*(?:(${ORDINAL_PATTERN})\\.?\\s*)?(${BOOK_PATTERN})\\.?\\s*$`,
    'i',
  ).exec(name);
  if (!m) return null;
  const num = resolveBookNum(m[1], m[2]);
  return num ? BOOK_BY_NUM.get(num) ?? null : null;
}

function resolveBookNum(ordinal: string | undefined, base: string): number | null {
  const entry = BASE_ALIASES[base.toLowerCase().replace(/\s+/g, ' ').trim()];
  if (!entry) return null;
  const idx = ordinalToIndex(ordinal);
  if (idx !== null) return entry.n?.[idx] ?? null;
  // No ordinal given: only valid for books that exist unnumbered.
  return entry.plain ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The reference grammar
//
//   [ordinal] Book [chapter] [ : verse ] [ - endChapter : endVerse ]
//                                        [ - endVerse ]
//                                        [ , verse ]*
// ─────────────────────────────────────────────────────────────────────────────

const DASH = '[-–—]';

const REF_RE = new RegExp(
  `(?:(${ORDINAL_PATTERN})\\.?[\\s.]*)?` +           // 1  ordinal
  `(${BOOK_PATTERN})\\.?` +                          // 2  book base
  `\\s*` +
  `(\\d{1,3})` +                                     // 3  chapter (or verse, 1-ch books)
  `(?:\\s*[:.]\\s*(\\d{1,3}))?` +                    // 4  verse
  `(?:\\s*${DASH}\\s*(?:(\\d{1,3})\\s*[:.]\\s*)?(\\d{1,3}))?` + // 5 endChapter 6 endVerse
  `((?:\\s*,\\s*\\d{1,3}(?:\\s*${DASH}\\s*\\d{1,3})?)*)`,       // 7 comma chain
  'gi',
);

interface RawMatch {
  book: number; ambiguous: boolean;
  chapter: number; verse?: number;
  endChapter?: number; endVerse?: number;
  chain: string;
  hadColon: boolean; fullName: boolean;
  raw: string; start: number; end: number;
}

function readMatch(m: RegExpExecArray): RawMatch | null {
  const [, ordinal, base, chStr, vStr, endChStr, endVStr, chain] = m;
  const book = resolveBookNum(ordinal, base);
  if (!book) return null;

  const entry = BASE_ALIASES[base.toLowerCase().replace(/\s+/g, ' ').trim()];
  let chapter = Number(chStr);
  let verse = vStr ? Number(vStr) : undefined;
  let endChapter = endChStr ? Number(endChStr) : undefined;
  let endVerse = endVStr ? Number(endVStr) : undefined;

  // "Jude 5" is verse 5 of the only chapter, not chapter 5.
  if (SINGLE_CHAPTER.has(book) && verse === undefined) {
    verse = chapter;
    chapter = 1;
    if (endVerse !== undefined && endChapter === undefined) {
      // "Jude 3-5" → verses, and the dash never crossed a chapter.
    } else if (endChapter !== undefined) {
      endVerse = endChapter; endChapter = undefined;
    }
  }

  return {
    book,
    ambiguous: !!entry?.ambiguous,
    chapter, verse, endChapter, endVerse,
    chain: chain || '',
    hadColon: !!vStr,
    fullName: base.length > 4,
    raw: m[0], start: m.index, end: m.index + m[0].length,
  };
}

function withinBook(book: BibleBook, chapter: number, verse?: number): boolean {
  if (chapter < 1 || chapter > book.chapters) return false;
  // Verse counts per chapter aren't in BOOKS; 176 is the longest chapter in the
  // canon (Psalm 119), so that is the only bound we can assert cheaply.
  if (verse !== undefined && (verse < 1 || verse > 176)) return false;
  return true;
}

function build(raw: RawMatch, validate: boolean): ScriptureRef | null {
  const book = BOOK_BY_NUM.get(raw.book);
  if (!book) return null;
  if (validate && !withinBook(book, raw.chapter, raw.verse)) return null;

  const ref: ScriptureRef = { book: raw.book, bookName: book.name, chapter: raw.chapter };
  if (raw.verse !== undefined) ref.verse = raw.verse;

  if (raw.endChapter !== undefined && raw.endVerse !== undefined) {
    // Gen 1:1-2:3 — a real cross-chapter range.
    if (!validate || withinBook(book, raw.endChapter, raw.endVerse)) {
      ref.endChapter = raw.endChapter;
      ref.endVerse = raw.endVerse;
    }
  } else if (raw.endVerse !== undefined) {
    if (raw.verse !== undefined) {
      if (raw.endVerse > raw.verse) ref.endVerse = raw.endVerse;
    } else if (raw.endVerse > raw.chapter) {
      // "Matthew 5-7" — a chapter range.
      ref.endChapter = raw.endVerse;
    }
  }
  return ref;
}

function scoreOf(raw: RawMatch): number {
  let c = raw.hadColon ? 0.95 : 0.7;   // a bare chapter is a weaker signal
  if (raw.fullName) c += 0.05;
  if (raw.ambiguous) c = Math.min(c, 0.5);
  return Math.min(1, Number(c.toFixed(2)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a single reference. Accepts everything an operator would actually type:
 * "Romans 8:28", "rom 8.28-31", "1cor13", "I John 4:8", "Jude 5".
 * Returns null rather than guessing.
 */
export function parseRef(input: string, opts: ParseOptions = {}): ScriptureRef | null {
  const text = (input || '').trim();
  if (!text) return null;

  // Bare "v. 12" / "verses 3-5" against a ref already in scope.
  if (opts.context) {
    const bare = /^(?:vv?|verses?)\.?\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/i.exec(text);
    if (bare) {
      const ref: ScriptureRef = {
        book: opts.context.book,
        bookName: opts.context.bookName,
        chapter: opts.context.chapter,
        verse: Number(bare[1]),
      };
      if (bare[2] && Number(bare[2]) > ref.verse!) ref.endVerse = Number(bare[2]);
      return ref;
    }
  }

  const found = findRefs(text, opts);
  return found.length ? stripDetection(found[0]) : null;
}

/**
 * Scan prose, a sermon outline or a transcript chunk and return every reference
 * with its offsets — the input to both the live-text decoration pass and Kairos.
 * Comma chains expand into one ref each, since downstream every ref is a cue.
 */
export function findRefs(text: string, opts: ParseOptions = {}): DetectedRef[] {
  const validate = opts.validate !== false;
  const src = text || '';
  const out: DetectedRef[] = [];

  const minConfidence = opts.minConfidence ?? 0;

  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(src)) !== null) {
    const raw = readMatch(m);
    if (!raw) continue;
    // In prose, a lowercase book name with no explicit verse is far more likely
    // to be an ordinary word ("acts", "is", "am", "song") than a citation.
    if (opts.prose && !raw.hadColon && !/^[A-Z0-9]/.test(m[2])) continue;
    const base = build(raw, validate);
    if (!base) continue;

    const confidence = scoreOf(raw);
    if (confidence < minConfidence) continue;
    // The chain is part of the match, so the first ref's `raw` must not swallow
    // it — trim the visible span back to the head reference.
    const headEnd = raw.end - raw.chain.length;
    out.push({
      ...base,
      raw: src.slice(raw.start, headEnd),
      start: raw.start,
      end: headEnd,
      confidence,
    });

    if (raw.chain) {
      const chainStart = headEnd;
      const partRe = /(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/g;
      let p: RegExpExecArray | null;
      while ((p = partRe.exec(raw.chain)) !== null) {
        const v = Number(p[1]);
        const ev = p[2] ? Number(p[2]) : undefined;
        const bk = BOOK_BY_NUM.get(base.book)!;
        if (validate && !withinBook(bk, base.chapter, v)) continue;
        const chained: DetectedRef = {
          book: base.book, bookName: base.bookName, chapter: base.chapter,
          verse: v,
          raw: p[0],
          start: chainStart + p.index,
          end: chainStart + p.index + p[0].length,
          confidence,
        };
        if (ev !== undefined && ev > v) chained.endVerse = ev;
        out.push(chained);
      }
    }
  }
  return out;
}

function stripDetection(d: DetectedRef): ScriptureRef {
  const { raw, start, end, confidence, ...ref } = d;
  void raw; void start; void end; void confidence;
  return ref;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting + identity
// ─────────────────────────────────────────────────────────────────────────────

export type RefStyle = 'display' | 'compact' | 'osis';

const COMPACT_NAMES: Record<number, string> = {
  1: 'GEN', 2: 'EXO', 3: 'LEV', 4: 'NUM', 5: 'DEUT', 6: 'JOSH', 7: 'JUDG', 8: 'RUTH',
  9: '1 SAM', 10: '2 SAM', 11: '1 KGS', 12: '2 KGS', 13: '1 CHR', 14: '2 CHR',
  15: 'EZRA', 16: 'NEH', 17: 'EST', 18: 'JOB', 19: 'PS', 20: 'PROV', 21: 'ECCL',
  22: 'SONG', 23: 'ISA', 24: 'JER', 25: 'LAM', 26: 'EZEK', 27: 'DAN', 28: 'HOS',
  29: 'JOEL', 30: 'AMOS', 31: 'OBAD', 32: 'JONAH', 33: 'MIC', 34: 'NAH', 35: 'HAB',
  36: 'ZEPH', 37: 'HAG', 38: 'ZECH', 39: 'MAL', 40: 'MATT', 41: 'MARK', 42: 'LUKE',
  43: 'JOHN', 44: 'ACTS', 45: 'ROM', 46: '1 COR', 47: '2 COR', 48: 'GAL', 49: 'EPH',
  50: 'PHIL', 51: 'COL', 52: '1 THESS', 53: '2 THESS', 54: '1 TIM', 55: '2 TIM',
  56: 'TITUS', 57: 'PHLM', 58: 'HEB', 59: 'JAS', 60: '1 PET', 61: '2 PET',
  62: '1 JOHN', 63: '2 JOHN', 64: '3 JOHN', 65: 'JUDE', 66: 'REV',
};

/**
 * `display` → "Romans 8:28–31"   (en dash, for the reader and prose)
 * `compact` → "ROM 8:28–31"      (the platform-wide mono reference chip)
 * `osis`    → "45.8.28-45.8.31"  (stable key — see refId)
 */
export function formatRef(ref: ScriptureRef, style: RefStyle = 'display'): string {
  if (style === 'osis') return refId(ref);
  const name = style === 'compact'
    ? (COMPACT_NAMES[ref.book] ?? ref.bookName.toUpperCase())
    : ref.bookName;
  const dash = '–';

  if (ref.verse === undefined) {
    return ref.endChapter !== undefined
      ? `${name} ${ref.chapter}${dash}${ref.endChapter}`
      : `${name} ${ref.chapter}`;
  }
  if (ref.endChapter !== undefined && ref.endVerse !== undefined) {
    return `${name} ${ref.chapter}:${ref.verse}${dash}${ref.endChapter}:${ref.endVerse}`;
  }
  if (ref.endVerse !== undefined) {
    return `${name} ${ref.chapter}:${ref.verse}${dash}${ref.endVerse}`;
  }
  return `${name} ${ref.chapter}:${ref.verse}`;
}

/** Stable identity for Firestore docs, note keys, cue ids and markers. */
export function refId(ref: ScriptureRef): string {
  const head = `${ref.book}.${ref.chapter}${ref.verse !== undefined ? `.${ref.verse}` : ''}`;
  if (ref.endChapter !== undefined) {
    return `${head}-${ref.book}.${ref.endChapter}${ref.endVerse !== undefined ? `.${ref.endVerse}` : ''}`;
  }
  if (ref.endVerse !== undefined) return `${head}-${ref.book}.${ref.chapter}.${ref.endVerse}`;
  return head;
}

export function parseRefId(id: string): ScriptureRef | null {
  const [headStr, tailStr] = (id || '').split('-');
  const head = (headStr || '').split('.').map(Number);
  if (head.length < 2 || head.some(n => !Number.isFinite(n))) return null;
  const book = BOOK_BY_NUM.get(head[0]);
  if (!book) return null;

  const ref: ScriptureRef = { book: head[0], bookName: book.name, chapter: head[1] };
  if (head[2] !== undefined) ref.verse = head[2];

  if (tailStr) {
    const tail = tailStr.split('.').map(Number);
    if (tail[1] !== undefined && tail[1] !== ref.chapter) {
      ref.endChapter = tail[1];
      if (tail[2] !== undefined) ref.endVerse = tail[2];
    } else if (tail[2] !== undefined) {
      ref.endVerse = tail[2];
    }
  }
  return ref;
}

// ─────────────────────────────────────────────────────────────────────────────
// Range maths — used by highlighting, cue matching and the study graph
// ─────────────────────────────────────────────────────────────────────────────

export interface VerseCoord { book: number; chapter: number; verse: number; }

/** Every verse a ref covers, capped so a whole-book range can't blow up. */
export function expandRef(ref: ScriptureRef, cap = 200): VerseCoord[] {
  if (ref.verse === undefined) return [];
  const out: VerseCoord[] = [];
  const endCh = ref.endChapter ?? ref.chapter;
  const endV = ref.endVerse ?? ref.verse;

  for (let ch = ref.chapter; ch <= endCh && out.length < cap; ch++) {
    const from = ch === ref.chapter ? ref.verse : 1;
    const to = ch === endCh ? endV : 176;
    for (let v = from; v <= to && out.length < cap; v++) out.push({ book: ref.book, chapter: ch, verse: v });
  }
  return out;
}

export function isSameRef(a: ScriptureRef, b: ScriptureRef): boolean {
  return refId(a) === refId(b);
}

/** True when two refs touch any of the same verses — the basis of cue matching. */
export function refOverlaps(a: ScriptureRef, b: ScriptureRef): boolean {
  if (a.book !== b.book) return false;
  const span = (r: ScriptureRef) => {
    const startCh = r.chapter, endCh = r.endChapter ?? r.chapter;
    if (r.verse === undefined) return { lo: startCh * 1000, hi: endCh * 1000 + 999 };
    return { lo: startCh * 1000 + r.verse, hi: endCh * 1000 + (r.endVerse ?? r.verse) };
  };
  const x = span(a), y = span(b);
  return x.lo <= y.hi && y.lo <= x.hi;
}

export interface PredictionMatch { ref: ScriptureRef; index: number; score: number; }

/**
 * Kairos' hot path. Score a detected reference against the cue list the minister
 * prepared, so live detection is a short match rather than open recognition —
 * an overlapping prepared cue is worth far more than a cold parse.
 */
export function matchPrediction(
  detected: ScriptureRef,
  predictions: ScriptureRef[],
): PredictionMatch | null {
  let best: PredictionMatch | null = null;
  predictions.forEach((ref, index) => {
    let score = 0;
    if (isSameRef(ref, detected)) score = 1;
    else if (refOverlaps(ref, detected)) score = 0.85;
    else if (ref.book === detected.book && ref.chapter === detected.chapter) score = 0.6;
    else if (ref.book === detected.book) score = 0.25;
    if (score > 0 && (!best || score > best.score)) best = { ref, index, score };
  });
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spoken-form normalisation (for ASR chunks)
//
// "Romans chapter eight verse twenty-eight" → "Romans 8:28"
// "the eighth chapter of Romans"            → "Romans 8"
// "first john four eight"                   → "1 john 4:8"
// ─────────────────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50,
};

const NUM_WORD = new RegExp(
  `\\b(?:(?:${Object.keys(TENS).join('|')})(?:[\\s-](?:${Object.keys(UNITS).join('|')}))?` +
  `|(?:${Object.keys(UNITS).join('|')}))` +
  `(?:\\s+hundred(?:\\s+(?:and\\s+)?(?:(?:${Object.keys(TENS).join('|')})(?:[\\s-](?:${Object.keys(UNITS).join('|')}))?|(?:${Object.keys(UNITS).join('|')})))?)?\\b`,
  'gi',
);

function wordsToNumber(phrase: string): number | null {
  const parts = phrase.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(w => w && w !== 'and');
  let total = 0, current = 0, saw = false;
  for (const w of parts) {
    if (w === 'hundred') { current = (current || 1) * 100; saw = true; continue; }
    if (UNITS[w] !== undefined) { current += UNITS[w]; saw = true; continue; }
    if (TENS[w] !== undefined) { current += TENS[w]; saw = true; continue; }
    return null;
  }
  total += current;
  return saw ? total : null;
}

/**
 * Rewrite spoken scripture citations into the written form findRefs() reads.
 * Deliberately conservative: it only touches number words and the explicit
 * "chapter"/"verse" scaffolding, so ordinary prose survives untouched.
 */
export function normalizeSpoken(text: string): string {
  let s = ` ${text || ''} `;

  // "the eighth chapter of Romans" → "Romans 8"
  s = s.replace(
    new RegExp(`\\b(?:the\\s+)?(${Object.keys(ORDINAL_WORDS).join('|')})\\s+chapter\\s+of\\s+((?:${ORDINAL_PATTERN})?\\s*[a-z]+(?:\\s+of\\s+\\w+){0,2})`, 'gi'),
    (_all, ord: string, book: string) => ` ${book.trim()} ${ORDINAL_WORDS[ord.toLowerCase()]} `,
  );

  // Ordinal book prefixes must survive before generic number-word replacement.
  s = s.replace(/\b(first|second|third)\s+(john|corinthians|samuel|kings|chronicles|peter|timothy|thessalonians|cor|sam|kgs|chr|pet|tim|thess)\b/gi,
    (_all, ord: string, book: string) => ` ${ORDINAL_WORDS[ord.toLowerCase()]} ${book} `);

  // Number words → digits.
  s = s.replace(NUM_WORD, (match) => {
    const n = wordsToNumber(match);
    return n === null ? match : String(n);
  });

  // "chapter 8 verse 28" → "8:28"; "chapter 8" → "8"; "verse 28" after a ref → ":28"
  s = s.replace(/\bchapters?\s+(\d{1,3})\s*(?:,|and)?\s*(?:verses?|vs?)\.?\s*(\d{1,3})(?:\s*(?:through|to|thru)\s*(\d{1,3}))?/gi,
    (_all, c: string, v: string, e?: string) => ` ${c}:${v}${e ? `-${e}` : ''} `);
  s = s.replace(/\bchapters?\s+(\d{1,3})\b/gi, ' $1 ');
  s = s.replace(/\b(\d{1,3})\s*(?:,)?\s*(?:verses?|vs)\.?\s+(\d{1,3})\b/gi, ' $1:$2 ');

  // "John three sixteen" → "John 3:16" (two bare numbers straight after a book).
  s = s.replace(
    new RegExp(`\\b((?:${ORDINAL_PATTERN})?\\s*(?:${BOOK_PATTERN}))\\s+(\\d{1,3})\\s+(\\d{1,3})\\b`, 'gi'),
    (_all, book: string, c: string, v: string) => ` ${book.trim()} ${c}:${v} `,
  );

  // "through"/"to" as a range, only between numbers.
  s = s.replace(/\b(\d{1,3})\s+(?:through|thru|to)\s+(\d{1,3})\b/gi, '$1-$2');

  return s.replace(/\s+/g, ' ').trim();
}
