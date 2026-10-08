import { get, set } from 'idb-keyval';
import { BOOKS } from './bibleService';
import type { ScriptureRef } from './scriptureRef';
export type OriginalCorpus = 'oshb' | 'greek';
export const ORIGINAL_EDITIONS = {
  oshb: { revision: '3d15126fb1ef74867fc1434be1942e837932691f', title: 'Open Scriptures Hebrew Bible · WLC 4.20', source: 'https://github.com/openscriptures/morphhb', license: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb', rights: 'WLC text public domain; lemma and morphology CC BY 4.0. JSON format adapted; original text, word ids and variant readings retained.' },
  greek: { revision: 'a5cd340785e0315930af555a56e40adfff376592', title: 'Greek New Testament · derived UGNT 0.34', source: 'https://git.door43.org/unfoldingWord/el-x-koine_ugnt', license: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'The original work by unfoldingWord is available from https://www.unfoldingword.org/ugnt', rights: 'Derived data CC BY-SA 4.0. JSON format adapted; word forms, lemmas, parsing, source identifiers, punctuation and notes retained. This edition differs from the KJV’s Greek textual basis.' },
} as const;
export interface OriginalToken { text: string; id?: string; lemma?: string; morph?: string; reading?: string; strong?: string[]; sourceStrong?: string; punctuation?: boolean; punctuationBefore?: string; punctuationAfter?: string; }
export interface OriginalVerse { sourceRef: string; tokens: OriginalToken[]; variants?: { type: string; words: OriginalToken[] }[]; notes?: string[]; bracketed?: boolean; }
export interface VerseLink { locator: string; type: 'full' | 'partial' | 'same-number'; sourcePart?: string; targetPart?: string; basis: string; note?: string; }
export interface OriginalBook { schema: string; corpus: OriginalCorpus; book: number; verses: Record<string, OriginalVerse>; links: Record<string, VerseLink[]>; }
export type OriginalOccurrence = [book: number, chapter: number, verse: number, position: number];
export interface OriginalIndex { schema: string; corpus: OriginalCorpus; lemmas: Record<string, OriginalOccurrence[]>; morphology: Record<string, OriginalOccurrence[]>; }
const loaded = new Map<string, Promise<unknown>>();
async function load<T>(corpus: OriginalCorpus, file: string, validate: (raw: any) => boolean): Promise<T> {
  const key = `pj.original.v1.${corpus}.${ORIGINAL_EDITIONS[corpus].revision}.${file}`;
  let task = loaded.get(key);
  if (!task) {
    task = (async () => {
      try { const cached = await get(key); if (cached && validate(cached)) return cached as T; } catch { /* continue in session */ }
      const response = await fetch(`/sacred/${corpus}/${file}?revision=${ORIGINAL_EDITIONS[corpus].revision}`, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error('The original-language source could not be loaded.');
      const raw = await response.json(); if (!validate(raw)) throw Error('Unexpected original-language source edition.');
      try { await set(key, raw); } catch { /* memory remains available for this session */ }
      return raw as T;
    })().catch(error => { loaded.delete(key); throw error; });
    loaded.set(key, task);
  }
  return task as Promise<T>;
}
export function originalCorpusForBook(book: number): OriginalCorpus { return book <= 39 ? 'oshb' : 'greek'; }
export function loadOriginalBook(book: number): Promise<OriginalBook> {
  if (!BOOKS.some(b => b.num === book)) return Promise.reject(Error('Unsupported original-language book.'));
  const corpus = originalCorpusForBook(book);
  return load(corpus, `book-${book}.json`, raw => raw?.schema === 'plajah-original-book-v1' && raw.corpus === corpus && raw.book === book && raw.verses && raw.links);
}
export function loadOriginalIndex(corpus: OriginalCorpus): Promise<OriginalIndex> {
  return load(corpus, 'search-index.json', raw => raw?.schema === 'plajah-original-index-v1' && raw.corpus === corpus && raw.lemmas && raw.morphology);
}
export function linkedOriginalVerses(book: OriginalBook, ref: ScriptureRef): { link: VerseLink; verse: OriginalVerse }[] {
  if (book.book !== ref.book) return [];
  return (book.links[`${ref.chapter}:${ref.verse ?? 1}`] || []).flatMap(link => book.verses[link.locator] ? [{ link, verse: book.verses[link.locator] }] : []);
}
export function originalLemmaKeys(token: OriginalToken, corpus: OriginalCorpus): string[] {
  return [...new Set(corpus === 'oshb' ? (token.lemma || '').split('/').filter(p => /^\d+(?:\s+[a-z])?$/.test(p)) : token.lemma ? [token.lemma] : [])];
}
export function searchOriginalIndex(data: OriginalIndex, { lemma = '', morph = '', book = 0 }: { lemma?: string; morph?: string; book?: number }): OriginalOccurrence[] {
  if (!lemma && !morph) return [];
  const lemmaRows = Object.hasOwn(data.lemmas, lemma) && Array.isArray(data.lemmas[lemma]) ? data.lemmas[lemma] : [];
  const morphRows = Object.hasOwn(data.morphology, morph) && Array.isArray(data.morphology[morph]) ? data.morphology[morph] : [];
  let candidates = lemma ? lemmaRows : morphRows;
  if (lemma && morph) { const matches = new Set(morphRows.map(row => row.join('/'))); candidates = candidates.filter(row => matches.has(row.join('/'))); }
  return candidates.filter(row => !book || row[0] === book);
}
export function originalText(verse: OriginalVerse): string {
  return verse.tokens.map(t => (t.punctuationBefore || '') + t.text.replaceAll('/', '') + (t.punctuationAfter || '')).join(' ');
}
/** Only full/same-number one-to-one Hebrew links can navigate to a KJV verse. */
export function originalOccurrenceNavigation(data: OriginalBook, row: OriginalOccurrence): ScriptureRef | null {
  if (row[0] !== data.book) return null;
  const locator = `${row[1]}:${row[2]}`;
  const keys = Object.entries(data.links).filter(([, links]) => links.length === 1 && links[0].locator === locator && links[0].type !== 'partial').map(([key]) => key);
  if (keys.length !== 1) return null;
  const [chapter, verse] = keys[0].split(':').map(Number);
  return { book: row[0], bookName: BOOKS.find(b => b.num === row[0])!.name, chapter, verse };
}
