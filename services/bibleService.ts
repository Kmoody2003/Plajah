// bibleService — free, open Scripture text for the Lorea Sacred Library.
// Source: getbible.net v2 (public, no key). Parallel translations are fetched
// per chapter and aligned by verse number for the side-by-side reader.

const GETBIBLE = 'https://api.getbible.net/v2';

export interface BibleTranslation {
  slug: string;     // getbible slug
  label: string;    // UI label
  lang: string;     // language tag for direction/font
  rtl?: boolean;
  testament?: 'OT' | 'NT' | 'BOTH';
}

// The translations the reader offers. Greek/Hebrew are testament-specific.
export const TRANSLATIONS: BibleTranslation[] = [
  { slug: 'kjv',            label: 'King James',        lang: 'en', testament: 'BOTH' },
  { slug: 'vulgate',        label: 'Latin Vulgate',     lang: 'la', testament: 'BOTH' },
  { slug: 'textusreceptus', label: 'Greek (NT · TR)',   lang: 'el', testament: 'NT' },
  { slug: 'lxx',            label: 'Greek (OT · LXX)',  lang: 'el', testament: 'OT' },
  { slug: 'codex',          label: 'Hebrew (WLC)',      lang: 'he', rtl: true, testament: 'OT' },
];

export interface BibleBook { num: number; name: string; chapters: number; testament: 'OT' | 'NT'; }

