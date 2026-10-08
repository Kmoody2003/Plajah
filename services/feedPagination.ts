/**
 * feedPagination — cursor pagination + a live HEAD for the `posts` feed.
 *
 *   const feed = useFeedPages({ kind: 'global', viewerId, viewerProfile, hiddenUids });
 *   feed.items         newest-first, deduped, filtered (hidden uids, private posts, kid-safety, expired Today)
 *   feed.loadMore()    next page (20) via getDocs + startAfter(lastDoc); safe to call repeatedly
 *   feed.hasMore       false once every stream is exhausted
 *   feed.loadingInitial / loadingMore   DISTINCT from `isEmpty` (loaded and genuinely nothing)
 *   feed.newCount      posts that arrived live above the fold; shown in <NewPostsPill>
 *   feed.flushNew()    prepend those posts (call on pill click, then scroll to top)
 *   feed.refresh()     tear down + restart (pull-to-refresh / retry)
 *   feed.error         last error (the list keeps what it already has)
 *
 * Only the HEAD (newest `headSize`, default = page size) is a realtime listener, wrapped in safeSnapshot's
 * onSnapshot. Everything older is plain getDocs, so listener cost does not grow with scroll depth. The head
 * listener's first snapshot IS page 1 and its last doc is the cursor for page 2.
 *
 * kind 'following': authors (followingIds ∪ viewerId) are chunked by 10 for Firestore `in`; each chunk is
 * its own stream (own cursor + buffer) and pages are k-way merged by timestamp — no 9-author cap. Only the
 * first MAX_LIVE_CHUNKS (6 → 60 authors) get a realtime head; further chunks are fetched once per
 * (re)start, so a viewer following hundreds still sees all of them on scroll/refresh.
 *
 * kind 'following' also merges followed authors' (and the viewer's own) `private_posts` — see
 * privatePostsService (per-author equality queries, followed authors only, one-shot per (re)start, items tagged
 * sourceCollection 'private_posts'). They are interleaved by timestamp and, while older public pages remain
 * unloaded, only those newer than the oldest loaded public post are shown (keeps scroll order stable).
 *
 * kind 'hashtag': `where('hashtags','array-contains', tag)` (Post.hashtags, written by the composer via
 * postingLogic.composerPostExtras) — composite index (hashtags, timestamp desc) is in
 * firestore.indexes.json. `tag` is matched lower-case without '#'.
 *
 * Queries (all index-backed): global = orderBy(timestamp desc); following = where(authorId in [≤10]) +
 * orderBy(timestamp desc) (existing posts index authorId,timestamp); hashtag as above.
 * NOTE: `posts` read rules allow public OR own; the existing global feed already lists with no isPublic
 * filter, and this mirrors it. Private posts that do slip through are dropped client-side.
 *
 * Pure logic lives in feedPaginationCore.ts (tested); this file is the Firebase/React shell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc,
  type QueryConstraint, type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { fetchPrivatePostsForAuthors } from './privatePostsService';
import { onSnapshot } from './safeSnapshot';
import { filterPostsForViewer } from './contentSafety';
import type { Post, UserProfile } from '../types';
import {
  PAGE_SIZE, IN_QUERY_LIMIT, chunk, drainMerged, filterFeedItems, diffHead, prependNew, toMillisLoose,
  type StreamState,
} from './feedPaginationCore';

export * from './feedPaginationCore';

export type FeedPageKind = 'global' | 'following' | 'hashtag';

export interface UseFeedPagesOptions {
  kind: FeedPageKind;
  /** 'following' only: the viewer's followed uids (the viewer's own uid is added automatically). */
  followingIds?: readonly string[];
  /** 'hashtag' only: the tag, with or without '#'. */
  hashtag?: string;
  hiddenUids?: ReadonlySet<string>;
  viewerId?: string;
  /** Needed for the child-safety filter (contentSafety.filterPostsForViewer). */
  viewerProfile?: UserProfile | null;
  enabled?: boolean;
  pageSize?: number;
  headSize?: number;
}

