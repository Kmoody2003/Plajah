/**
 * Registry of tradition-layer notes (see traditionTypes.ts), loaded on demand so the data never
 * weighs on schools that have not turned the layer on.
 */
import type { TraditionNote } from './traditionTypes';

let cache: TraditionNote[] | null = null;

export async function loadTraditionNotes(): Promise<TraditionNote[]> {
  if (cache) return cache;
  const [a, b] = await Promise.all([
    import('./traditionNotesClassics').then(m => m.TRADITION_NOTES_CLASSICS).catch(() => [] as TraditionNote[]),
    import('./traditionNotesHistory').then(m => m.TRADITION_NOTES_HISTORY).catch(() => [] as TraditionNote[]),
  ]);
  cache = [...a, ...b];
  return cache;
}

export async function notesFor(courseId: string, lessonId: string): Promise<TraditionNote[]> {
  return (await loadTraditionNotes()).filter(n => n.courseId === courseId && n.lessonId === lessonId);
}
