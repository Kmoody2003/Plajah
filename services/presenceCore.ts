// presenceCore — pure, firebase-free staleness logic shared by usePresence (presence/{key}/here)
// and roomService members (rooms/{id}/members).
//
// The problem it solves: heartbeats are stamped by the SERVER (serverTimestamp), but readers
// only have their own LOCAL clock, and the two can disagree by minutes. Comparing a writer's
// Date.now() against a reader's Date.now() (the old approach) shows ghosts or hides real people
// whenever either device clock is off.
//
// Approach: for each member we remember the LOCAL time at which we last saw their server
// heartbeat value CHANGE. A member is fresh while that change happened less than staleMs ago on
// our own clock — skew-free, because both instants are measured by the same clock. For the very
// first observation of a member (we have no "change" yet) we age the heartbeat against our best
// estimate of server time: localNow + offset, where offset is sampled from our own heartbeat
// (serverHeartbeat - localWriteTime) when we publish one, else 0.

export const STALE_MS = 70_000;      // drop members not heard from in 70s
export const HEARTBEAT_MS = 25_000;  // writers refresh every 25s
export const EXPIRE_MS = 10 * 60_000; // expireAt horizon for the Firestore TTL policy
export const REFILTER_MS = 10_000;   // readers re-evaluate staleness without new snapshots

export interface HeartbeatObservation {
  id: string;
  /** Server heartbeat in ms (Timestamp.toMillis()), or null while a serverTimestamp is pending. */
  heartbeatMs: number | null;
  /** Legacy writer-clock ms (old docs without a server heartbeat). */
  legacyTs?: number | null;
}

interface Seen { value: string; localAt: number }

/** Accepts a Firestore Timestamp, Date, number, or {seconds,nanoseconds}; returns ms or null. */
export function toMillisLoose(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const anyV = v as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof anyV.toMillis === 'function') { try { return anyV.toMillis(); } catch { return null; } }
  if (typeof anyV.seconds === 'number') return anyV.seconds * 1000 + Math.floor((anyV.nanoseconds || 0) / 1e6);
  return null;
}

export class StaleTracker {
  private seen = new Map<string, Seen>();
  private offset: number | null = null; // serverMs - localMs
  private lastOwnHb: number | null = null;

  constructor(private readonly staleMs: number = STALE_MS) {}

  /**
   * Record a clock sample from OUR OWN heartbeat doc once the server has stamped it
   * (snapshot without pending writes). Only samples when the server value changed since the
   * last sample, so a failed/stale write never pairs an old server time with a new local time.
   */
  noteOwnHeartbeat(serverHeartbeatMs: number | null, localWriteMs: number): void {
    if (serverHeartbeatMs == null || !localWriteMs) return;
    if (this.lastOwnHb === serverHeartbeatMs) return;
    this.lastOwnHb = serverHeartbeatMs;
    this.offset = serverHeartbeatMs - localWriteMs;
  }

  /** Current server-minus-local estimate (null until sampled). */
  get clockOffset(): number | null { return this.offset; }

  estimateServerNow(localNow: number): number { return localNow + (this.offset ?? 0); }

  /** Feed the full current member list (one snapshot). Members absent from it are forgotten. */
  observe(list: HeartbeatObservation[], localNow: number): void {
    const present = new Set<string>();
    for (const o of list) {
      present.add(o.id);
      const value = o.heartbeatMs != null ? `hb:${o.heartbeatMs}`
        : o.legacyTs != null ? `ts:${o.legacyTs}`
        : 'pending';
      const prev = this.seen.get(o.id);
      if (prev && prev.value === value) continue;
      let localAt = localNow;
      if (!prev) {
        // First sight: carry the heartbeat's age over so an hours-old ghost is stale at once.
        let age = 0;
        if (o.heartbeatMs != null) age = this.estimateServerNow(localNow) - o.heartbeatMs;
        else if (o.legacyTs != null) age = localNow - o.legacyTs; // best effort: writer clock
        localAt = localNow - Math.max(0, age);
      }
      this.seen.set(o.id, { value, localAt });
    }
    for (const id of [...this.seen.keys()]) if (!present.has(id)) this.seen.delete(id);
  }

  isFresh(id: string, localNow: number): boolean {
    const s = this.seen.get(id);
    return !!s && localNow - s.localAt < this.staleMs;
  }

  freshIds(localNow: number): Set<string> {
    const out = new Set<string>();
    for (const [id, s] of this.seen) if (localNow - s.localAt < this.staleMs) out.add(id);
    return out;
  }
}
