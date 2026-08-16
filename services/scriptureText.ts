// scriptureText — turns a parsed ScriptureRef into actual verse text.
//
// bibleService caches chapters in a plain Map, which dies on reload. The
// platform-wide verse hover card needs to be instant on the second look and
// the reader needs to survive a church wifi drop, so chapters are written
// through to IndexedDB here. Chapter JSON is a few KB — idb-keyval is the
// right tool; OPFS is for the binaries in fabula/pixels.

import { get, keys, set } from 'idb-keyval';
import { fetchChapter, BOOKS, TRANSLATIONS, type BibleVerse } from './bibleService';
import { formatRef, type ScriptureRef } from './scriptureRef';

const KEY_PREFIX = 'pj.bible.v1.';
/** Translations are fixed texts; the only reason to expire is a bad fetch. */
const TTL_MS = 1000 * 60 * 60 * 24 * 180;

export const DEFAULT_TRANSLATION = 'kjv';

interface CachedChapter { verses: BibleVerse[]; at: number; }

const memory = new Map<string, BibleVerse[]>();
const inflight = new Map<string, Promise<BibleVerse[]>>();

const keyOf = (slug: string, book: number, chapter: number) => `${slug}/${book}/${chapter}`;

/**
 * A chapter, from memory → IndexedDB → network, writing through on the way
 * back. Single-flighted, so a paragraph containing six references to Romans 8
 * makes one request.
 */
export async function getChapter(slug: string, book: number, chapter: number): Promise<BibleVerse[]> {
  const key = keyOf(slug, book, chapter);

  const hot = memory.get(key);
  if (hot) return hot;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const stored = await get<CachedChapter>(KEY_PREFIX + key);
      if (stored?.verses?.length && Date.now() - stored.at < TTL_MS) {
        memory.set(key, stored.verses);
        return stored.verses;
      }
    } catch {
      // Private mode / blocked storage — fall through to the network.
    }

    const verses = await fetchChapter(slug, book, chapter);
    if (verses.length) {
      memory.set(key, verses);
      try { await set(KEY_PREFIX + key, { verses, at: Date.now() } satisfies CachedChapter); } catch { /* non-fatal */ }
    }
    return verses;
  })().finally(() => inflight.delete(key));

  inflight.set(key, task);
  return task;
}

/**
 * A chapter across several translations at once. Mirrors bibleService's
 * fetchParallel, but routed through getChapter so everything the reader
 * displays lands in the persistent cache — which is what makes reading itself
 * build up offline coverage and the search index.
 */
export async function getParallel(
  book: number,
  chapter: number,
  slugs: string[],
): Promise<Record<string, BibleVerse[]>> {
  const pairs = await Promise.all(
    slugs.map(s => getChapter(s, book, chapter).then(v => [s, v] as const)),
  );
  return Object.fromEntries(pairs);
}

/** True when the chapter is already local — used to decide whether to prefetch. */
export function isChapterHot(slug: string, book: number, chapter: number): boolean {
  return memory.has(keyOf(slug, book, chapter));
}

export interface ResolvedRef {
  ref: ScriptureRef;
  /** Translation slug the text came from. */
  slug: string;
  /** Human label, e.g. "King James". */
  translation: string;
  /** Display form, e.g. "Romans 8:28–31". */
  label: string;
  verses: BibleVerse[];
  /** The verses joined into one string, for graphics and previews. */
  text: string;
  /** More verses exist than were returned (the ref covers a whole chapter). */
  truncated: boolean;
}

/**
 * Resolve a reference to its text. A chapter-only ref returns the opening
 * verses rather than all 176 — callers wanting the whole thing use getChapter.
 */
export async function fetchRefText(
  ref: ScriptureRef,
  slug: string = DEFAULT_TRANSLATION,
  maxVerses = 12,
): Promise<ResolvedRef | null> {
  const label = formatRef(ref, 'display');
  const translation = TRANSLATIONS.find(t => t.slug === slug)?.label ?? slug.toUpperCase();

  const chapters: number[] = [];
  const endChapter = ref.endChapter ?? ref.chapter;
  for (let c = ref.chapter; c <= endChapter && chapters.length < 4; c++) chapters.push(c);

  const loaded = await Promise.all(chapters.map(c => getChapter(slug, ref.book, c)));
  if (!loaded.some(v => v.length)) return null;

  let picked: BibleVerse[] = [];
  chapters.forEach((c, i) => {
    const all = loaded[i];
    if (ref.verse === undefined) { picked.push(...all); return; }
    const from = c === ref.chapter ? ref.verse : 1;
    const to = c === endChapter ? (ref.endVerse ?? (ref.endChapter ? Infinity : ref.verse)) : Infinity;
    picked.push(...all.filter(v => v.verse >= from && v.verse <= to));
  });

  const truncated = picked.length > maxVerses;
  if (truncated) picked = picked.slice(0, maxVerses);

  return {
    ref, slug, translation, label,
    verses: picked,
    text: picked.map(v => v.text).join(' ').replace(/\s+/g, ' ').trim(),
    truncated,
  };
}

