// Sola — the unrepeatable burst, and the handoff back to the shared stream.
//
// The channel has two registers. The stream is communal and persistent: everyone resolves the
// same seed from the clock, it is baked to HLS for platforms that cannot run an engine, and it
// is what group sessions use because a shared session needs everyone on identical state. Sola
// is the other one — for one complete arc, a capable device stops receiving and starts making,
// from a seed drawn out of entropy that is never written down.
//
// Two things in here are load-bearing:
//
//   The burst boundary is always the end of an arc, never a timer. A session is never cut
//   mid-phase, so every Sola burst is a complete experience rather than a slice of one.
//
//   The handoff converges rather than cuts. Because the shared stream is deterministic, its
//   state at any future second is computable — so the device steers its own session onto that
//   state over the last minute and the crossfade happens between two things already in the same
//   breath phase, at the same depth, at the same brightness. On a meditation channel a hard cut
//   is not a glitch, it is a jolt delivered to someone who came here to be calm.

import type { SessionState } from '../ora/stillness/emotionalEngine';

/**
 * What a device is allowed to do.
 *
 * Set from a measured six-hour sustained-load test per device class, never from a spec sheet —
 * a session is twenty minutes and a channel is left on overnight, so a session-length benchmark
 * will not surface the thermal behaviour that actually decides this.
 */
export type DeviceTier = 'continuous' | 'burst' | 'stream';

export interface TierPolicy {
  tier: DeviceTier;
  /** Seconds of local rendering allowed before a cooldown. Ignored for 'continuous'. */
  burstSec: number;
  /** Seconds on the shared stream between bursts — the cooldown half of the duty cycle. */
  cooldownSec: number;
}

export const TIER_POLICY: Record<DeviceTier, TierPolicy> = {
  // Headroom to spare. There is no reason to make these viewers watch the shared feed at all.
  continuous: { tier: 'continuous', burstSec: Infinity, cooldownSec: 0 },
  // The tier the whole design is shaped around: renders beautifully, cannot render forever.
  burst: { tier: 'burst', burstSec: 20 * 60, cooldownSec: 12 * 60 },
  // A stuttering unique moment is worse than a smooth shared one.
  stream: { tier: 'stream', burstSec: 0, cooldownSec: Infinity },
};

/** Seconds before the handoff at which convergence begins. */
export const CONVERGE_SEC = 60;
/** Seconds of audio/video crossfade at the very end. */
export const CROSSFADE_SEC = 15;

// ── Scheduling ───────────────────────────────────────────────────────────────

export interface BurstPlan {
  /** Whether a burst may start at all. */
  allowed: boolean;
  /** Length of the burst — one complete arc. */
  durationSec: number;
  /** Seconds on the shared stream afterwards before another burst may start. */
  cooldownSec: number;
  reason: string;
}

/**
 * Decide whether to start a Sola burst now.
 *
 * `arcLengthSec` is the length of a complete session arc for the current programme. The burst
 * takes that length rather than the policy's nominal figure — cutting mid-arc is the one thing
 * this design does not do — but a policy that cannot afford a whole arc declines instead.
 */
export function planBurst(
  policy: TierPolicy,
  arcLengthSec: number,
  secondsSinceLastBurst: number,
): BurstPlan {
  if (policy.tier === 'stream') {
    return { allowed: false, durationSec: 0, cooldownSec: Infinity, reason: 'device renders the shared stream only' };
  }
  if (policy.tier === 'continuous') {
    return { allowed: true, durationSec: arcLengthSec, cooldownSec: 0, reason: 'continuous tier' };
  }
  if (secondsSinceLastBurst < policy.cooldownSec) {
    return {
      allowed: false,
      durationSec: 0,
      cooldownSec: policy.cooldownSec - secondsSinceLastBurst,
      reason: 'cooling down',
    };
  }
  if (arcLengthSec > policy.burstSec) {
    // Better to stay on the stream than to start something that has to be cut.
    return { allowed: false, durationSec: 0, cooldownSec: policy.cooldownSec, reason: 'arc longer than the thermal budget' };
  }
  return { allowed: true, durationSec: arcLengthSec, cooldownSec: policy.cooldownSec, reason: 'ok' };
}

// ── Convergence ──────────────────────────────────────────────────────────────

/** 0 before convergence starts, 1 at the handoff. Eased, so the steer is never a lurch. */
export function convergenceAmount(secondsUntilHandoff: number): number {
  if (secondsUntilHandoff >= CONVERGE_SEC) return 0;
  if (secondsUntilHandoff <= 0) return 1;
  const linear = 1 - secondsUntilHandoff / CONVERGE_SEC;
  return linear * linear * (3 - 2 * linear);
}

