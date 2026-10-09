// partySync — the PURE math behind synchronized parties (watch / read / listen).
//
// No Firebase imports: everything here is deterministic and unit-tested (tests/partySync.test.ts).
// services/partyService.ts re-exports these so existing imports keep working.
//
//   • computeFollowTarget      — where the host's playhead is right now (local-receipt anchor)
//   • computeServerFollowTarget — same, anchored on the server write time + a clock-offset estimate
//   • refineClockOffset        — server-minus-local clock offset from a probe write's bounds
//   • planDriftCorrection      — playbackRate nudge (0.95–1.05) for small drift, hard seek >3s w/ backoff
//   • hostLiveness             — 'live' | 'reconnecting' (>15s silent) | 'gone' (>60s silent)
//   • pickClaimant             — who may take over the remote when the host is gone
//   • isPartyDiscoverable      — public discovery filter (active + public + fresh heartbeat)

export interface FollowResult { targetPositionSec: number; shouldPlay: boolean }

/** Host heartbeat cadence (ms). Followers judge liveness against the thresholds below. */
export const PARTY_HEARTBEAT_MS = 5_000;
/** Host silent this long → followers show "Host reconnecting…" and pause. */
export const HOST_RECONNECTING_MS = 15_000;
/** Host silent this long → a co-host (or longest-present viewer when openRemote) may claim the remote. */
export const HOST_GONE_MS = 60_000;
/** A party is listed publicly only while its host heartbeat is this fresh. */
export const DISCOVERY_FRESH_MS = 45_000;

/** Hard-seek threshold: below this we nudge playbackRate instead of seeking. */
export const HARD_SEEK_THRESHOLD_SEC = 3;
/** After a hard seek, don't hard-seek again for this long (decoder settles, avoids seek loops). */
export const SEEK_BACKOFF_MS = 4_000;
/** Drift inside this band is "in sync" — rate goes back to 1. */
export const IN_SYNC_SEC = 0.15;
export const MIN_RATE = 0.95;
export const MAX_RATE = 1.05;

interface PlaybackLike { isPlaying?: boolean; positionSec?: number }

/**
 * Local-receipt anchor: the audience anchors on the LOCAL time it received a state. While the host
 * is playing the target advances in real time; a small fudge absorbs one-way propagation latency.
 * Used when no server-clock estimate is available yet (first snapshot on join).
 */
export function computeFollowTarget(
  playback: PlaybackLike | null | undefined,
  receiptLocalMs: number,
  nowLocalMs: number,
  latencyFudgeSec = 0.4,
): FollowResult {
  if (!playback) return { targetPositionSec: 0, shouldPlay: false };
  const playing = !!playback.isPlaying;
  const elapsed = playing ? Math.max(0, (nowLocalMs - receiptLocalMs) / 1000) : 0;
  const fudge = playing ? latencyFudgeSec : 0;
  return { targetPositionSec: Math.max(0, (playback.positionSec || 0) + elapsed + fudge), shouldPlay: playing };
}

/**
 * Server anchor: elapsed = (local now + offset) − server write time. Exact for late joiners (a state
 * written 40s ago is extrapolated 40s, not 0.4s) as long as the clock offset is known. Falls back to
 * the local-receipt anchor when the offset or the server write time is unknown.
 */
export function computeServerFollowTarget(
  playback: PlaybackLike | null | undefined,
  opts: { updatedAtServerMs?: number | null; offsetMs?: number | null; receiptLocalMs: number; nowLocalMs: number },
): FollowResult {
  if (!playback) return { targetPositionSec: 0, shouldPlay: false };
  const { updatedAtServerMs, offsetMs, receiptLocalMs, nowLocalMs } = opts;
  if (!updatedAtServerMs || offsetMs == null || !Number.isFinite(offsetMs)) {
    return computeFollowTarget(playback, receiptLocalMs, nowLocalMs);
  }
  const playing = !!playback.isPlaying;
  const nowServer = nowLocalMs + offsetMs;
  // Clamp: a slightly-ahead estimate must never move the target backwards past the written position.
  const elapsed = playing ? Math.max(0, (nowServer - updatedAtServerMs) / 1000) : 0;
  return { targetPositionSec: Math.max(0, (playback.positionSec || 0) + elapsed), shouldPlay: playing };
}

