// bibleLibrary — Verse's hosted Bible library: every translation Plajah may legally
// host (public domain, CC BY, CC BY-SA, CC BY-ND), in as many languages as exist.
// Built from eBible.org by scripts/bibleLibrary/build_library.py and served from
// storage under bible/v1/. Each book is one small JSON file fetched on demand.
//
// No value imports from bibleService/bibleCanon: bibleService imports this module,
// and bibleCanon evaluates BOOKS at load, so a value import here would form a cycle.
import type { BibleTranslation, BibleVerse } from './bibleService';

export const LIBRARY_PREFIX = 'eb.';
const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';
const BASE: string = (import.meta as any).env?.VITE_BIBLE_LIBRARY_BASE || '';

/** URL of a library file: a plain base (dev) or the Firebase Storage object. */
export function libraryUrl(path: string): string {
  if (BASE) return `${BASE.replace(/\/$/, '')}/${path}`;
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`bible/v1/${path}`)}?alt=media`;
}

export interface LibraryTranslation {
  id: string; title: string; fullTitle: string;
  lang: string; langName: string; langEnglish: string; dialect: string; script: string; dir: 'ltr' | 'rtl';
  licence: string; licenceUrl: string; copyright: string; source: string;
  ot: boolean; nt: boolean; dc: boolean; books: number; updated: string;
}

export const isLibrarySlug = (slug: string) => slug.startsWith(LIBRARY_PREFIX);
export const librarySlug = (id: string) => LIBRARY_PREFIX + id;
const idOf = (slug: string) => slug.slice(LIBRARY_PREFIX.length);

let catalogPromise: Promise<LibraryTranslation[]> | undefined;
const byId = new Map<string, LibraryTranslation>();

/** The whole library catalog (≈1,000 translations), fetched once per session. */
export function loadCatalog(): Promise<LibraryTranslation[]> {
  catalogPromise ??= fetch(libraryUrl('catalog.json'))
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(j => {
      const list: LibraryTranslation[] = Array.isArray(j?.translations) ? j.translations : [];
      for (const t of list) byId.set(t.id, t);
      return list;
    })
    .catch(() => { catalogPromise = undefined; return []; });
  return catalogPromise;
}

export function libraryEntry(slug: string): LibraryTranslation | undefined {
  return byId.get(idOf(slug));
}

/** A catalog entry in the reader's translation shape. */
export function asTranslation(t: LibraryTranslation): BibleTranslation {
  return {
    slug: librarySlug(t.id), label: t.title, lang: t.lang, rtl: t.dir === 'rtl',
    testament: t.ot && t.nt ? 'BOTH' : t.nt ? 'NT' : 'OT',
  };
}

// ── books ────────────────────────────────────────────────────────────────────
const indexes = new Map<string, Map<number, number>>();   // id → book → chapter count
const indexLoads = new Map<string, Promise<void>>();

/** Load which books (and how many chapters) a library translation has. */
export function ensureLibraryIndex(slug: string): Promise<void> {
  const id = idOf(slug);
  if (indexes.has(id)) return Promise.resolve();
  let p = indexLoads.get(id);
  if (!p) {
    p = fetch(libraryUrl(`${id}/index.json`))
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const m = new Map<number, number>();
        for (const b of j?.books ?? []) m.set(Number(b.num), Math.max(...(b.chapters as number[])));
        indexes.set(id, m);
      })
      .catch(() => { indexLoads.delete(id); });
    indexLoads.set(id, p);
  }
  return p;
}

/** Book → chapter count for a loaded library translation (undefined until loaded). */
export function libraryBookChapters(slug: string): Map<number, number> | undefined {
  return indexes.get(idOf(slug));
}

// ── chapters ─────────────────────────────────────────────────────────────────
const books = new Map<string, Promise<Record<string, [number, string][]> | null>>();

export async function fetchLibraryChapter(slug: string, book: number, chapter: number): Promise<BibleVerse[]> {
  const id = idOf(slug), key = `${id}/${book}`;
  let p = books.get(key);
  if (!p) {
    p = fetch(libraryUrl(`${id}/${book}.json`))
      .then(r => r.ok ? r.json() : null)
      .then(j => (j?.c ?? null) as Record<string, [number, string][]> | null)
      .catch(() => null);
    books.set(key, p);
    p.then(v => { if (!v) books.delete(key); });
  }
  const chapters = await p;
  return (chapters?.[String(chapter)] ?? []).map(([verse, text]) => ({ verse, text }));
}

// ── the reader's chosen library translations ─────────────────────────────────
const PICKS_KEY = 'pj.verse.library.v1';
export function readPicks(): string[] {
  try { const v = JSON.parse(localStorage.getItem(PICKS_KEY) || '[]'); return Array.isArray(v) ? v.filter(isLibrarySlug) : []; } catch { return []; }
}
export function writePicks(slugs: string[]) {
  try { localStorage.setItem(PICKS_KEY, JSON.stringify(slugs)); } catch { /* private mode */ }
}
