/**
 * Private-account post gating (real, server-enforced).
 *
 * WHY A SEPARATE COLLECTION
 *   `posts` read rule is "isPublic != false || owner || admin". The global feed listener has no
 *   `where`, and Firestore rules are not filters: one non-public doc would make the WHOLE list
 *   query fail. So followers-only posts cannot live in `posts`. They live in `private_posts`
 *   (same shape as Post + authorId) and are only ever queried per author.
 *
 * WHY THE RULE IS PROVABLE (firestore.rules, match /private_posts/{postId})
 *   read: owner || admin || exists(/follows/{viewerUid}_{authorId})
 *   A list query `where('authorId','==',X)` pins resource.data.authorId to X for the rules
 *   engine, so the path `follows/{uid}_X` is computable BEFORE any document is read and the
 *   engine can prove every possible result satisfies the rule. An unfiltered, `in`, or
 *   range query on authorId cannot be proven and is rejected outright (fails closed). The
 *   follows edge for a private author can only be created by the author's approval
 *   (follows create rule + follow_requests), so "edge exists" == "approved follower".
 *   Blocking deletes the edge both ways (socialSafetyService.blockUser) -> access ends at once.
 *   Index: private_posts (authorId ASC, timestamp DESC) in firestore.indexes.json.
 *   NOT PROVEN WITHOUT AN EMULATOR: run `firebase emulators:exec` rules tests before deploy.
 *
 * LEAK PATHS COVERED
 *   - posts:        rules deny CREATE of `posts` docs authored by a private account
 *                   (department threads exempt), so every writer must route. `createPost`
 *                   (backendService) routes via routePostCollection. Other direct writers to
 *                   `posts` (e.g. repost/quote in postingService) fail for private accounts.
 *   - feed mirror:  `createPost` skips the `feed` mirror for private authors;
 *                   `migrateAccountPostsVisibility(toPrivate)` deletes the author's existing
 *                   `feed` docs (feed read is `true`, so a mirror would leak the text).
 *                   `migratePostsToFeed` (admin one-off) must skip private authors (guarded).
 *   - search:       there is no post-text search collection; hashtag/search queries hit
 *                   `posts` only, which no longer contains private content once migrated.
 *   - comments:     private_posts/{id}/comments readable by anyone who can read the parent
 *                   (rule uses get() on the parent's authorId -> path-provable). Comments on
 *                   posts that get migrated are NOT copied (other users' comments cannot be
 *                   re-created by the post owner without impersonation); they are deleted
 *                   with the old post. UI copy must say so.
 *   - likes:        likedBy/likesCount live on the doc; `togglePrivatePostLike` below.
 *
 * MIGRATION (setAccountPrivate calls it): copy+delete in batches of 100 posts; idempotent
 * (set with same id, deleting an absent doc is a no-op); resumable (localStorage marker +
 * `resumePendingMigration()`; query always re-reads whatever is still in the source).
 */
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, onSnapshot,
  writeBatch, updateDoc, arrayUnion, arrayRemove, increment, Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Post } from '../types';
import {
  routePostCollection, readableAuthors, shouldMovePost, planMigrationBatches,
  migrationMarkerKey, parseMigrationMarker, PRIVATE_PAGE_SIZE, MIGRATION_POSTS_PER_BATCH,
} from './privatePostsCore';
import type { PostCollectionName, MigrationDirection } from './privatePostsCore';
import { chunkArray, mergeByTimestamp } from './followGraphUtils';

export { routePostCollection, readableAuthors } from './privatePostsCore';
export type { PostCollectionName } from './privatePostsCore';

const toMillis = (t: any): number => {
  if (typeof t === 'number') return t;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  return Number(t) || 0;
};
const mapPrivate = (d: any): Post => ({
  id: d.id, ...d.data(), sourceCollection: 'private_posts', timestamp: toMillis(d.data().timestamp),
} as unknown as Post);

// ─── Routing (write side) ────────────────────────────────────────────────────

