/**
 * Student walls — the "make your own" loop's missing half.
 *
 * Blueprint Part 2B: *"every lesson ends with a Fabula assignment ... published to
 * Reello with the lesson tag → a visible student wall."*
 *
 * The Film / Photo / Art / Chora schools already publish ~190 lesson assignments
 * tagged `filmschool` · `photoschool` · `artschool` · `choraschool`, but nothing in
 * the app read those tags back, so submitted work went nowhere. This module is the
 * read side: given a tag, return the published student posts carrying it.
 *
 * Query shape is deliberately **single-field** — `where('tags','array-contains',tag)`
 * with no `orderBy` and no second `where`. That is servable from the automatic
 * single-field index, so no composite index has to be declared. Ordering happens
 * client-side over a capped result set.
 */

import { collection, query, where, limit as fsLimit, getDocs } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db } from './firebase';
import type { Post } from '../types';

/** The curriculum tags the schools publish under. */
export const SCHOOL_WALL_TAGS = ['filmschool', 'photoschool', 'artschool', 'choraschool'] as const;
export type SchoolWallTag = typeof SCHOOL_WALL_TAGS[number];

/** Display metadata for the known school tags. Unknown tags degrade to a generic label. */
export const SCHOOL_WALL_META: Record<string, { label: string; blurb: string }> = {
  filmschool:  { label: 'Film School',        blurb: 'Assignments from the Taleo Film School' },
  photoschool: { label: 'Photography School', blurb: 'Assignments from the Photography track' },
  artschool:   { label: 'Art School',         blurb: 'Assignments from the Art track' },
  choraschool: { label: 'Chora School',       blurb: 'Assignments from the Chora music school' },
};

export function wallLabelFor(tag: string): string {
  return SCHOOL_WALL_META[tag]?.label ?? tag.replace(/school$/i, ' school').replace(/^\w/, c => c.toUpperCase());
}

const WALL_FETCH_LIMIT = 60;

function toMillis(value: any): number {
  if (typeof value === 'number') return value;
  if (value && typeof value.toMillis === 'function') {
    try { return value.toMillis(); } catch { return 0; }
  }
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function mapPost(id: string, data: any): Post {
  return { ...data, id, sourceCollection: 'posts', timestamp: toMillis(data?.timestamp) } as Post;
}

/**
 * Expired "Today" posts must never surface on a wall either — a Today tagged into a
 * lesson is still ephemeral. Kept local so studentWall has no dependency on todayPosts.
 */
function isVisible(p: Post, now: number): boolean {
  if (p.timestamp <= 0) return false;
  if (p.isToday && typeof p.expiresAt === 'number' && p.expiresAt <= now) return false;
  return true;
}

export interface StudentWallOptions {
  /** Cap results (default 60). */
  max?: number;
  /** Restrict to one lesson within the school, when lessons tag themselves further. */
  lessonTag?: string;
}

/**
 * Published student work for `tag`, newest first.
 * Returns `[]` on any failure — a broken wall must never break the surface hosting it.
 */
export async function fetchStudentWall(tag: string, options: StudentWallOptions = {}): Promise<Post[]> {
  if (!tag) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'posts'),
      where('tags', 'array-contains', tag),
      fsLimit(Math.max(1, options.max ?? WALL_FETCH_LIMIT)),
    ));
    const now = Date.now();
    return snap.docs
      .map(d => mapPost(d.id, d.data()))
      .filter(p => isVisible(p, now))
      .filter(p => !options.lessonTag || (p.tags || []).includes(options.lessonTag))
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    console.warn(`[studentWall] fetch failed for "${tag}":`, (e as Error)?.message?.slice(0, 200));
    return [];
  }
}

/** Realtime variant of {@link fetchStudentWall}. */
export function listenToStudentWall(
  tag: string,
  callback: (posts: Post[]) => void,
  options: StudentWallOptions = {},
): () => void {
  if (!tag) { callback([]); return () => {}; }
  try {
    return onSnapshot(
      query(
        collection(db, 'posts'),
        where('tags', 'array-contains', tag),
        fsLimit(Math.max(1, options.max ?? WALL_FETCH_LIMIT)),
      ),
      snap => {
        const now = Date.now();
        callback(
          snap.docs
            .map(d => mapPost(d.id, d.data()))
            .filter(p => isVisible(p, now))
            .filter(p => !options.lessonTag || (p.tags || []).includes(options.lessonTag))
            .sort((a, b) => b.timestamp - a.timestamp),
        );
      },
      e => {
        console.warn(`[studentWall] listen failed for "${tag}":`, (e as Error)?.message?.slice(0, 200));
        callback([]);
      },
    );
  } catch {
    return () => {};
  }
}

/**
 * Counts per school tag, for a discovery row that wants to show only live walls.
 * One small query per tag; all four run in parallel and failures resolve to 0.
 */
export async function fetchWallCounts(tags: readonly string[] = SCHOOL_WALL_TAGS): Promise<Record<string, number>> {
  const entries = await Promise.all(
    tags.map(async tag => [tag, (await fetchStudentWall(tag, { max: WALL_FETCH_LIMIT })).length] as const),
  );
  return Object.fromEntries(entries);
}
