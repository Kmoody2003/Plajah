// gutenbergImport — bring a public-domain Project Gutenberg text onto Plajah so it reads
// natively in the Lorea reader.
//
// Simpler than the OpenStax path in one important way: Gutenberg texts already carry their own
// "CHAPTER I" headings, in exactly the shape BookReader's chapter splitter looks for. So this
// module PRESERVES the source's structure rather than generating one — and must NOT disguise
// heading-like lines the way openstaxImport does, because here those lines are the real
// chapters. Getting that backwards would flatten every book into one chapter.
//
// What does need doing: stripping Gutenberg's licence boilerplate. The header/footer run to
// several hundred lines of legal text; left in, every book opens on the licence instead of the
// story, and the trailing matter pollutes the last chapter.

import type { License } from './oerLicenseGate';

export interface GutenbergBook {
  id: number;
  title: string;
  authors: string[];
  textUrl: string;
  subjects: string[];
}

/** Gutendex exposes several plain-text encodings and not every book has every one. */
const TEXT_KEYS = [
  'text/plain; charset=utf-8',
  'text/plain; charset=us-ascii',
  'text/plain; charset=iso-8859-1',
  'text/plain',
];

export async function fetchGutenbergMeta(id: number): Promise<GutenbergBook> {
  const res = await fetch(`https://gutendex.com/books/${id}`);
  if (!res.ok) throw new Error(`Gutendex returned ${res.status} for id ${id}`);
  const b = await res.json() as any;

  const formats: Record<string, string> = b.formats ?? {};
  let textUrl = TEXT_KEYS.map(k => formats[k]).find(Boolean);
  // Some records only expose the text under a key with an unexpected suffix; fall back to any
  // text/plain variant that isn't a zip, rather than failing a book that plainly has one.
  if (!textUrl) {
    textUrl = Object.entries(formats)
      .find(([k, v]) => k.startsWith('text/plain') && !String(v).endsWith('.zip'))?.[1];
  }
  if (!textUrl) throw new Error(`No plain-text format for Gutenberg #${id} ("${b.title}")`);

  return {
    id,
    title: String(b.title ?? '').replace(/\s+/g, ' ').trim(),
    authors: (b.authors ?? []).map((a: any) => String(a.name)),
    textUrl,
    subjects: b.subjects ?? [],
  };
}

export async function fetchGutenbergText(book: GutenbergBook): Promise<string> {
  const res = await fetch(book.textUrl, {
    headers: { 'User-Agent': 'Plajah-Academia/1.0 (OER ingest)' },
  });
  if (!res.ok) throw new Error(`Text fetch ${res.status} for #${book.id}`);
  return res.text();
}

/**
 * Remove Gutenberg's licence boilerplate, keeping only the work itself.
 *
 * The modern marker pair is `*** START OF THE PROJECT GUTENBERG EBOOK … ***` / `*** END OF …`.
 * Older files use `*END*THE SMALL PRINT!` and a bare "End of Project Gutenberg's …" line, so
 * both are handled. If no marker is found the text is returned untouched — silently truncating
 * a book because a pattern didn't match would be far worse than leaving a licence in.
 */
export function stripGutenbergBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n');

  const startPatterns = [
    /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*\s*$/im,
    /^\*END\*THE SMALL PRINT![^\n]*$/im,
  ];
  for (const re of startPatterns) {
    const m = re.exec(text);
    if (m) { text = text.slice(m.index + m[0].length); break; }
  }

  const endPatterns = [
    /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*\s*$/im,
    /^End of (?:the )?Project Gutenberg('s)?[^\n]*$/im,
  ];
  for (const re of endPatterns) {
    const m = re.exec(text);
    if (m) { text = text.slice(0, m.index); break; }
  }

  // Gutenberg often repeats a transcriber's note and the title block after the start marker;
  // that's part of the work's front matter, so it stays. Only trim surrounding blank space.
  return text.replace(/\n{4,}/g, '\n\n\n').trim();
}