/** Is the signed-in user's account private? Fails open (false) on read error. */
export async function isMyAccountPrivate(): Promise<boolean> {
  const u = auth.currentUser;
  if (!u) return false;
  try { return (await getDoc(doc(db, 'users', u.uid))).data()?.isPrivate === true; } catch { return false; }
}

/** Collection a new post by the signed-in user must be written to. */
export async function resolvePostCollectionForMe(post?: { orgAudience?: string | null }): Promise<PostCollectionName> {
  if (post?.orgAudience === 'DEPARTMENT') return 'posts';
  return routePostCollection({ isPrivate: await isMyAccountPrivate() }, post);
}

// ─── Read side ───────────────────────────────────────────────────────────────

/**
 * One page of private posts for the given authors. Only authors the viewer follows (or self)
 * are queried; each is its own `where('authorId','==',X)` query, run in parallel.
 * `cursor` = timestamp (ms) of the last item of the previous page (exclusive).
 */
export async function fetchPrivatePostsForAuthors(
  authorIds: readonly string[],
  viewerFollowingIds: Iterable<string>,
  cursor?: number | null,
  pageSize: number = PRIVATE_PAGE_SIZE,
): Promise<Post[]> {
  const viewer = auth.currentUser?.uid ?? null;
  if (!viewer) return [];
  const authors = readableAuthors(authorIds, viewerFollowingIds, viewer);
  if (!authors.length) return [];
  const lists: Post[][] = [];
  // 10 at a time keeps us far from per-client query concurrency limits.
  for (const group of chunkArray(authors, 10)) {
    const res = await Promise.all(group.map(async (a) => {
      try {
        const q = cursor
          ? query(collection(db, 'private_posts'), where('authorId', '==', a), orderBy('timestamp', 'desc'), startAfter(cursor), limit(pageSize))
          : query(collection(db, 'private_posts'), where('authorId', '==', a), orderBy('timestamp', 'desc'), limit(pageSize));
        return (await getDocs(q)).docs.map(mapPrivate);
      } catch { return [] as Post[]; } // one denied/failed author must not sink the page
    }));
    lists.push(...res);
  }
  return mergeByTimestamp(lists as unknown as { id: string; timestamp: number }[][], pageSize) as unknown as Post[];
}

/** Live variant (one onSnapshot per readable author). Emits merged newest-first, capped at `cap`. */
export function listenPrivatePostsForAuthors(
  authorIds: readonly string[],
  viewerFollowingIds: Iterable<string>,
  callback: (posts: Post[]) => void,
  cap: number = 50,
): Unsubscribe {
  const viewer = auth.currentUser?.uid ?? null;
  const authors = viewer ? readableAuthors(authorIds, viewerFollowingIds, viewer) : [];
  if (!authors.length) { callback([]); return () => {}; }
  const results: Post[][] = authors.map(() => []);
  const ready = authors.map(() => false);
  const emit = () => {
    if (ready.every(Boolean)) callback(mergeByTimestamp(results as unknown as { id: string; timestamp: number }[][], cap) as unknown as Post[]);
  };
  const unsubs = authors.map((a, i) => onSnapshot(
    query(collection(db, 'private_posts'), where('authorId', '==', a), orderBy('timestamp', 'desc'), limit(PRIVATE_PAGE_SIZE)),
    (snap) => { results[i] = snap.docs.map(mapPrivate); ready[i] = true; emit(); },
    () => { ready[i] = true; emit(); },
  ));
  return () => unsubs.forEach(u => u());
}