export interface UseFeedPagesResult {
  items: Post[];
  loadMore: () => Promise<void>;
  hasMore: boolean;
  loadingInitial: boolean;
  loadingMore: boolean;
  newCount: number;
  flushNew: () => void;
  refresh: () => void;
  error: Error | null;
  /** loaded, no error, and nothing to show — render the empty state only when this is true. */
  isEmpty: boolean;
}

const MAX_LIVE_CHUNKS = 6;
const POSTS = 'posts';

interface Chunk extends StreamState<Post> {
  authors: string[] | null;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  gotHead: boolean;
  unsub: (() => void) | null;
}

const docToPost = (d: QueryDocumentSnapshot<DocumentData>): Post => {
  const data = d.data();
  let ts = toMillisLoose(data.timestamp);
  if (!ts && d.metadata.hasPendingWrites) ts = Date.now();   // optimistic local write, serverTimestamp not resolved
  return { id: d.id, ...data, sourceCollection: 'posts', timestamp: ts } as Post;
};

const sortDesc = (a: Post, b: Post) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : -1);

function buildQuery(kind: FeedPageKind, authors: string[] | null, tag: string, n: number, after?: QueryDocumentSnapshot<DocumentData> | null) {
  const parts: QueryConstraint[] = [];
  if (kind === 'following') parts.push(where('authorId', 'in', authors ?? []));
  if (kind === 'hashtag') parts.push(where('hashtags', 'array-contains', tag));
  parts.push(orderBy('timestamp', 'desc'));
  if (after) parts.push(startAfter(after));
  parts.push(limit(n));
  return query(collection(db, POSTS), ...parts);
}

