// scriptureNext — which verse comes after the one on screen.
//
// Used by "auto-cue next": when a scripture is taken to Program, the verse that
// follows goes straight into Preview so the operator is one tap from it.
// A range ("Psalm 23:1-3") continues after its LAST verse; the end of a
// chapter rolls into verse 1 of the next chapter, the end of a book into the
// next book. Text comes from Lectio (cached in memory + IndexedDB, so a
// chapter already opened keeps working offline).
import { getChapter, DEFAULT_TRANSLATION } from '../scriptureText';
import { parseRef } from '../scriptureRef';
import { BOOKS } from '../bibleService';

export interface NextCue { refId: string; reference: string; translation: string; lines: string[] }
export interface ChapterVerse { verse: number; text: string }
export type ChapterLoader = (translationSlug: string, book: number, chapter: number) => Promise<ChapterVerse[]>;

const defaultLoader: ChapterLoader = async (slug, book, chapter) => {
  let verses: ChapterVerse[] = await getChapter(slug, book, chapter).catch(() => []);
  if (!verses.length && slug !== DEFAULT_TRANSLATION) verses = await getChapter(DEFAULT_TRANSLATION, book, chapter).catch(() => []);
  return verses;
};

/** Where "next" lands, given what the current chapter holds. Pure — unit tested. */
export function nextCoord(
  book: number, chapter: number, lastVerse: number,
  versesInChapter: number[], chaptersInBook: number, totalBooks = 66,
): { book: number; chapter: number; verse: number | null } | null {
  const after = versesInChapter.filter(v => v > lastVerse).sort((a, b) => a - b)[0];
  if (after != null) return { book, chapter, verse: after };
  if (chapter < chaptersInBook) return { book, chapter: chapter + 1, verse: null };
  if (book < totalBooks) return { book: book + 1, chapter: 1, verse: null };
  return null;
}

/** The cue for the verse after `cue`, or null at the end of the Bible / unreadable references. */
export async function nextVerseCue(
  cue: { reference: string; translation?: string },
  load: ChapterLoader = defaultLoader,
): Promise<NextCue | null> {
  const ref = parseRef(cue.reference || '');
  if (!ref || ref.verse == null) return null;            // whole chapters have no "next verse"
  const slug = (cue.translation || '').trim().toLowerCase() || DEFAULT_TRANSLATION;
  const book = BOOKS.find(b => b.num === ref.book);
  if (!book) return null;

  const ch = ref.endChapter ?? ref.chapter;
  const last = ref.endVerse ?? ref.verse;
  let verses = await load(slug, ref.book, ch);
  if (!verses.length) return null;
  const hit = nextCoord(ref.book, ch, last, verses.map(v => v.verse), book.chapters);
  if (!hit) return null;

  let bookId = hit.book, chapter = hit.chapter, verse = hit.verse;
  if (verse == null) {
    // Rolled over: first verse of the next chapter (or book).
    const nextVerses = await load(slug, bookId, chapter);
    if (!nextVerses.length) return null;
    verses = nextVerses;
    verse = Math.min(...nextVerses.map(v => v.verse));
  }
  const text = verses.find(v => v.verse === verse)?.text?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const name = BOOKS.find(b => b.num === bookId)?.name || ref.bookName;
  return {
    refId: `${name.toLowerCase()}.${chapter}.${verse}`,
    reference: `${name} ${chapter}:${verse}`,
    translation: cue.translation || slug.toUpperCase(),
    lines: [text],
  };
}
