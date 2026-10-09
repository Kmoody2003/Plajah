// Scheduled content (albums, books, movies, videos) is released by COMPARISON, not by a job: the doc carries `isScheduled` +
// `releaseDate` (ms) and every reader hides it while `releaseDate > now`. Same design as services/journalist/embargo.ts, and with
// the same weak point: EVERY place that lists or opens public videos must apply this helper. tests/videoScheduling.test.ts fails
// if a known reader stops referencing it. The server sweep (services/releases/releaseAnnouncer.ts) only ANNOUNCES the release.
//
// Pure + dependency-free: imported by the browser and by server routes.

export interface ReleaseFields { isScheduled?: boolean; releaseDate?: unknown; ownerId?: string; isPremiere?: boolean }

/** Firestore Timestamp | number | numeric string (REST integerValue) -> epoch ms, or 0. */
export function releaseMs(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  const t = v as { toMillis?: () => number; seconds?: number } | null | undefined;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (t && typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}

/**
 * True while the item is scheduled and its release time has not arrived. Released exactly AT releaseDate.
 * Premieres reuse isScheduled/releaseDate for their start time (services/premiereService.ts) but are PUBLIC beforehand: the
 * countdown page is the point. They are never hidden here.
 */
export const isFutureRelease = (d: ReleaseFields | null | undefined, now = Date.now()): boolean =>
  !!d && d.isPremiere !== true && d.isScheduled === true && releaseMs(d.releaseDate) > now;

/** Public readers: hide not-yet-released items. The owner (and only the owner) keeps seeing their own. */
export const visibleToViewer = (d: ReleaseFields | null | undefined, viewerUid?: string | null, now = Date.now()): boolean =>
  !isFutureRelease(d, now) || (!!viewerUid && !!d?.ownerId && d.ownerId === viewerUid);

/** Array form for list readers. */
export const filterReleased = <T extends ReleaseFields>(items: T[], viewerUid?: string | null, now = Date.now()): T[] =>
  items.filter(i => visibleToViewer(i, viewerUid, now));