/** Legacy threshold check — kept for callers that only need a yes/no. */
export function shouldResync(localPositionSec: number, targetPositionSec: number, thresholdSec = 1.25): boolean {
  return Math.abs((localPositionSec || 0) - targetPositionSec) > thresholdSec;
}

/**
 * Clock offset (server − local) from one probe: we wrote a serverTimestamp at local `sendLocalMs`,
 * read it back at local `receiptLocalMs`, and the server stamped `serverMs`. The true offset lies in
 * [serverMs − receipt, serverMs − send]; the midpoint has error ≤ RTT/2. Samples with a tighter
 * bracket (smaller RTT) are better, so we keep whichever sample has the smallest RTT.
 */
export interface ClockOffsetEstimate { offsetMs: number; rttMs: number }
export function refineClockOffset(
  prev: ClockOffsetEstimate | null,
  sample: { sendLocalMs: number; receiptLocalMs: number; serverMs: number },
): ClockOffsetEstimate | null {
  const { sendLocalMs, receiptLocalMs, serverMs } = sample;
  if (!Number.isFinite(sendLocalMs) || !Number.isFinite(receiptLocalMs) || !Number.isFinite(serverMs) || !serverMs) return prev;
  const rtt = receiptLocalMs - sendLocalMs;
  if (rtt < 0 || rtt > 30_000) return prev;                  // nonsense / stalled probe
  const next = { offsetMs: serverMs - (sendLocalMs + rtt / 2), rttMs: rtt };
  if (!prev) return next;
  // Prefer the tighter bracket, but let estimates age: a sample within 1.5× of the best RTT replaces
  // it (clocks drift, and an old lucky sample shouldn't pin us forever).
  return next.rttMs <= prev.rttMs * 1.5 ? next : prev;
}

export type DriftAction =
  | { kind: 'none'; rate: 1 }
  | { kind: 'rate'; rate: number }
  | { kind: 'seek'; seekTo: number; rate: 1 };

/**
 * What should the local player do about drift? Positive drift = we're behind the host.
 *  • paused host: seek only when off by >0.25s (no rate games while paused)
 *  • |drift| ≤ 0.15s: in sync → rate 1
 *  • |drift| < 3s: nudge rate proportionally, clamped to 0.95–1.05 (inaudible, no seek stutter)
 *  • |drift| ≥ 3s: hard seek — unless we hard-seeked within SEEK_BACKOFF_MS (then nudge at the clamp)
 */
export function planDriftCorrection(
  localPositionSec: number,
  targetPositionSec: number,
  opts: { playing: boolean; nowMs: number; lastHardSeekMs?: number | null },
): DriftAction {
  const drift = targetPositionSec - (localPositionSec || 0);
  const abs = Math.abs(drift);
  const inBackoff = !!opts.lastHardSeekMs && opts.nowMs - opts.lastHardSeekMs < SEEK_BACKOFF_MS;
  if (!opts.playing) {
    if (abs > 0.25 && !inBackoff) return { kind: 'seek', seekTo: Math.max(0, targetPositionSec), rate: 1 };
    return { kind: 'none', rate: 1 };
  }
  if (abs <= IN_SYNC_SEC) return { kind: 'none', rate: 1 };
  if (abs >= HARD_SEEK_THRESHOLD_SEC && !inBackoff) return { kind: 'seek', seekTo: Math.max(0, targetPositionSec), rate: 1 };
  // ~10% of the drift per second of correction, clamped → 1s behind = 1.05 (closes in ~20s).
  const rate = Math.min(MAX_RATE, Math.max(MIN_RATE, 1 + drift * 0.1));
  return { kind: 'rate', rate: Math.round(rate * 1000) / 1000 };
}

