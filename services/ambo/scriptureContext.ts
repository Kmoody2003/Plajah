// scriptureContext — the rest of the chapter, from Lectio, for typographic
// backgrounds. The verse on screen is what the room reads; the background is
// woven from its NEIGHBOURS in the same chapter (nearest first), so the art
// is scripture too, and never a duplicate of the words being read.
//
// Lectio's getChapter caches in memory and IndexedDB, so this is cheap and
// keeps working offline for any chapter already opened.

import { getChapter, DEFAULT_TRANSLATION } from '../scriptureText';
import { parseRef } from '../scriptureRef';

export interface ContextVerse { verse: number; text: string }
export interface ChapterContext { label: string; others: ContextVerse[] }

const memo = new Map<string, Promise<ChapterContext | null>>();

/** Lectio slugs are lowercase ids ('kjv', 'web', …); on-screen labels are often upper-case. */
function slugFor(translation?: string): string {
  const t = (translation || '').trim().toLowerCase();
  return t || DEFAULT_TRANSLATION;
}

export function chapterContextFor(reference: string | undefined, translation?: string): Promise<ChapterContext | null> {
  if (!reference) return Promise.resolve(null);
  const ref = parseRef(reference);
  if (!ref) return Promise.resolve(null);
  const slug = slugFor(translation);
  const key = `${slug}|${ref.book}|${ref.chapter}|${ref.verse ?? ''}|${ref.endVerse ?? ''}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const task = (async () => {
    let verses = await getChapter(slug, ref.book, ref.chapter).catch(() => []);
    if (!verses.length && slug !== DEFAULT_TRANSLATION) verses = await getChapter(DEFAULT_TRANSLATION, ref.book, ref.chapter).catch(() => []);
    if (!verses.length) return null;
    const lo = ref.verse ?? 0, hi = ref.endVerse ?? ref.verse ?? 0;
    const onScreen = (v: number) => ref.verse != null && v >= lo && v <= hi;
    const others = verses.filter(v => !onScreen(v.verse) && v.text?.trim());
    // Nearest neighbours first: the verses right after, then right before, outward.
    const centre = ref.verse ?? 1;
    others.sort((a, b) => Math.abs(a.verse - centre) - Math.abs(b.verse - centre) || a.verse - b.verse);
    return { label: `${ref.bookName} ${ref.chapter}`, others: others.map(v => ({ verse: v.verse, text: v.text.replace(/\s+/g, ' ').trim() })) };
  })();
  memo.set(key, task);
  if (memo.size > 64) memo.delete(memo.keys().next().value as string);
  return task;
}
