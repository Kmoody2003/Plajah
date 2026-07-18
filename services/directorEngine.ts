/**
 * directorEngine — the auto-director decision engine for Smart Director.
 *
 * It answers exactly one question, repeatedly: given how much is happening on
 * each camera right now, which feed should be on PROGRAM? It is fed per-feed
 * ACTIVITY scores (0..1, from the MotionScorer below — canvas inter-frame pixel
 * difference), the current shared DirectionState, and the production's timing
 * settings, and returns a switch decision or null (leave it alone).
 *
 * Heuristics (broadcast-director instincts, encoded):
 *   • MANUAL mode  → the engine stands down entirely (returns null).
 *   • Min shot     → never cut away from the current program before minShotMs.
 *   • Cooldown     → never switch more often than cooldownMs (rate limit).
 *   • Best feed    → among eligible feeds that AREN'T the current program, pick
 *                    the one with the highest SMOOTHED activity (EMA — a single
 *                    hot frame shouldn't yank the show around).
 *   • Hysteresis   → only switch if the challenger beats the incumbent by a real
 *                    margin, so two near-equal cameras don't flip-flop.
 *   • Cold open    → if nothing is on program yet, take the most active feed
 *                    immediately (min-shot/cooldown don't apply to an empty PGM).
 *
 * `decideProgram()` is a PURE function over already-smoothed scores. The
 * `DirectorEngine` class wraps it, owning the EMA smoothing state across ticks —
 * use the class from the UI; use the pure function in tests.
 */

import type { ContributorRole, DirectionState, ProductionSettings } from './smartDirectorService';

// ─── Inputs / outputs ─────────────────────────────────────────────────────────

export interface FeedActivity {
  feedId: string;
  /** Instantaneous activity this tick, 0..1 (from MotionScorer). */
  activityScore: number;
  role: ContributorRole;
  /** ms timestamp this feed was last confirmed live/on (recency tiebreak). */
  lastOnAt?: number;
  /** Whether this feed is eligible for PROGRAM (connected + a camera). */
  active?: boolean;
}

export interface Decision {
  programFeedId: string;
  reason: string;
}

export interface DecideOptions {
  /** Challenger must beat the incumbent's smoothed score by at least this much
   *  (absolute, 0..1) before a switch is allowed. Default 0.06. */
  hysteresis?: number;
  /** Feeds below this smoothed activity are ignored as switch targets unless the
   *  program is empty. Default 0.02. */
  activityFloor?: number;
}

const DEFAULT_HYSTERESIS = 0.06;
const DEFAULT_ACTIVITY_FLOOR = 0.02;

/** Only these roles can hold PROGRAM. Commentators/scorekeepers contribute audio
 *  and data, not the live picture, so they're never auto-taken. */
function isProgramEligible(a: FeedActivity): boolean {
  if (a.active === false) return false;
  return a.role === 'camera' || a.role === 'correspondent';
}

// ─── Pure decision function ───────────────────────────────────────────────────

/**
 * @param smoothed   feeds with their SMOOTHED activity in `activityScore`
 * @param direction  current shared direction state
 * @param settings   min-shot / cooldown timing
 * @param now        ms clock (Date.now())
 * @returns a switch Decision, or null to leave PROGRAM unchanged.
 */
export function decideProgram(
  smoothed: FeedActivity[],
  direction: DirectionState,
  settings: ProductionSettings,
  now: number,
  opts: DecideOptions = {},
): Decision | null {
  // Manual override: the human is driving.
  if (direction.mode === 'MANUAL') return null;

  const hysteresis = opts.hysteresis ?? DEFAULT_HYSTERESIS;
  const floor = opts.activityFloor ?? DEFAULT_ACTIVITY_FLOOR;

  const eligible = smoothed.filter(isProgramEligible);
  if (eligible.length === 0) return null;

  const current = eligible.find(f => f.feedId === direction.programFeedId) ?? null;
  const currentScore = current?.activityScore ?? 0;

  // Best challenger that isn't the current program.
  const challengers = eligible.filter(f => f.feedId !== direction.programFeedId);

  // Cold open: nothing valid on program → take the most active eligible feed now.
  const programMissing =
    !direction.programFeedId ||
    !eligible.some(f => f.feedId === direction.programFeedId);
  if (programMissing) {
    const best = pickBest(eligible);
    if (!best) return null;
    return { programFeedId: best.feedId, reason: 'cold-open: first live camera' };
  }

  // Timing gates — only apply once a shot is actually up.
  const sinceSwitch = now - (direction.lastSwitchAt || 0);
  if (sinceSwitch < settings.minShotMs) return null;   // hold the minimum shot
  if (sinceSwitch < settings.cooldownMs) return null;  // rate limit

  const best = pickBest(challengers);
  if (!best) return null;
  if (best.activityScore < floor) return null;                       // nothing worth cutting to
  if (best.activityScore <= currentScore + hysteresis) return null;  // not clearly better

  return {
    programFeedId: best.feedId,
    reason: `activity ${best.activityScore.toFixed(2)} > program ${currentScore.toFixed(2)} (+${hysteresis})`,
  };
}