export type HostLiveness = 'live' | 'reconnecting' | 'gone';

/**
 * Host liveness from the last time WE (on our own clock) saw the host's heartbeat change, so no
 * cross-device clock agreement is needed. When we also have a server-time estimate, a heartbeat
 * that was already stale when we first saw it (late join into an orphaned party) counts as stale.
 */
export function hostLiveness(opts: {
  lastChangeLocalMs: number;
  nowLocalMs: number;
  heartbeatServerMs?: number | null;
  offsetMs?: number | null;
}): HostLiveness {
  const { lastChangeLocalMs, nowLocalMs, heartbeatServerMs, offsetMs } = opts;
  let silentMs = Math.max(0, nowLocalMs - (Number.isFinite(lastChangeLocalMs) ? lastChangeLocalMs : nowLocalMs));
  if (heartbeatServerMs && offsetMs != null && Number.isFinite(offsetMs)) {
    silentMs = Math.max(silentMs, nowLocalMs + offsetMs - heartbeatServerMs);
  }
  if (silentMs > HOST_GONE_MS) return 'gone';
  if (silentMs > HOST_RECONNECTING_MS) return 'reconnecting';
  return 'live';
}

export interface ClaimViewer { uid: string; joinedAtMs: number; fresh: boolean }

/**
 * When the host is gone, exactly one person should claim the remote (everyone else waits):
 *   1. the first co-host (in coHostIds order) who is still present, else
 *   2. if the party has openRemote, the longest-present viewer (earliest joinedAt; uid tiebreak).
 * Returns that uid, or null (nobody eligible → party stays paused until the host returns).
 */
export function pickClaimant(opts: {
  hostId: string;
  coHostIds?: string[] | null;
  openRemote?: boolean | null;
  viewers: ClaimViewer[];
}): string | null {
  const present = opts.viewers.filter(v => v.fresh && v.uid && v.uid !== opts.hostId);
  const presentIds = new Set(present.map(v => v.uid));
  for (const id of opts.coHostIds || []) if (presentIds.has(id)) return id;
  if (!opts.openRemote || !present.length) return null;
  const sorted = [...present].sort((a, b) => (a.joinedAtMs - b.joinedAtMs) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  return sorted[0].uid;
}

/** Public discovery filter: active, public, and the host heartbeat is fresh (server-time compare). */
export function isPartyDiscoverable(
  p: { isActive?: boolean; visibility?: string; hostHeartbeatMs?: number },
  nowServerMs: number,
  freshMs = DISCOVERY_FRESH_MS,
): boolean {
  return !!p.isActive && p.visibility === 'public' && !!p.hostHeartbeatMs && nowServerMs - p.hostHeartbeatMs < freshMs;
}

/** Countdown seconds remaining (ceil) until a server-time instant, or 0 when it has passed. */
export function countdownRemaining(endsAtServerMs: number | null | undefined, nowLocalMs: number, offsetMs: number | null | undefined): number {
  if (!endsAtServerMs) return 0;
  const nowServer = nowLocalMs + (offsetMs ?? 0);
  const left = endsAtServerMs - nowServer;
  return left > 0 ? Math.min(9, Math.ceil(left / 1000)) : 0;
}

/** Strip a party content blob down to what may live on a PUBLIC doc — no playable URLs/ids. */
export function publicPartyContent<T extends Record<string, any>>(c: T): { type: any; id: string; title?: string; thumbnail?: string; totalPages?: number } {
  const out: any = { type: c.type, id: String(c.id ?? '') };
  if (typeof c.title === 'string' && c.title) out.title = c.title.slice(0, 200);
  if (typeof c.thumbnail === 'string' && c.thumbnail) out.thumbnail = c.thumbnail;
  if (typeof c.totalPages === 'number' && Number.isFinite(c.totalPages)) out.totalPages = c.totalPages;
  return out;
}
