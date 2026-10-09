// Embargo = release-at-a-time, handled the way album and video releases are: the record stays where it is and every READER
// compares the date. Nothing flips a flag at release time, so there is no scheduler, no cron key, and a release can never be
// late. The cost of that design is that EVERY place that lists or opens public articles must apply `isEmbargoed`; the guard
// test (tests/journalistEmbargo.test.ts) fails if a known reader stops referencing this module.
//
// Pure + dependency-free: imported by the browser, routes/articleFeeds.ts and server.ts.

export interface EmbargoFields { embargoUntil?: unknown; status?: string; isPublic?: boolean; authorId?: string }

/** Firestore Timestamp | number | numeric string (REST integerValue) -> epoch ms, or 0. */
export function embargoMs(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  const t = v as { toMillis?: () => number; seconds?: number } | null | undefined;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (t && typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}

/** True while the article must stay hidden from the public. */
export const isEmbargoed = (a: EmbargoFields | null | undefined, now = Date.now()): boolean => {
  const until = embargoMs(a?.embargoUntil);
  return until > now;
};

/** Public readers: hide embargoed items. The author (and only the author) keeps seeing their own. */
export const visibleToReader = (a: EmbargoFields | null | undefined, viewerUid?: string | null, now = Date.now()): boolean =>
  !isEmbargoed(a, now) || (!!viewerUid && !!a?.authorId && a.authorId === viewerUid);

/** SCHEDULED is only true while the embargo is still in the future; afterwards the article simply is PUBLISHED. */
export const effectiveStatus = <S extends string | undefined>(a: EmbargoFields & { status?: S }, now = Date.now()): S | 'PUBLISHED' =>
  (a.status === 'SCHEDULED' && !isEmbargoed(a, now) ? 'PUBLISHED' : a.status) as S | 'PUBLISHED';