export function useFeedPages(opts: UseFeedPagesOptions): UseFeedPagesResult {
  const {
    kind, hashtag, hiddenUids, viewerId, viewerProfile,
    enabled = true, pageSize = PAGE_SIZE, headSize = pageSize,
  } = opts;
  const tag = (hashtag ?? '').replace(/^#+/, '').toLowerCase();
  // stable key so a new array identity with the same ids does not restart the listeners
  const authorsKey = kind === 'following'
    ? [...new Set([...(opts.followingIds ?? []), ...(viewerId ? [viewerId] : [])])].sort().join(',')
    : '';

  const [raw, setRaw] = useState<Post[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const [privRaw, setPrivRaw] = useState<Post[]>([]);

  const eng = useRef({
    gen: 0,
    chunks: [] as Chunk[],
    emitted: new Set<string>(),     // ids already in `raw` (drain dedupe)
    known: new Set<string>(),       // emitted ∪ buffered ∪ pending (live-diff dedupe)
    pending: new Map<string, Post>(),
    loadingMore: false,
  });
  const rawRef = useRef<Post[]>([]);
  const commit = useCallback((next: Post[]) => { rawRef.current = next; setRaw(next); }, []);
  const viewerIdRef = useRef(viewerId); viewerIdRef.current = viewerId;

  const computeHasMore = () => eng.current.chunks.some(c => !c.exhausted || c.buffer.length > 0);

  useEffect(() => {
    const e = eng.current;
    const gen = ++e.gen;
    e.chunks.forEach(c => c.unsub?.());
    e.chunks = []; e.emitted = new Set(); e.known = new Set(); e.pending = new Map(); e.loadingMore = false;
    commit([]); setNewCount(0); setError(null); setHasMore(false); setLoadingMore(false);

    if (!enabled) { setLoadingInitial(false); return; }

    let authorChunks: (string[] | null)[];
    if (kind === 'following') {
      const authors = authorsKey ? authorsKey.split(',') : [];
      authorChunks = chunk(authors, IN_QUERY_LIMIT);
    } else if (kind === 'hashtag' && !tag) {
      authorChunks = [];
    } else {
      authorChunks = [null];
    }
    if (!authorChunks.length) { setLoadingInitial(false); return; }

    setLoadingInitial(true);
    e.chunks = authorChunks.map(a => ({ authors: a, buffer: [], exhausted: false, lastDoc: null, gotHead: false, unsub: null }));
    const stale = () => e.gen !== gen;
    let headsReady = 0;

    const emitFirstPage = () => {
      const r = drainMerged(e.chunks, pageSize, e.emitted);
      // chunks that ran dry right away (e.g. a chunk with zero posts is already exhausted, so this only
      // triggers when pageSize > headSize); loadMore() will continue from there.
      commit(r.out);
      setHasMore(computeHasMore());
      setLoadingInitial(false);
    };

    const onHeadReady = () => { headsReady++; if (headsReady === e.chunks.length) emitFirstPage(); };

    const applyLive = (ci: number, snap: { docChanges: () => { type: 'added' | 'modified' | 'removed'; doc: QueryDocumentSnapshot<DocumentData> }[] }) => {
      const chunkRef = e.chunks[ci];
      const diff = diffHead(snap.docChanges().map(c => ({ type: c.type, item: docToPost(c.doc) })), e.known);
      if (!diff.fresh.length && !diff.updated.length && !diff.removed.length) return;

      let list = rawRef.current;
      let touched = false;
      const newest = list[0]?.timestamp ?? 0;
      const tail = list[list.length - 1]?.timestamp ?? 0;

      for (const p of diff.updated) {
        const i = list.findIndex(x => x.id === p.id);
        if (i >= 0) { list = list.slice(); list[i] = { ...list[i], ...p }; touched = true; }
        else if (e.pending.has(p.id)) e.pending.set(p.id, p);
        else { const bi = chunkRef.buffer.findIndex(x => x.id === p.id); if (bi >= 0) chunkRef.buffer[bi] = p; }
      }
      // A limit() window also reports docs that merely scrolled OUT of the head as 'removed', so a removal
      // is only believed after confirming the doc is really gone.
      if (diff.removed.length) {
        const gone = diff.removed.filter(id => e.known.has(id));
        gone.forEach(id => {
          getDoc(doc(db, POSTS, id)).then(s => {
            if (s.exists() || e.gen !== gen) return;
            e.pending.delete(id); e.known.delete(id); e.emitted.delete(id);
            e.chunks.forEach(c => { c.buffer = c.buffer.filter(x => x.id !== id); });
            commit(rawRef.current.filter(x => x.id !== id));
            setNewCount(e.pending.size);
          }).catch(() => { /* keep the post if we cannot verify */ });
        });
      }
      for (const p of diff.fresh) {
        e.known.add(p.id);
        if (p.authorId === viewerIdRef.current) {            // your own post appears immediately, no pill
          e.emitted.add(p.id); list = prependNew(list, [p]); touched = true;
        } else if (p.timestamp > newest) {
          e.pending.set(p.id, p);
        } else if (p.timestamp >= tail) {                   // backdated / re-ordered inside the loaded range
          e.emitted.add(p.id); list = list.concat(p).sort(sortDesc); touched = true;
        } else {
          chunkRef.buffer.push(p); chunkRef.buffer.sort(sortDesc);   // belongs to a later page
        }
      }
      if (touched) commit(list);
      setNewCount(e.pending.size);
      setHasMore(computeHasMore());
    };

    e.chunks.forEach((c, ci) => {
      const q = buildQuery(kind, c.authors, tag, headSize);
      const initial = (docs: QueryDocumentSnapshot<DocumentData>[]) => {
        c.buffer = docs.map(docToPost).sort(sortDesc);
        c.buffer.forEach(p => e.known.add(p.id));
        c.lastDoc = docs.length ? docs[docs.length - 1] : null;
        c.exhausted = docs.length < headSize;
        c.gotHead = true;
        onHeadReady();
      };
      if (ci < MAX_LIVE_CHUNKS) {
        c.unsub = onSnapshot(q, snap => {
          if (stale()) return;
          if (!c.gotHead) initial(snap.docs); else applyLive(ci, snap);
        }, err => { if (stale()) return; setError(err as Error); if (!c.gotHead) { c.gotHead = true; c.exhausted = true; onHeadReady(); } });
      } else {
        getDocs(q).then(s => { if (!stale()) initial(s.docs); })
          .catch(err => { if (stale()) return; setError(err as Error); c.gotHead = true; c.exhausted = true; onHeadReady(); });
      }
    });

    return () => { e.gen++; e.chunks.forEach(c => c.unsub?.()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, authorsKey, tag, enabled, pageSize, headSize, nonce]);

  // Followed private authors' posts (following kind only). One-shot; failures leave the public feed intact.
  useEffect(() => {
    setPrivRaw([]);
    if (!enabled || kind !== 'following' || !authorsKey) return;
    let live = true;
    const authors = authorsKey.split(',');
    fetchPrivatePostsForAuthors(authors, authors, null, 30)
      .then(ps => { if (live) setPrivRaw(ps); })
      .catch(() => { /* optional layer */ });
    return () => { live = false; };
  }, [kind, authorsKey, enabled, nonce]);

  const visible = useCallback((ps: Post[]) =>
    filterPostsForViewer(filterFeedItems(ps, { viewerId, hiddenUids }), viewerProfile), [viewerId, hiddenUids, viewerProfile]);

  const loadMore = useCallback(async () => {
    const e = eng.current;
    if (e.loadingMore || !e.chunks.length || !computeHasMore()) return;
    const gen = e.gen;
    e.loadingMore = true; setLoadingMore(true);
    try {
      let gained = 0;
      // Hidden/filtered posts can make a fetched page look empty — keep going (bounded) until something shows.
      for (let round = 0; round < 4 && gained < Math.ceil(pageSize / 2) && computeHasMore(); round++) {
        let r = drainMerged(e.chunks, pageSize, e.emitted);
        while (r.needFetch.length) {
          await Promise.all(r.needFetch.map(async ci => {
            const c = e.chunks[ci];
            if (!c.lastDoc) { c.exhausted = true; return; }
            const s = await getDocs(buildQuery(kind, c.authors, tag, pageSize, c.lastDoc));
            if (e.gen !== gen) return;
            const ps = s.docs.map(docToPost).filter(p => !e.known.has(p.id));
            ps.forEach(p => e.known.add(p.id));
            c.buffer.push(...ps);
            if (s.docs.length) c.lastDoc = s.docs[s.docs.length - 1];
            c.exhausted = s.docs.length < pageSize;
          }));
          if (e.gen !== gen) return;
          const more = drainMerged(e.chunks, pageSize - r.out.length, e.emitted);
          r = { out: [...r.out, ...more.out], needFetch: more.needFetch };
        }
        if (e.gen !== gen) return;
        gained += visible(r.out).length;
        if (r.out.length) commit([...rawRef.current, ...r.out]);
        if (!r.out.length && !r.needFetch.length) break;
      }
    } catch (err) {
      if (e.gen === gen) setError(err as Error);
    } finally {
      if (e.gen === gen) { e.loadingMore = false; setLoadingMore(false); setHasMore(computeHasMore()); }
      else e.loadingMore = false;
    }
  }, [kind, tag, pageSize, visible, commit]);

  const flushNew = useCallback(() => {
    const e = eng.current;
    if (!e.pending.size) return;
    const incoming = [...e.pending.values()];
    incoming.forEach(p => e.emitted.add(p.id));
    e.pending = new Map();
    commit(prependNew(rawRef.current, incoming));
    setNewCount(0);
  }, [commit]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  const items = useMemo(() => {
    const base = visible(raw);
    if (!privRaw.length) return base;
    // Access is rule-enforced (follows edge), so isPublic:false on these docs must not hide them here.
    const priv = filterPostsForViewer(filterFeedItems(privRaw.map(p => ({ ...p, isPublic: true })), { viewerId, hiddenUids }), viewerProfile);
    const floor = hasMore && raw.length ? raw[raw.length - 1].timestamp : 0;
    const have = new Set(base.map(p => p.id));
    const extra = priv.filter(p => p.timestamp >= floor && !have.has(p.id));
    return extra.length ? [...base, ...extra].sort(sortDesc) : base;
  }, [raw, visible, privRaw, hasMore, viewerId, hiddenUids, viewerProfile]);
  const isEmpty = !loadingInitial && !error && items.length === 0 && !hasMore;

  return { items, loadMore, hasMore, loadingInitial, loadingMore, newCount, flushNew, refresh, error, isEmpty };
}

// ─── Scroll restoration ───────────────────────────────────────────────────────

export interface ScrollRestorationOptions {
  /** The feed's scroll container (FeedView's `feedScrollRef`). Falls back to the document scroller. */
  scrollRef?: RefObject<HTMLElement | null>;
  /** Flip to true once the list has rendered (e.g. `!loadingInitial`); the restore runs once, on that edge. */
  ready?: boolean;
  /** Items render `data-feed-item-id="<id>"`; restore prefers scrolling that item back to the same offset. */
  itemAttr?: string;
}

interface SavedScroll { top: number; anchorId?: string; anchorOffset?: number; at: number }
const SCROLL_PREFIX = 'plajah:feedscroll:';

/**
 * Remember scroll position per `key` (e.g. 'feed:GLOBAL:for-you') in sessionStorage and restore it when the
 * user comes back (opening a post and pressing back). Saves on scroll (debounced) and on unmount. Restore
 * uses the anchor item (first visible card + its offset) when it is rendered, else the raw scrollTop.
 * Returns manual `save()` / `restore()` for the lead's navigation hooks.
 */
export function useScrollRestoration(key: string, opts: ScrollRestorationOptions = {}) {
  const { scrollRef, ready = true, itemAttr = 'data-feed-item-id' } = opts;
  const restoredKey = useRef<string | null>(null);

  const getEl = useCallback((): HTMLElement | null =>
    scrollRef?.current ?? (typeof document !== 'undefined' ? (document.scrollingElement as HTMLElement | null) : null), [scrollRef]);

  const save = useCallback(() => {
    try {
      const el = getEl(); if (!el) return;
      const box = el.getBoundingClientRect();
      const top = el.scrollTop;
      let anchorId: string | undefined; let anchorOffset: number | undefined;
      const cards = el.querySelectorAll<HTMLElement>(`[${itemAttr}]`);
      for (const c of Array.from(cards)) {
        const r = c.getBoundingClientRect();
        if (r.bottom > box.top + 1) { anchorId = c.getAttribute(itemAttr) ?? undefined; anchorOffset = r.top - box.top; break; }
      }
      const v: SavedScroll = { top, ...(anchorId ? { anchorId, anchorOffset } : {}), at: Date.now() };
      sessionStorage.setItem(SCROLL_PREFIX + key, JSON.stringify(v));
    } catch { /* storage unavailable — best effort */ }
  }, [key, getEl, itemAttr]);

  const restore = useCallback((): boolean => {
    try {
      const raw = sessionStorage.getItem(SCROLL_PREFIX + key); if (!raw) return false;
      const v = JSON.parse(raw) as SavedScroll;
      const el = getEl(); if (!el) return false;
      if (el.scrollTop > 50) return false;                      // user already moved; don't yank
      if (v.anchorId) {
        const a = el.querySelector<HTMLElement>(`[${itemAttr}="${(window as any).CSS?.escape ? CSS.escape(v.anchorId) : v.anchorId}"]`);
        if (a) {
          const box = el.getBoundingClientRect();
          el.scrollTop += a.getBoundingClientRect().top - box.top - (v.anchorOffset ?? 0);
          return true;
        }
      }
      el.scrollTop = v.top;
      return true;
    } catch { return false; }
  }, [key, getEl, itemAttr]);

  // restore once when the list becomes ready (two frames so the cards have laid out)
  useEffect(() => {
    if (!ready || restoredKey.current === key) return;
    restoredKey.current = key;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => { restore(); }); });
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
  }, [ready, restore, key]);

  // save while scrolling (throttled). No save on unmount: by then the container may already be detached
  // and would record scrollTop 0 over the good value.
  useEffect(() => {
    const el = getEl(); if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const target: EventTarget = el === document.scrollingElement ? window : el;
    const on = () => { if (!t) t = setTimeout(() => { t = undefined; save(); }, 120); };
    target.addEventListener('scroll', on, { passive: true });
    return () => { target.removeEventListener('scroll', on); if (t) clearTimeout(t); };
  }, [getEl, save]);

  return { save, restore };
}
