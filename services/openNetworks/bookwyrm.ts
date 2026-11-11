// BookWyrm bridge — PUBLIC, READ-ONLY view of a reader's shelves for Lorea/Lectio profiles.
//
// BookWyrm exposes each shelf as an ActivityPub OrderedCollection at /user/<name>/books/<shelf> (ask with
// Accept: application/activity+json; `?page=N` gives an OrderedCollectionPage whose orderedItems are Edition objects).
// Private / followers-only shelves are simply not returned to an anonymous request, which is what we are.
//
// Writing: BookWyrm has NO public client write API (no OAuth app flow, no token-based REST for shelving/reviews).
// Federation-wise a remote ActivityPub actor could send it activities, but Plajah users aren't BookWyrm actors, so the
// honest option is link-out: we return the profile/shelf URL and the UI opens BookWyrm to edit.
//
// API notes: whether orderedItems are inlined Edition objects or bare URLs has varied between versions; both are
// handled (bare URLs become link-only rows). Author names need one extra fetch per author — capped, same host only.

import { type NetDeps, OpenNetworkError, netFetch, normalizeServer, clean, stripHtml, safeLink } from './common';

export const BOOKWYRM_DEFAULT_SHELVES = ['to-read', 'reading', 'read', 'stopped-reading'] as const;
export const BOOKWYRM_WRITE_SUPPORTED = false;

const AP_ACCEPT = 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"';

/** "@reader@bookwyrm.social" | "reader@bookwyrm.social" | "https://bookwyrm.social/user/reader" → parts. */
export function parseBookwyrmHandle(raw: unknown): { name: string; server: string } {
  const s = clean(raw, 300).replace(/^@/, '');
  let name = '', host = '';
  if (/^https?:\/\//i.test(s)) {
    const u = new URL(s);
    const m = u.pathname.match(/^\/user\/([A-Za-z0-9_.-]{1,100})/);
    if (!m) throw new OpenNetworkError(400, 'Profile link should look like https://instance/user/name', 'bad-handle');
    name = m[1]; host = u.host;
  } else {
    const m = s.match(/^([A-Za-z0-9_.-]{1,100})@([A-Za-z0-9.-]{1,253}(:\d+)?)$/);
    if (!m) throw new OpenNetworkError(400, 'Use name@instance, e.g. reader@bookwyrm.social', 'bad-handle');
    name = m[1]; host = m[2];
  }
  return { name, server: normalizeServer(host).origin };
}

export function parseShelf(raw: unknown): string {
  const s = clean(raw || 'read', 100).toLowerCase();
  if (!/^[a-z0-9-]{1,100}$/.test(s)) throw new OpenNetworkError(400, 'Bad shelf name', 'bad-shelf');
  return s;
}

export interface BookCard { title: string; subtitle?: string; authors: string[]; cover?: string; isbn13?: string; link?: string; published?: string; description?: string }
export interface ShelfResult { handle: string; shelf: string; total?: number; books: BookCard[]; profileUrl: string; shelfUrl: string; writeSupported: false; writeNote: string }

export async function bookwyrmShelf(deps: NetDeps, handle: string, shelf: string, opts: { page?: number; resolveAuthors?: number } = {}): Promise<ShelfResult> {
  const { name, server } = parseBookwyrmHandle(handle);
  const slug = parseShelf(shelf);
  const page = Math.max(1, Math.min(20, Math.floor(opts.page ?? 1)));
  const shelfUrl = `${server}/user/${encodeURIComponent(name)}/books/${slug}`;
  const r = await netFetch(deps, `${shelfUrl}?page=${page}`, { headers: { Accept: AP_ACCEPT } });
  const j: any = r.json;
  if (r.status === 404) throw new OpenNetworkError(404, 'No public shelf by that name (it may be private)', 'not-found');
  if (!r.ok || !j) throw new OpenNetworkError(502, `BookWyrm answered HTTP ${r.status}`, 'remote');
  const items: any[] = Array.isArray(j.orderedItems) ? j.orderedItems : Array.isArray(j.first?.orderedItems) ? j.first.orderedItems : [];

  const books: BookCard[] = items.slice(0, 50).map((it): BookCard | null => {
    if (typeof it === 'string') return safeLink(it) ? { title: 'Book', authors: [], link: safeLink(it) } : null;
    if (!it || typeof it !== 'object') return null;
    const cover = it.cover && typeof it.cover === 'object' ? safeLink(it.cover.url) : safeLink(it.cover);
    return {
      title: clean(it.title || it.name, 300) || 'Untitled',
      subtitle: clean(it.subtitle, 300) || undefined,
      authors: (Array.isArray(it.authors) ? it.authors : []).map((a: any) => typeof a === 'string' ? a : clean(a?.name, 120)).filter(Boolean),
      cover,
      isbn13: clean(it.isbn13, 20) || undefined,
      link: safeLink(it.id),
      published: clean(it.publishedDate, 40) || undefined,
      description: it.description ? stripHtml(it.description, 400) : undefined,
    };
  }).filter((b): b is BookCard => !!b);

  // Authors arrive as actor URLs; resolve a few names from the same host.
  const budget = Math.max(0, Math.min(20, opts.resolveAuthors ?? 10));
  const host = new URL(server).host;
  const urls = [...new Set(books.flatMap(b => b.authors).filter(a => /^https:\/\//.test(a) && new URL(a).host === host))].slice(0, budget);
  const names = new Map<string, string>();
  await Promise.all(urls.map(async (u) => {
    try {
      const a = await netFetch(deps, u, { headers: { Accept: AP_ACCEPT } });
      const n = clean((a.json as any)?.name, 120);
      if (n) names.set(u, n);
    } catch { /* leave as link */ }
  }));
  for (const b of books) b.authors = b.authors.map(a => names.get(a) ?? (/^https?:\/\//.test(a) ? '' : a)).filter(Boolean);

  return {
    handle: `${name}@${host}`,
    shelf: slug,
    total: typeof j.totalItems === 'number' ? j.totalItems : (typeof j.partOf === 'object' && typeof j.partOf?.totalItems === 'number' ? j.partOf.totalItems : undefined),
    books,
    profileUrl: `${server}/user/${encodeURIComponent(name)}`,
    shelfUrl,
    writeSupported: BOOKWYRM_WRITE_SUPPORTED,
    writeNote: 'BookWyrm has no public write API. Shelve, rate and review on BookWyrm itself — Plajah only reads public shelves.',
  };
}
