import { BOOKS, type BibleVerse } from './bibleService';
import { CATHOLIC_BOOKS } from './bibleCanon';
export interface BundledChapter { book: number; chapter: number; verses: BibleVerse[]; }
export function parseBundledCatholic(raw: any): BundledChapter[] {
  if (raw?.abbreviation !== 'douayrheims' || raw?.books?.length !== 73) throw Error('Unexpected Catholic edition.');
  const records: BundledChapter[] = [];
  raw.books.forEach((book: any, index: number) => {
    const meta = CATHOLIC_BOOKS[index];
    if (book.nr !== meta.num || book.chapters?.length !== meta.chapters) throw Error('Incomplete Catholic book sequence.');
    book.chapters.forEach((chapter: any, index: number) => {
      if (chapter.chapter !== index + 1 || !chapter.verses?.length) throw Error('Incomplete Catholic chapter.');
      const verses = chapter.verses.map((v: any, index: number) => {
        if (v.verse !== index + 1 || typeof v.text !== 'string' || !v.text.trim()) throw Error('Incomplete Catholic verse sequence.');
        return { verse: v.verse, text: v.text.trim() };
      });
      records.push({book:meta.num,chapter:chapter.chapter,verses});
    });
  });
  if (records.reduce((n,c)=>n+c.verses.length,0)!==35808) throw Error('Incomplete Catholic text.');
  return records;
}
/** Reject a partial or differently attributed bundle before it enters the Bible cache. */
export function parseBundledKjv(raw: any): BundledChapter[] {
  if (raw?.abbreviation !== 'kjv' || !Array.isArray(raw.books) || raw.books.length !== 66) throw Error('Unexpected bundled Bible edition.');
  const records: BundledChapter[] = [], seen = new Set<number>();
  for (const book of raw.books) {
    const meta = BOOKS.find(b => b.num === book.nr);
    if (!meta || seen.has(book.nr) || !Array.isArray(book.chapters) || book.chapters.length !== meta.chapters) throw Error('The bundled Bible book sequence is incomplete.');
    seen.add(book.nr);
    for (const [i, chapter] of book.chapters.entries()) {
      if (chapter.chapter !== i + 1 || !Array.isArray(chapter.verses) || !chapter.verses.length) throw Error('The bundled Bible chapter sequence is incomplete.');
      const verses = chapter.verses.map((verse: any, v: number) => {
        if (verse.verse !== v + 1 || typeof verse.text !== 'string' || !verse.text.trim()) throw Error('The bundled Bible verse sequence is incomplete.');
        return { verse: verse.verse, text: verse.text.trim() };
      });
      records.push({ book: book.nr, chapter: chapter.chapter, verses });
    }
  }
  if (records.reduce((n, c) => n + c.verses.length, 0) !== 31102) throw Error('The bundled KJV does not have the expected complete verse count.');
  return records;
}