/**
 * Prepend the attribution block. Public domain carries no legal obligation to attribute, but
 * a student should always be able to see where a text came from, and it costs three lines.
 */
export function buildGutenbergText(book: GutenbergBook, body: string, license: License = 'PD'): string {
  const byline = book.authors.length ? ` — ${book.authors.join(', ')}` : '';
  return [
    `${book.title}${byline}`,
    '',
    `Source: Project Gutenberg — https://www.gutenberg.org/ebooks/${book.id}`,
    license === 'PD'
      ? 'Public domain. No restrictions on use.'
      : `Licence: ${license}`,
    'Hosted on Plajah Academia at no cost. Plajah does not charge for textbooks.',
    '',
    '',
    body,
    '',
  ].join('\n');
}

/**
 * Give lesson-structured books a table of contents.
 *
 * The McGuffey Readers divide into "LESSON I.", "LESSON II." — 63 of them in the First Reader —
 * but BookReader's chapter matcher knows CHAPTER/PART/BOOK/SECTION and not LESSON, so the whole
 * book arrives as one undivided block. Rather than rewrite the author's headings, this INSERTS a
 * recognised one above each: the original "LESSON I." still appears in the text, and the reader
 * gains a real contents list.
 *
 * Only worth calling when a book has no chapters of its own — novels already have them, and
 * adding to those would produce a duplicated, wrong contents list.
 */
export function addLessonChapters(text: string): { text: string; added: number } {
  return addSyntheticChapters(text);
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function romanToInt(s: string): number {
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i].toUpperCase()] ?? 0;
    const next = ROMAN[s[i + 1]?.toUpperCase()] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}
/** Little Women numbers its chapters in words — "CHAPTER ONE PLAYING PILGRIMS" — so 47
 *  chapters were being read as 2. Bounded list: books numbering past forty in words are
 *  vanishingly rare, and an open-ended word parser would invite false matches. */
const WORD_NUMBERS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
  ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15, SIXTEEN: 16,
  SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19, TWENTY: 20,
  'TWENTY-ONE': 21, 'TWENTY-TWO': 22, 'TWENTY-THREE': 23, 'TWENTY-FOUR': 24, 'TWENTY-FIVE': 25,
  'TWENTY-SIX': 26, 'TWENTY-SEVEN': 27, 'TWENTY-EIGHT': 28, 'TWENTY-NINE': 29, THIRTY: 30,
  'THIRTY-ONE': 31, 'THIRTY-TWO': 32, 'THIRTY-THREE': 33, 'THIRTY-FOUR': 34, 'THIRTY-FIVE': 35,
  'THIRTY-SIX': 36, 'THIRTY-SEVEN': 37, 'THIRTY-EIGHT': 38, 'THIRTY-NINE': 39, FORTY: 40,
  'FORTY-ONE': 41, 'FORTY-TWO': 42, 'FORTY-THREE': 43, 'FORTY-FOUR': 44, 'FORTY-FIVE': 45,
  'FORTY-SIX': 46, 'FORTY-SEVEN': 47, 'FORTY-EIGHT': 48, 'FORTY-NINE': 49, FIFTY: 50,
};

const toNumber = (token: string): number => {
  if (/^\d+$/.test(token)) return Number(token);
  const word = WORD_NUMBERS[token.toUpperCase()];
  if (word) return word;
  return /^[IVXLCDM]+$/i.test(token) ? romanToInt(token) : 0;
};

/**
 * The heading styles Gutenberg books actually use. Checked against the shelf rather than
 * guessed: "CHAPTER I" (often INDENTED, which alone defeats the reader's `^` anchor),
 * "Stave I: Marley's Ghost", "XVI. NARRATIVE CONTINUED", "I Introduction", and bare "I.".
 */
