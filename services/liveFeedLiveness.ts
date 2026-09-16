/**
 * liveFeedLiveness — the ONE answer to "is this live_feed actually live right now?"
 *
 * THE BUG THIS FIXES: a live_feed is created with status 'LIVE' and only marked 'ENDED' by an explicit
 * end call (endLiveDiscovery). If the broadcaster's tab or app closes or crashes first, that call never
 * runs, so the doc stays 'LIVE' forever and the stream shows as on-air across the Live Hub, LiveTV+,
 * the EPG, profiles, and the Master Control multiview — long after it ended. An ended stream must never
 * report as live; it's a replay.
 *
 * THE FIX: liveness is not "status isn't ENDED" — it's "the broadcaster is still here." While a stream
 * runs, the broadcaster heartbeats `lastActiveAt` (see liveStreamService.heartbeatLiveDiscovery). A feed
 * is live only if that heartbeat is recent. When the broadcaster disappears the heartbeats stop and the
 * feed goes stale on its own — no cleanup write required, and it self-heals for orphans nobody can end.
 *
 * Legacy feeds (published before heartbeats, or by entry points that don't heartbeat) have no
 * `lastActiveAt`; for those we fall back to the start `timestamp` with a generous session cap, so the
 * OLD orphans that prompted this stop showing immediately while a genuinely long stream isn't cut off.
 *
 * Every "what's live now" reader must use this instead of checking status directly.
 */

/** Heartbeat interval the broadcaster should use (leave headroom under the stale window). */
export const HEARTBEAT_INTERVAL_MS = 45 * 1000;
/** A heartbeat older than this = the broadcaster is gone → not live. Tolerates timer throttling. */
export const HEARTBEAT_STALE_MS = 3 * 60 * 1000;
/** No-heartbeat legacy feeds: treated as live only within this long of their start. */
export const LEGACY_MAX_LIVE_MS = 3 * 60 * 60 * 1000;

/** Coerce a Firestore Timestamp | millis | ISO string to millis. 0 when absent/unparseable. */
function toMillis(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch { return 0; } }
  if (typeof v.seconds === 'number') return v.seconds * 1000 + (typeof v.nanoseconds === 'number' ? Math.floor(v.nanoseconds / 1e6) : 0);
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; }
  return 0;
}

/** A minimal shape — accepts a LiveFeed or any doc carrying these fields. */
export interface LivenessFields {
  status?: string;
  lastActiveAt?: any;
  timestamp?: any;
  endedAt?: any;
}

/**
 * Is this feed genuinely live right now? Terminal status wins; otherwise a recent heartbeat, else a
 * recent start for legacy feeds. A doc with no timing info at all (a just-created optimistic write whose
 * serverTimestamp hasn't resolved) is given the benefit of the doubt so the broadcaster's own view
 * doesn't flicker — only real, timestamped, stale feeds are ruled out.
 */
export function isFeedLive(feed: LivenessFields | null | undefined, now: number = Date.now()): boolean {
  if (!feed) return false;
  if (feed.status === 'ENDED' || feed.status === 'OFFLINE') return false;

  const hb = toMillis(feed.lastActiveAt);
  if (hb > 0) return now - hb <= HEARTBEAT_STALE_MS;

  const started = toMillis(feed.timestamp);
  if (started > 0) return now - started <= LEGACY_MAX_LIVE_MS;

  // No heartbeat and no start time — a pending optimistic write. Don't call it ended.
  return true;
}

/** Filter to the feeds that are actually live now. */
export function filterLiveFeeds<T extends LivenessFields>(feeds: T[], now: number = Date.now()): T[] {
  return (feeds || []).filter(f => isFeedLive(f, now));
}