/** Like toggle for private posts (rules mirror `posts`: likedBy +/- self and likesCount +/-1). */
export async function togglePrivatePostLike(postId: string): Promise<{ liked: boolean } | undefined> {
  const u = auth.currentUser;
  if (!u) return;
  const ref = doc(db, 'private_posts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const liked = ((snap.data().likedBy as string[] | undefined) ?? []).includes(u.uid);
  await updateDoc(ref, liked
    ? { likedBy: arrayRemove(u.uid), likesCount: increment(-1) }
    : { likedBy: arrayUnion(u.uid), likesCount: increment(1) });
  return { liked: !liked };
}

/** Comments path for a post doc: `private_posts/{id}/comments` when sourceCollection says so. */
export const commentsCollectionPath = (postId: string, sourceCollection?: string) =>
  `${sourceCollection === 'private_posts' ? 'private_posts' : 'posts'}/${postId}/comments`;

// ─── Public <-> private migration ────────────────────────────────────────────

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (): Store | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export interface MigrationResult { moved: number; feedDeleted: number; done: boolean }

async function deleteComments(srcCol: string, postId: string): Promise<void> {
  // Post-owner comment-delete is allowed by rules while the parent still exists.
  try {
    const snap = await getDocs(collection(db, srcCol, postId, 'comments'));
    for (const group of planMigrationBatches(snap.docs, 400)) {
      const b = writeBatch(db);
      group.forEach(d => b.delete(d.ref));
      await b.commit();
    }
  } catch { /* orphans are unreadable once the parent is gone (rules get() fails) */ }
}

/**
 * Move every post authored by `uid` between `posts` and `private_posts`. Safe to call repeatedly
 * and after a crash. Call AFTER flipping users/{uid}.isPrivate when going private (so new posts
 * already route privately) and AFTER flipping it to false when going public.
 */
export async function migrateAccountPostsVisibility(uid: string, toPrivate: boolean): Promise<MigrationResult> {
  const result: MigrationResult = { moved: 0, feedDeleted: 0, done: false };
  if (!uid || auth.currentUser?.uid !== uid) return result;
  const direction: MigrationDirection = toPrivate ? 'toPrivate' : 'toPublic';
  const s = store();
  try { s?.setItem(migrationMarkerKey(uid), direction); } catch { /* resumability is best-effort */ }
  const src = toPrivate ? 'posts' : 'private_posts';
  const dst = toPrivate ? 'private_posts' : 'posts';

  let guard = 0;
  // Each pass re-queries the source: whatever moved is gone, so progress is monotonic.
  // Department threads that must stay put are skipped via `skip`, so the loop cannot spin on them.
  const skip = new Set<string>();
  while (guard++ < 200) {
    const snap = await getDocs(query(collection(db, src), where('authorId', '==', uid), limit(MIGRATION_POSTS_PER_BATCH + skip.size)));
    const movable = snap.docs.filter(d => {
      if (!shouldMovePost(d.data() as any)) { skip.add(d.id); return false; }
      return !skip.has(d.id);
    }).slice(0, MIGRATION_POSTS_PER_BATCH);
    if (movable.length === 0) { result.done = true; break; }
    for (const d of movable) await deleteComments(src, d.id);
    const batch = writeBatch(db);
    for (const d of movable) {
      const data = d.data();
      batch.set(doc(db, dst, d.id), { ...data, authorId: uid });
      batch.delete(d.ref);
    }
    await batch.commit();
    result.moved += movable.length;
  }

  if (toPrivate) {
    // `feed` is world-readable and mirrors post text: purge this author's mirrors.
    try {
      const fsnap = await getDocs(query(collection(db, 'feed'), where('authorId', '==', uid)));
      for (const group of planMigrationBatches(fsnap.docs, 400)) {
        const b = writeBatch(db);
        group.forEach(d => b.delete(d.ref));
        await b.commit();
        result.feedDeleted += group.length;
      }
    } catch { /* retried on resume */ result.done = false; }
  }
  if (result.done) { try { s?.removeItem(migrationMarkerKey(uid)); } catch { /* ignore */ } }
  return result;
}

/** Call once on sign-in: finishes a migration that was interrupted (tab closed, offline). */
export async function resumePendingMigration(): Promise<MigrationResult | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  let raw: string | null = null;
  try { raw = store()?.getItem(migrationMarkerKey(uid)) ?? null; } catch { /* ignore */ }
  const dir = parseMigrationMarker(raw);
  if (!dir) return null;
  return migrateAccountPostsVisibility(uid, dir === 'toPrivate');
}