/** Equal-power crossfade gains for the final seconds. */
export function crossfadeGains(secondsUntilHandoff: number): { local: number; stream: number } {
  if (secondsUntilHandoff >= CROSSFADE_SEC) return { local: 1, stream: 0 };
  if (secondsUntilHandoff <= 0) return { local: 0, stream: 1 };
  const t = 1 - secondsUntilHandoff / CROSSFADE_SEC;
  return { local: Math.cos((t * Math.PI) / 2), stream: Math.sin((t * Math.PI) / 2) };
}

/** Shortest-path interpolation on a 0..1 circle — breath phase wraps, so a linear blend would
 *  run the wrong way round the cycle and produce a visible stutter at exactly the wrong moment. */
export function blendPhase(from: number, to: number, k: number): number {
  // Short-circuit the ends so they are exact. The wrap modulo below introduces float drift, and
  // a "no-op" that shifts the phase by 1e-17 is the kind of thing that turns into a mystery
  // months later.
  if (k <= 0) return from;
  if (k >= 1) return ((to % 1) + 1) % 1;
  let d = to - from;
  if (d > 0.5) d -= 1;
  else if (d < -0.5) d += 1;
  const v = from + d * k;
  return ((v % 1) + 1) % 1;
}

/**
 * Steer a local session's state toward the shared stream's state at the handoff.
 *
 * This is the piece to build and test before anything cosmetic. Everything else in the channel
 * degrades gracefully; this does not.
 */
export function converge(local: SessionState, target: SessionState, k: number): SessionState {
  if (k <= 0) return local;
  const lerp = (a: number, b: number) => a + (b - a) * k;
  return {
    ...local,
    depth: lerp(local.depth, target.depth),
    breathPhase: blendPhase(local.breathPhase, target.breathPhase, k),
    breathRate: lerp(local.breathRate, target.breathRate),
    arousal: lerp(local.arousal, target.arousal),
    openness: lerp(local.openness, target.openness),
    // Blooms are discrete events, not a continuous field — blending them would smear two
    // separate gestures into one that belongs to neither session.
    bloom: local.bloom,
    bloomPan: local.bloomPan,
  };
}

// ── The moment ───────────────────────────────────────────────────────────────

/**
 * Copy for the notice.
 *
 * Point at the making, not at the ending. "When it ends, it's gone" is true and wrong: it puts
 * a countdown in someone's head at the start of something designed to remove countdowns. The
 * closing line's past tense does the work instead.
 */
export const SOLA_COPY = {
  default: { open: 'Only yours.', sub: 'Made for you, once', close: 'That was yours.' },
  softest: { open: 'Yours.', sub: 'Made here, now', close: 'That was yours.' },
  plainest: { open: 'Only yours.', sub: 'No one else is hearing this', close: 'That was yours alone.' },
} as const;

export type SolaCopyRegister = keyof typeof SOLA_COPY;

/** Fade in, hold, fade out — sixteen seconds of type in a twenty-minute programme. */
export const NOTICE_TIMING = { fadeInSec: 4, holdSec: 6, fadeOutSec: 6 } as const;

/** The opening notice appears once the session is already underway, never before it begins. */
export const NOTICE_START_SEC = 40;

/**
 * How many times a viewer sees the opening notice before it retires itself.
 *
 * It is informative, and information stops being useful the fourth time. The closing line is
 * not covered by this: it is three words, it is felt rather than read, and it is the part that
 * carries the feeling.
 */
export const NOTICE_RETIRE_AFTER = 3;

export function noticeOpacity(elapsedSec: number): number {
  const t = elapsedSec - NOTICE_START_SEC;
  const { fadeInSec, holdSec, fadeOutSec } = NOTICE_TIMING;
  if (t < 0 || t > fadeInSec + holdSec + fadeOutSec) return 0;
  // Peaks at 80%: legible, not dominant. It should read as something surfacing in the field
  // rather than an overlay placed on top of it.
  const peak = 0.8;
  if (t < fadeInSec) return (t / fadeInSec) * peak;
  if (t < fadeInSec + holdSec) return peak;
  return (1 - (t - fadeInSec - holdSec) / fadeOutSec) * peak;
}

/**
 * Whether the opening notice should be shown at all.
 *
 * Never surfaces the device tier: a Stream-tier viewer is simply never in a Sola burst, so the
 * question never arises for them. Telling someone their television is too weak is a message
 * delivered exclusively to people who can do nothing about it.
 */
export function shouldShowNotice(opts: {
  inSola: boolean;
  noticesEnabled: boolean;
  solaSessionsSeen: number;
}): boolean {
  return opts.inSola && opts.noticesEnabled && opts.solaSessionsSeen < NOTICE_RETIRE_AFTER;
}