// Standard 66-book canon with chapter counts (getbible book numbers 1–66).
export const BOOKS: BibleBook[] = [
  { num: 1, name: 'Genesis', chapters: 50, testament: 'OT' }, { num: 2, name: 'Exodus', chapters: 40, testament: 'OT' },
  { num: 3, name: 'Leviticus', chapters: 27, testament: 'OT' }, { num: 4, name: 'Numbers', chapters: 36, testament: 'OT' },
  { num: 5, name: 'Deuteronomy', chapters: 34, testament: 'OT' }, { num: 6, name: 'Joshua', chapters: 24, testament: 'OT' },
  { num: 7, name: 'Judges', chapters: 21, testament: 'OT' }, { num: 8, name: 'Ruth', chapters: 4, testament: 'OT' },
  { num: 9, name: '1 Samuel', chapters: 31, testament: 'OT' }, { num: 10, name: '2 Samuel', chapters: 24, testament: 'OT' },
  { num: 11, name: '1 Kings', chapters: 22, testament: 'OT' }, { num: 12, name: '2 Kings', chapters: 25, testament: 'OT' },
  { num: 13, name: '1 Chronicles', chapters: 29, testament: 'OT' }, { num: 14, name: '2 Chronicles', chapters: 36, testament: 'OT' },
  { num: 15, name: 'Ezra', chapters: 10, testament: 'OT' }, { num: 16, name: 'Nehemiah', chapters: 13, testament: 'OT' },
  { num: 17, name: 'Esther', chapters: 10, testament: 'OT' }, { num: 18, name: 'Job', chapters: 42, testament: 'OT' },
  { num: 19, name: 'Psalms', chapters: 150, testament: 'OT' }, { num: 20, name: 'Proverbs', chapters: 31, testament: 'OT' },
  { num: 21, name: 'Ecclesiastes', chapters: 12, testament: 'OT' }, { num: 22, name: 'Song of Solomon', chapters: 8, testament: 'OT' },
  { num: 23, name: 'Isaiah', chapters: 66, testament: 'OT' }, { num: 24, name: 'Jeremiah', chapters: 52, testament: 'OT' },
  { num: 25, name: 'Lamentations', chapters: 5, testament: 'OT' }, { num: 26, name: 'Ezekiel', chapters: 48, testament: 'OT' },
  { num: 27, name: 'Daniel', chapters: 12, testament: 'OT' }, { num: 28, name: 'Hosea', chapters: 14, testament: 'OT' },
  { num: 29, name: 'Joel', chapters: 3, testament: 'OT' }, { num: 30, name: 'Amos', chapters: 9, testament: 'OT' },
  { num: 31, name: 'Obadiah', chapters: 1, testament: 'OT' }, { num: 32, name: 'Jonah', chapters: 4, testament: 'OT' },
  { num: 33, name: 'Micah', chapters: 7, testament: 'OT' }, { num: 34, name: 'Nahum', chapters: 3, testament: 'OT' },
  { num: 35, name: 'Habakkuk', chapters: 3, testament: 'OT' }, { num: 36, name: 'Zephaniah', chapters: 3, testament: 'OT' },
  { num: 37, name: 'Haggai', chapters: 2, testament: 'OT' }, { num: 38, name: 'Zechariah', chapters: 14, testament: 'OT' },
  { num: 39, name: 'Malachi', chapters: 4, testament: 'OT' },
  { num: 40, name: 'Matthew', chapters: 28, testament: 'NT' }, { num: 41, name: 'Mark', chapters: 16, testament: 'NT' },
  { num: 42, name: 'Luke', chapters: 24, testament: 'NT' }, { num: 43, name: 'John', chapters: 21, testament: 'NT' },
  { num: 44, name: 'Acts', chapters: 28, testament: 'NT' }, { num: 45, name: 'Romans', chapters: 16, testament: 'NT' },
  { num: 46, name: '1 Corinthians', chapters: 16, testament: 'NT' }, { num: 47, name: '2 Corinthians', chapters: 13, testament: 'NT' },
  { num: 48, name: 'Galatians', chapters: 6, testament: 'NT' }, { num: 49, name: 'Ephesians', chapters: 6, testament: 'NT' },
  { num: 50, name: 'Philippians', chapters: 4, testament: 'NT' }, { num: 51, name: 'Colossians', chapters: 4, testament: 'NT' },
  { num: 52, name: '1 Thessalonians', chapters: 5, testament: 'NT' }, { num: 53, name: '2 Thessalonians', chapters: 3, testament: 'NT' },
  { num: 54, name: '1 Timothy', chapters: 6, testament: 'NT' }, { num: 55, name: '2 Timothy', chapters: 4, testament: 'NT' },
  { num: 56, name: 'Titus', chapters: 3, testament: 'NT' }, { num: 57, name: 'Philemon', chapters: 1, testament: 'NT' },
  { num: 58, name: 'Hebrews', chapters: 13, testament: 'NT' }, { num: 59, name: 'James', chapters: 5, testament: 'NT' },
  { num: 60, name: '1 Peter', chapters: 5, testament: 'NT' }, { num: 61, name: '2 Peter', chapters: 3, testament: 'NT' },
  { num: 62, name: '1 John', chapters: 5, testament: 'NT' }, { num: 63, name: '2 John', chapters: 1, testament: 'NT' },
  { num: 64, name: '3 John', chapters: 1, testament: 'NT' }, { num: 65, name: 'Jude', chapters: 1, testament: 'NT' },
  { num: 66, name: 'Revelation', chapters: 22, testament: 'NT' },
];

export interface BibleVerse { verse: number; text: string; }

const cache = new Map<string, BibleVerse[]>();

/** Fetch one chapter in one translation, verses keyed by number. */
export async function fetchChapter(slug: string, bookNum: number, chapter: number): Promise<BibleVerse[]> {
  const key = `${slug}/${bookNum}/${chapter}`;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const res = await fetch(`${GETBIBLE}/${slug}/${bookNum}/${chapter}.json`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const raw = data?.verses ?? [];
    const verses: BibleVerse[] = (Array.isArray(raw) ? raw : Object.values(raw))
      .map((v: any) => ({ verse: Number(v.verse), text: (v.text || '').trim() }))
      .filter((v: BibleVerse) => v.verse);
    cache.set(key, verses);
    return verses;
  } catch {
    return [];
  }
}

/** Fetch a chapter across several translations at once → slug → verses. */
export async function fetchParallel(bookNum: number, chapter: number, slugs: string[]): Promise<Record<string, BibleVerse[]>> {
  const results = await Promise.all(slugs.map(s => fetchChapter(s, bookNum, chapter).then(v => [s, v] as const)));
  return Object.fromEntries(results);
}

export function translationsForBook(testament: 'OT' | 'NT'): BibleTranslation[] {
  return TRANSLATIONS.filter(t => t.testament === 'BOTH' || t.testament === testament);
}
