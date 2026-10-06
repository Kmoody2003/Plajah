/**
 * feedPaginationCore — PURE pagination primitives (no Firebase, no React). Used by services/feedPagination.ts
 * (the hooks) and unit-tested in tests/feedEngine.test.ts.
 *
 * The 'following' feed cannot be one Firestore query (`in` caps at 10 values), so the authors are chunked
 * by 10 and each chunk is its own `orderBy(timestamp desc)` stream with its own cursor + buffer. A page
 * is produced by k-way merging the streams by timestamp. Correctness rule (see `drainMerged`): an item
 * may be emitted only while EVERY non-exhausted stream still has a buffered item (that item is its
 * frontier); the moment one runs dry we must fetch its next page before emitting more.
 */

export const PAGE_SIZE = 20;
export const IN_QUERY_LIMIT = 10;

export interface TimedItem { id: string; timestamp: number }

export function chunk<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Order-preserving dedupe by id (first wins). */
export function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const i of items) { if (!seen.has(i.id)) { seen.add(i.id); out.push(i); } }
  return out;
}

const byTimeDesc = (a: TimedItem, b: TimedItem) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : -1);

/** k-way merge of lists that are each sorted timestamp-desc. Dedupes by id. Optional cap. */
export function kWayMerge<T extends TimedItem>(lists: readonly (readonly T[])[], max = Infinity): T[] {
  const idx = lists.map(() => 0);
  const out: T[] = [];
  const seen = new Set<string>();
  while (out.length < max) {
    let best = -1;
    for (let k = 0; k < lists.length; k++) {
      if (idx[k] >= lists[k].length) continue;
      if (best < 0 || byTimeDesc(lists[k][idx[k]], lists[best][idx[best]]) < 0) best = k;
    }
    if (best < 0) break;
    const it = lists[best][idx[best]++];
    if (!seen.has(it.id)) { seen.add(it.id); out.push(it); }
  }
  return out;
}

export interface StreamState<T> { buffer: T[]; exhausted: boolean }

export interface DrainResult<T> {
  out: T[];
  /** Indices of streams whose buffer ran dry and which are not exhausted — fetch their next page, then drain again. */
  needFetch: number[];
}

/**
 * Take up to `n` items off the front of the merged streams, mutating each stream's buffer. Stops early
 * (reporting `needFetch`) as soon as a live stream has nothing buffered, because its next item could
 * out-rank everything still buffered elsewhere. `seen` (ids already emitted) is honoured and updated.
 */
export function drainMerged<T extends TimedItem>(streams: StreamState<T>[], n: number, seen: Set<string>): DrainResult<T> {
  const out: T[] = [];
  for (;;) {
    if (out.length >= n) return { out, needFetch: [] };
    const dry = streams.map((s, i) => (!s.exhausted && s.buffer.length === 0 ? i : -1)).filter(i => i >= 0);
    if (dry.length) return { out, needFetch: dry };
    let best = -1;
    for (let k = 0; k < streams.length; k++) {
      if (!streams[k].buffer.length) continue;
      if (best < 0 || byTimeDesc(streams[k].buffer[0], streams[best].buffer[0]) < 0) best = k;
    }
    if (best < 0) return { out, needFetch: [] };           // everything exhausted & empty
    const it = streams[best].buffer.shift()!;
    if (!seen.has(it.id)) { seen.add(it.id); out.push(it); }
  }
}

/** Is a stream finished after fetching a page of `got` docs asked at `asked`? */
export const pageExhausted = (got: number, asked: number) => got < asked;

// ─── Viewer-side filtering ────────────────────────────────────────────────────

export interface FilterableFeedItem extends TimedItem {
  authorId?: string;
  isPublic?: boolean;
  isToday?: boolean;
  expiresAt?: number;
}

export interface FeedFilterOptions {
  viewerId?: string;
  hiddenUids?: ReadonlySet<string>;
  now?: number;
}

/**
 * Drops: private posts of other people (isPublic === false), hidden uids (blocked / blocked-by / muted),
 * expired 24h "Today" clips and anything without a usable timestamp. Content-safety (child filter) is applied
 * separately by the hook via contentSafety.filterPostsForViewer so this stays dependency-free.
 */
export function filterFeedItems<T extends FilterableFeedItem>(items: readonly T[], o: FeedFilterOptions = {}): T[] {
  const now = o.now ?? Date.now();
  return items.filter(p => {
    if (!(p.timestamp > 0)) return false;
    if (p.isPublic === false && p.authorId !== o.viewerId) return false;
    if (p.authorId && o.hiddenUids?.has(p.authorId) && p.authorId !== o.viewerId) return false;
    if (p.isToday && typeof p.expiresAt === 'number' && p.expiresAt <= now) return false;
    return true;
  });
}

// ─── Live-head bookkeeping ────────────────────────────────────────────────────

export interface HeadDiff<T extends TimedItem> {
  /** ids unseen so far → belong in the "N new posts" buffer (own posts go straight in, see `own`). */
  fresh: T[];
  /** items we already show whose data changed (likes etc.) */
  updated: T[];
  removed: string[];
}

/** Classify a head snapshot's changes against the ids already shown/buffered. */
export function diffHead<T extends TimedItem & { authorId?: string }>(
  changes: readonly { type: 'added' | 'modified' | 'removed'; item: T }[],
  known: ReadonlySet<string>,
): HeadDiff<T> {
  const fresh: T[] = []; const updated: T[] = []; const removed: string[] = [];
  for (const c of changes) {
    if (c.type === 'removed') { removed.push(c.item.id); continue; }
    if (known.has(c.item.id)) updated.push(c.item);
    else fresh.push(c.item);
  }
  fresh.sort(byTimeDesc);
  return { fresh, updated, removed };
}

/** Prepend `incoming` (newest first) to `current`, deduped, keeping the list sorted newest-first at the head. */
export function prependNew<T extends TimedItem>(current: readonly T[], incoming: readonly T[]): T[] {
  const ids = new Set(current.map(i => i.id));
  const add = incoming.filter(i => !ids.has(i.id)).sort(byTimeDesc);
  return [...add, ...current];
}

/** Firestore Timestamp | millis | {seconds} | ISO → ms (0 when absent). */
export function toMillisLoose(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v > 0 ? v : 0;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch { return 0; } }
  if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1e6);
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; }
  return 0;
}