/** Warm a chapter without blocking — used on hover intent and by the reader. */
export function prefetchRef(ref: ScriptureRef, slug: string = DEFAULT_TRANSLATION): void {
  void getChapter(slug, ref.book, ref.chapter).catch(() => { /* best effort */ });
}

/** The next chapter, fetched quietly so paging forward is instant. */
export function prefetchAdjacent(slug: string, book: number, chapter: number): void {
  const meta = BOOKS.find(b => b.num === book);
  if (!meta) return;
  if (chapter < meta.chapters) prefetchRef({ book, bookName: meta.name, chapter: chapter + 1 }, slug);
  if (chapter > 1) prefetchRef({ book, bookName: meta.name, chapter: chapter - 1 }, slug);
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline preload
//
// Church buildings have famously bad wifi and a blank screen mid-service is the
// one unforgivable failure. A whole translation is a few MB of text, so the
// honest fix is to hold all of it locally rather than fetch per chapter.
// ─────────────────────────────────────────────────────────────────────────────

export interface PreloadProgress {
  done: number;
  total: number;
  /** Book currently being fetched, for the progress label. */
  label: string;
}

const CONCURRENCY = 5;

/**
 * Download every chapter of a translation into the local cache. Resolves to the
 * number of chapters now held. Safe to re-run — chapters already cached are
 * skipped, so it doubles as "resume".
 */
export async function preloadTranslation(
  slug: string,
  onProgress?: (p: PreloadProgress) => void,
  signal?: { cancelled: boolean },
): Promise<number> {
  const jobs: Array<{ book: number; chapter: number; label: string }> = [];
  for (const b of BOOKS) {
    for (let c = 1; c <= b.chapters; c++) jobs.push({ book: b.num, chapter: c, label: b.name });
  }

  let done = 0;
  let ok = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < jobs.length) {
      if (signal?.cancelled) return;
      const job = jobs[cursor++];
      try {
        const verses = await getChapter(slug, job.book, job.chapter);
        if (verses.length) ok++;
      } catch { /* a missing chapter must not abort the download */ }
      done++;
      onProgress?.({ done, total: jobs.length, label: job.label });
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return ok;
}

export const TOTAL_CHAPTERS = BOOKS.reduce((n, b) => n + b.chapters, 0);

/**
 * How much of a translation is held locally, as a 0–1 fraction. Reads the
 * IndexedDB key list rather than the memory map — on a fresh page load memory
 * is empty even when the whole translation is already downloaded, and an
 * offline indicator that lies is worse than none.
 */
export async function localCoverage(slug: string): Promise<number> {
  const prefix = `${KEY_PREFIX}${slug}/`;
  try {
    const all = await keys();
    const held = all.filter(k => typeof k === 'string' && k.startsWith(prefix)).length;
    return Math.min(1, held / TOTAL_CHAPTERS);
  } catch {
    // Storage blocked — fall back to what this session has in memory.
    let held = 0;
    for (const b of BOOKS) {
      for (let c = 1; c <= b.chapters; c++) if (memory.has(keyOf(slug, b.num, c))) held++;
    }
    return held / TOTAL_CHAPTERS;
  }
}

/** Load every cached chapter of a translation into memory so search can run. */
export async function hydrateForSearch(slug: string): Promise<number> {
  const prefix = `${KEY_PREFIX}${slug}/`;
  try {
    const all = await keys();
    const mine = all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix));
    const loaded = await Promise.all(mine.map(async k => {
      const short = k.slice(KEY_PREFIX.length);
      if (memory.has(short)) return 1;
      const stored = await get<CachedChapter>(k);
      if (stored?.verses?.length) { memory.set(short, stored.verses); return 1; }
      return 0;
    }));
    return loaded.reduce((a: number, b: number) => a + b, 0);
  } catch {
    return memory.size;
  }
}

export interface SearchHit {
  ref: ScriptureRef;
  label: string;
  text: string;
}

/**
 * Lexical search across whatever is cached locally. Deliberately not a network
 * search: it is instant, works offline, and its coverage is exactly what the
 * user has downloaded — which the UI states plainly rather than implying the
 * whole canon was searched.
 */
export function searchCached(query: string, slug: string = DEFAULT_TRANSLATION, limit = 60): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const hits: SearchHit[] = [];

  for (const b of BOOKS) {
    for (let c = 1; c <= b.chapters; c++) {
      const verses = memory.get(keyOf(slug, b.num, c));
      if (!verses) continue;
      for (const v of verses) {
        if (!v.text.toLowerCase().includes(q)) continue;
        const ref: ScriptureRef = { book: b.num, bookName: b.name, chapter: c, verse: v.verse };
        hits.push({ ref, label: formatRef(ref, 'display'), text: v.text });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}