/** Highest smoothed activity; ties broken by least-recently-on (fairer rotation). */
function pickBest(feeds: FeedActivity[]): FeedActivity | null {
  if (feeds.length === 0) return null;
  return [...feeds].sort((a, b) => {
    if (b.activityScore !== a.activityScore) return b.activityScore - a.activityScore;
    return (a.lastOnAt ?? 0) - (b.lastOnAt ?? 0);
  })[0];
}

// ─── Stateful engine (owns EMA smoothing across ticks) ────────────────────────

export interface DirectorEngineConfig {
  /** EMA factor 0..1 — higher = snappier, lower = calmer. Default 0.3. */
  smoothing?: number;
  hysteresis?: number;
  activityFloor?: number;
}

export class DirectorEngine {
  private smoothed = new Map<string, number>();
  private readonly alpha: number;
  private readonly opts: DecideOptions;

  constructor(config: DirectorEngineConfig = {}) {
    this.alpha = clamp01(config.smoothing ?? 0.3);
    this.opts = { hysteresis: config.hysteresis, activityFloor: config.activityFloor };
  }

  /** Feed raw per-tick activity; the engine smooths it and decides.
   *  Returns a Decision to apply (call setProgram), or null. */
  decide(
    raw: FeedActivity[],
    direction: DirectionState,
    settings: ProductionSettings,
    now: number = Date.now(),
  ): Decision | null {
    const seen = new Set<string>();
    const smoothedFeeds: FeedActivity[] = raw.map(f => {
      seen.add(f.feedId);
      const prev = this.smoothed.get(f.feedId) ?? f.activityScore;
      const next = prev + this.alpha * (f.activityScore - prev);
      this.smoothed.set(f.feedId, next);
      return { ...f, activityScore: next };
    });
    // Drop smoothing state for feeds that disappeared.
    for (const id of [...this.smoothed.keys()]) {
      if (!seen.has(id)) this.smoothed.delete(id);
    }
    return decideProgram(smoothedFeeds, direction, settings, now, this.opts);
  }

  /** Current smoothed score for a feed (for debug overlays / meters). */
  smoothedScore(feedId: string): number {
    return this.smoothed.get(feedId) ?? 0;
  }

  reset(): void {
    this.smoothed.clear();
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ─── MotionScorer — canvas inter-frame difference (0..1) ──────────────────────

export interface MotionScorer {
  /** Score how much changed in this video since the last call, 0..1.
   *  Returns 0 for videos that aren't ready (no frame to compare yet). */
  score(videoEl: HTMLVideoElement | null | undefined): number;
  dispose(): void;
}

export interface MotionScorerConfig {
  /** Downsample resolution (square). Small = cheap + robust to noise. Default 32. */
  size?: number;
  /**
   * Divisor that maps mean absolute per-channel pixel delta (0..255) to 0..1.
   * A whole-frame swap averages far below 255, so ~48 puts "vigorous motion"
   * near 1.0 while keeping small movement readable. Default 48.
   */
  sensitivity?: number;
}

/**
 * Create a per-feed motion scorer. Give EACH feed its own scorer (it keeps that
 * feed's previous frame). Downsamples the current frame to a tiny offscreen
 * canvas and returns the normalized mean absolute pixel difference from the last
 * frame — a cheap, GPU-free proxy for "how much is happening on this camera".
 */
export function createMotionScorer(config: MotionScorerConfig = {}): MotionScorer {
  const size = Math.max(8, config.size ?? 32);
  const sensitivity = config.sensitivity ?? 48;

  // Prefer OffscreenCanvas; fall back to a detached <canvas> for older browsers.
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const oc = new OffscreenCanvas(size, size);
      ctx = oc.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
    }
  } catch { /* fall through */ }
  if (!ctx && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    ctx = c.getContext('2d', { willReadFrequently: true });
  }

  let prev: Uint8ClampedArray | null = null;

  return {
    score(videoEl) {
      if (!ctx || !videoEl) return 0;
      // HAVE_CURRENT_DATA and a real frame. Guards paused/blank/placeholder tiles.
      if (videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) return 0;
      try {
        ctx.drawImage(videoEl, 0, 0, size, size);
        const cur = ctx.getImageData(0, 0, size, size).data;
        if (!prev || prev.length !== cur.length) {
          prev = new Uint8ClampedArray(cur); // first frame — nothing to diff yet
          return 0;
        }
        let sum = 0;
        // Compare RGB (skip alpha). Accumulate absolute per-channel delta.
        for (let i = 0; i < cur.length; i += 4) {
          sum += Math.abs(cur[i] - prev[i]);
          sum += Math.abs(cur[i + 1] - prev[i + 1]);
          sum += Math.abs(cur[i + 2] - prev[i + 2]);
        }
        prev.set(cur);
        const meanDelta = sum / ((cur.length / 4) * 3); // 0..255
        return clamp01(meanDelta / sensitivity);
      } catch {
        // Tainted canvas (cross-origin frame) or transient draw failure.
        return 0;
      }
    },
    dispose() {
      prev = null;
      ctx = null;
    },
  };
}
