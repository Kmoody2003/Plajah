// Client side of the paid-book vault (server: routes/bookVault.ts).
// A sealed book's album doc is public but carries no readable content; the author and buyers get
// it back from /api/books/:id/access, with short-lived signed URLs for its files.
import type { Album, BookChapter } from '../types';
import type { BookVersionStamp, EditionInfo, EditionRegistry, PublishUpdate } from './bookEditions/policy';
import { auth } from './backendService';

export interface BookAccess {
  sealed: boolean;
  entitled?: boolean;
  owner?: boolean;
  chapters?: BookChapter[];
  // Edition policy (services/bookEditions/policy.ts) as the server applied it to this reader.
  registry?: EditionRegistry;
  version?: BookVersionStamp | null;
  followLatest?: boolean;
  readable?: BookVersionStamp[];
  purchased?: BookVersionStamp | null;
  upgradeOffer?: EditionInfo | null;
}

const absolute = (u: unknown) =>
  typeof u === 'string' && u.startsWith('/api/books/') && typeof window !== 'undefined' ? new URL(u, window.location.origin).toString() : u;

function absolutize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(absolutize) as any;
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = typeof v === 'string' ? absolute(v) : absolutize(v);
    return out as T;
  }
  return value;
}

/** True for a book whose content lives in the vault. */
export const isSealedBook = (book: Pick<Album, 'type'> & { sealed?: boolean } | null | undefined) =>
  !!book && book.type === 'BOOK' && !!(book as any).sealed;

/** Chapters the signed-in (or anonymous) reader may open. Throws on a network/server failure. */
export async function fetchBookAccess(albumId: string, versionId?: string | null): Promise<BookAccess> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  const q = versionId ? `?version=${encodeURIComponent(versionId)}` : '';
  const res = await fetch(`/api/books/${encodeURIComponent(albumId)}/access${q}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Book access failed (HTTP ${res.status})`);
  const data = await res.json() as BookAccess;
  return data.chapters ? { ...data, chapters: absolutize(data.chapters) } : data;
}

/** The album with whatever content the caller is entitled to merged back in. */
export async function openSealedBook(book: Album, versionId?: string | null): Promise<{ book: Album; access: BookAccess }> {
  const access = await fetchBookAccess(book.id, versionId);
  if (!access.sealed || !access.chapters) return { book, access };
  return { book: { ...book, bookChapters: access.chapters }, access };
}

/** Turn signed vault links (from an editor that loaded a sealed book) back into `vault:` refs, so a
 *  republish never writes a working download link onto the public album doc. */
export function toVaultRefs<T>(value: T): T {
  if (typeof value === 'string') {
    const m = value.match(/\/api\/books\/[^/?#]+\/file\?(.*)$/);
    const p = m ? new URLSearchParams(m[1]).get('p') : null;
    return (p ? `vault:${p}` : value) as any;
  }
  if (Array.isArray(value)) return value.map(toVaultRefs) as any;
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toVaultRefs(v);
    return out as T;
  }
  return value;
}

/** Move a paid book's content into the vault. Call after every publish/edit of a paid book. */
export async function sealPaidBook(albumId: string, opts: { update?: PublishUpdate | null; draft?: boolean } = {}): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to publish');
  const res = await fetch(`/api/books/${encodeURIComponent(albumId)}/seal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ update: opts.update ?? null, draft: !!opts.draft }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Sealing failed (HTTP ${res.status})`);
}
