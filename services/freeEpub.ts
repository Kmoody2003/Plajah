// freeEpub — turn a free public-domain library book (Project Gutenberg / archive.org)
// into a Plajah Album so it opens directly in the native Lorea reader instead of
// bouncing the reader out to an external site. Mirrors labsApiService.textbookToAlbum
// (which already does this for OpenStax EPUBs).
//
// Gutenberg always publishes an EPUB, so those route to Lorea unconditionally.
// archive.org is a scan host — only *some* items have a real EPUB, so we probe the
// derived URL once (through /api/proxy, which the reader also uses) and only offer
// "Read in Lorea" when a valid EPUB actually exists there. That honors "books that
// ARE epubs" instead of guessing and showing a broken reader.
import { useEffect, useState } from 'react';
import type { Album, BookChapter } from '../types';

export interface FreeBookLike {
  id: string;
  title: string;
  authors?: string[];
  year?: string;
  desc?: string;
  url: string;
  cover?: string;
  free?: boolean;
}

const gutenbergId = (url: string): string | null => {
  const m = url.match(/gutenberg\.org\/(?:ebooks|cache\/epub|files)\/(\d+)/i);
  return m ? m[1] : null;
};

const archiveId = (url: string): string | null => {
  const m = url.match(/archive\.org\/(?:details|download|stream)\/([^/?#]+)/i);
  return m ? m[1] : null;
};

/** True when this book's source reliably exposes a free EPUB the reader can open. */
export function hasFreeEpub(book: { url?: string; free?: boolean }): boolean {
  if (!book?.url || book.free === false) return false;
  return !!gutenbergId(book.url) || !!archiveId(book.url);
}

/**
 * Build a Lorea Album (single EPUB chapter + a plain-text fallback) from a free
 * public-domain book. Returns null if the source isn't a recognised free-EPUB host,
 * so callers keep their external link for those.
 */
export function freeEpubAlbum(book: FreeBookLike): Album | null {
  if (book.free === false) return null;
  const g = gutenbergId(book.url);
  const a = g ? null : archiveId(book.url);

  let epubUrl = '';
  let fallbackUrl = '';
  let source = '';
  if (g) {
    epubUrl = `https://www.gutenberg.org/ebooks/${g}.epub.images`;
    // Reliable plain-text edition if the EPUB fetch is blocked (CORS / missing).
    fallbackUrl = `https://www.gutenberg.org/cache/epub/${g}/pg${g}.txt`;
    source = 'Project Gutenberg';
  } else if (a) {
    epubUrl = `https://archive.org/download/${a}/${a}.epub`;
    fallbackUrl = `https://archive.org/download/${a}/${a}_djvu.txt`;
    source = 'archive.org';
  } else {
    return null;
  }

  const chapter: BookChapter = {
    id: `${book.id}-epub`,
    title: book.title,
    format: 'EPUB',
    url: epubUrl,
    fallbackUrl,
    description: `Free public-domain edition — EPUB (${source})`,
  };

  return {
    id: `freebook-${book.id}`,
    ownerId: g ? 'gutenberg' : 'archive',
    type: 'BOOK',
    title: book.title,
    artist: (book.authors || []).join(', '),
    artistBio: `Public-domain edition via ${source}. Free to read and share.`,
    coverImage: book.cover || '',
    description: book.desc || `${book.title}${book.year ? ` · ${book.year}` : ''}`,
    genre: 'Public Domain',
    bookChapters: [chapter],
    isPrivate: false,
    isDraft: false,
    isGlobalArchive: true,
    tags: ['public-domain', 'free', source.toLowerCase().replace(/[^a-z]/g, '')],
    tracks: [],
    createdAt: Date.now(),
    isAdSupported: false,
  } as unknown as Album;
}

// ── EPUB availability probe (archive.org) + reader hook ───────────────────────
const probeCache = new Map<string, Promise<boolean>>();

/** Verify a derived EPUB URL actually resolves to an EPUB (zip) via /api/proxy. Cached. */
export function probeEpubAvailable(book: FreeBookLike): Promise<boolean> {
  if (book.free === false) return Promise.resolve(false);
  if (gutenbergId(book.url)) return Promise.resolve(true);       // Gutenberg always has one
  if (!archiveId(book.url)) return Promise.resolve(false);
  const album = freeEpubAlbum(book);
  const epubUrl = album?.bookChapters?.[0]?.url;
  if (!epubUrl) return Promise.resolve(false);
  if (probeCache.has(epubUrl)) return probeCache.get(epubUrl)!;
  const p = (async () => {
    try {
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(epubUrl)}`, { headers: { Range: 'bytes=0-3' } });
      if (!r.ok) return false;
      const ct = r.headers.get('content-type') || '';
      if (/epub|zip|octet-stream/i.test(ct)) return true;
      const buf = new Uint8Array(await r.arrayBuffer());
      return buf[0] === 0x50 && buf[1] === 0x4B;                 // 'PK' zip magic
    } catch { return false; }
  })();
  probeCache.set(epubUrl, p);
  return p;
}

/**
 * Reader state + per-book EPUB availability for a discipline's book list.
 * `canRead(book)` is true once we know a real EPUB exists; `open(book)` launches Lorea.
 */
export function useLoreaFreeBooks(books: FreeBookLike[]) {
  const [readerBook, setReaderBook] = useState<Album | null>(null);
  const [ready, setReady] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let on = true;
    Promise.all(books.map(async b => [b.id, await probeEpubAvailable(b)] as const))
      .then(pairs => { if (on) setReady(Object.fromEntries(pairs)); });
    return () => { on = false; };
  }, [books]);

  return {
    readerBook,
    closeReader: () => setReaderBook(null),
    canRead: (b: FreeBookLike) => !!ready[b.id],
    open: (b: FreeBookLike) => { const al = freeEpubAlbum(b); if (al) setReaderBook(al); },
  };
}
