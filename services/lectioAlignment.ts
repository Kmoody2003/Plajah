import { BOOKS } from './bibleService';
import type { ScriptureRef } from './scriptureRef';
export interface AlignedSegment { text: string; strong?: string[]; lemma?: string; morph?: string; sourcePositions?: string; }
export interface AlignmentBook { schema: string; book: number; verses: Record<string, AlignedSegment[]>; }
export type StrongOccurrence = [book: number, chapter: number, verse: number, count: number];
export interface StrongIndex { schema: string; index: Record<string, StrongOccurrence[]>; }
const books = new Map<number, Promise<AlignmentBook>>();
let index: Promise<StrongIndex> | undefined;
export function canonicalStrong(value: string): string | null {
  const match = value.match(/^([GH])0*(\d+)$/i);
  return match && Number(match[2]) > 0 ? `${match[1].toUpperCase()}${Number(match[2])}` : null;
}
async function asset<T>(file: string): Promise<T> {
  const response = await fetch(`/sacred/alignment/${file}`);
  if (!response.ok) throw Error('The bundled word alignment could not be loaded.');
  return response.json();
}
export function loadAlignmentBook(book: number): Promise<AlignmentBook> {
  if (!BOOKS.some(b => b.num === book)) return Promise.reject(Error('Unsupported Bible book.'));
  let task = books.get(book);
  if (!task) {
    task = asset<AlignmentBook>(`kjv-${book}.json`).then(data => {
      if (data.schema !== 'plajah-kjv-alignment-v1' || data.book !== book || !data.verses) throw Error('Unexpected alignment edition.');
      return data;
    }).catch(error => { books.delete(book); throw error; });
    books.set(book, task);
  }
  return task;
}
export function loadStrongIndex(): Promise<StrongIndex> {
  index ??= asset<StrongIndex>('kjv-strong-index.json').then(data => {
    if (data.schema !== 'plajah-kjv-strong-index-v1' || !data.index) throw Error('Unexpected Strong concordance edition.');
    return data;
  }).catch(error => { index = undefined; throw error; });
  return index;
}
export function findStrongOccurrences(data: StrongIndex, id: string, book = 0): StrongOccurrence[] {
  const key = canonicalStrong(id);
  return key ? (data.index[key] || []).filter(row => !book || row[0] === book) : [];
}
export function occurrenceRef(row: StrongOccurrence): ScriptureRef {
  return { book: row[0], bookName: BOOKS.find(b => b.num === row[0])!.name, chapter: row[1], verse: row[2] };
}
export function greekSourceForms(segment: AlignedSegment): string[] {
  return [...(segment.lemma || '').matchAll(/lemma\.TR:([^\s]+)/g)].map(match => match[1]);
}