const HEADING_PATTERNS: RegExp[] = [
  // A keyword the reader may or may not know — indentation is the common failure here. The
  // number may be a numeral, a roman numeral, or a word ("CHAPTER ONE PLAYING PILGRIMS").
  /^[ \t]*(?:CHAPTER|Chapter|STAVE|Stave|LESSON|Lesson|LETTER|Letter|CANTO|Canto|BOOK|Book|PART|Part|ACT|Act)\s+([A-Za-z-]+|\d+)\b[.: \t]*(.*)$/,
  // A bare numeral, alone or followed by a Capitalised title. The capital matters: it is what
  // separates "I Introduction" (a heading) from "I had gone from me" (the pronoun).
  /^[ \t]*([IVXLCDM]+|\d+)\.?(?:[ \t]+([A-Z][^\n]{0,70}))?[ \t]*$/,
];

/**
 * Give a book a table of contents when the reader can't find one.
 *
 * BookReader rebuilds chapters by matching `CHAPTER N` at the very start of a line. Ten of the
 * 33 books on the shelf defeated that: some indent the heading, some use words it doesn't know
 * ("Stave"), and some number chapters with a bare roman numeral. All of them arrived as one
 * undivided block.
 *
 * Rather than rewrite the author's headings, this INSERTS a recognised one above each, so the
 * original line still appears in the text. A candidate style is only accepted if it occurs at
 * least three times AND its numbers ascend — which is what stops a stray "I." in dialogue, or a
 * date like "1845", from shredding a book into hundreds of false chapters.
 */
/** Longest strictly-increasing subsequence by `value`, preserving document order. */
function longestAscending<T extends { value: number }>(items: T[]): T[] {
  if (!items.length) return [];
  const best = new Array(items.length).fill(1);
  const prev = new Array(items.length).fill(-1);
  let endIndex = 0;

  for (let i = 1; i < items.length; i++) {
    for (let j = 0; j < i; j++) {
      if (items[j].value < items[i].value && best[j] + 1 > best[i]) {
        best[i] = best[j] + 1;
        prev[i] = j;
      }
    }
    if (best[i] > best[endIndex]) endIndex = i;
  }

  const chain: T[] = [];
  for (let i = endIndex; i !== -1; i = prev[i]) chain.push(items[i]);
  return chain.reverse();
}

export function addSyntheticChapters(text: string): { text: string; added: number } {
  const lines = text.split('\n');

  let best: { hits: Array<{ index: number; label: string }>; } | null = null;

  for (const pattern of HEADING_PATTERNS) {
    const hits: Array<{ index: number; label: string; value: number }> = [];
    lines.forEach((line, index) => {
      const m = pattern.exec(line);
      if (!m) return;
      const value = toNumber(m[1]);
      if (!value) return;
      hits.push({ index, label: line.trim(), value });
    });

    // Keep the LONGEST ascending subsequence, not merely the first ascending run. The
    // difference matters: The Scarlet Letter prints the year "1878" before chapter "I.", and a
    // greedy run anchored on that first number rejects every real heading after it, leaving the
    // book with no contents at all.
    const ascending = longestAscending(hits);

    if (ascending.length >= 3 && (!best || ascending.length > best.hits.length)) {
      best = { hits: ascending };
    }
  }

  if (!best) return { text, added: 0 };

  const insertAt = new Map(best.hits.map((h, i) => [h.index, `Section ${i + 1} — ${h.label}`]));
  const out: string[] = [];
  lines.forEach((line, i) => {
    const heading = insertAt.get(i);
    if (heading) { out.push(heading); out.push(''); }
    out.push(line);
  });

  return { text: out.join('\n'), added: best.hits.length };
}

/** Count the chapters BookReader will find, so an ingest can report what a reader will see. */
export function countChapters(text: string): number {
  const RE = /^((?:CHAPTER|Chapter|PART|Part|BOOK|Book|VOLUME|Volume|ACT|Act|SECTION|Section)\s+(?:\d+|[IVXLCDM]+)(?:[.:—\s][^\n]*)?)\s*$/mg;
  return (text.match(RE) ?? []).length;
}
