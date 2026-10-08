/**
 * Pure helpers for private-account post gating (no Firebase imports, unit-testable).
 * The Firestore-facing half lives in services/privatePostsService.ts.
 */

export type PostCollectionName = 'posts' | 'private_posts';

export const PRIVATE_POSTS_COLLECTION: PostCollectionName = 'private_posts';

/** Per-author page size for private post reads. */
export const PRIVATE_PAGE_SIZE = 20;
/** Max private authors queried in parallel per call (each is one indexed query + one rules exists()). */
export const PRIVATE_MAX_AUTHORS = 40;
/** Posts moved per batch commit: each post = 1 set + 1 delete = 2 ops (batch cap 500). */
export const MIGRATION_POSTS_PER_BATCH = 100;

/**
 * Which collection should a NEW post by this author be written to?
 * Org DEPARTMENT threads keep their own access model (orgAudience rules) and stay in `posts`.
 */
export function routePostCollection(
  profile: { isPrivate?: boolean | null } | null | undefined,
  post?: { orgAudience?: string | null } | null,
): PostCollectionName {
  if (post?.orgAudience === 'DEPARTMENT') return 'posts';
  return profile?.isPrivate === true ? 'private_posts' : 'posts';
}

/**
 * Authors whose private_posts the viewer may query: followed authors (edge exists), plus self.
 * Anything else would be denied by rules and would fail the whole per-author query, so we
 * never issue it. Result is deduped and capped.
 */
export function readableAuthors(
  authorIds: readonly string[],
  viewerFollowingIds: Iterable<string>,
  viewerUid?: string | null,
  cap: number = PRIVATE_MAX_AUTHORS,
): string[] {
  const following = new Set(viewerFollowingIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of authorIds) {
    if (!id || seen.has(id)) continue;
    if (id === viewerUid || following.has(id)) { seen.add(id); out.push(id); }
    if (out.length >= cap) break;
  }
  return out;
}

/** Decide, for one source doc during migration, whether it must move. Department threads never move. */
export function shouldMovePost(post: { orgAudience?: string | null } | null | undefined): boolean {
  return post?.orgAudience !== 'DEPARTMENT';
}

/** Split post ids into commit-sized batches. */
export function planMigrationBatches<T>(items: readonly T[], perBatch: number = MIGRATION_POSTS_PER_BATCH): T[][] {
  const n = Math.max(1, Math.floor(perBatch));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Same-shape marker key so an interrupted migration resumes (localStorage). */
export const migrationMarkerKey = (uid: string) => `plajah.postVisMigration.${uid}`;
export type MigrationDirection = 'toPrivate' | 'toPublic';
export const parseMigrationMarker = (raw: string | null | undefined): MigrationDirection | null =>
  raw === 'toPrivate' || raw === 'toPublic' ? raw : null;
