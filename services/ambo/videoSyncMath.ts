// videoSyncMath — pure maths for Ambo's single video clock. No DOM, no channel.
//
// The studio's Program video element is the AUTHORITY. It publishes a transport
// snapshot: "at wall-clock anchorMs the clip was at `pos` seconds, playing at
// `rate`". Every other window predicts where the clip must be right now and
// steers its own muted <video> to that spot (drift correction), so Program and
// the output windows show the same frame instead of two independent players.

export interface VideoTransport {
  /** Stable key of the clip (its src). */
  key: string;
  playing: boolean;
  /** Playback rate, 1 = normal. */
  rate: number;
  /** Media position (s) at `anchorMs`. */
  pos: number;
  /** Date.now() when `pos` was true. */
  anchorMs: number;
  loop: boolean;
  /** 0 / NaN = not known yet. */
  duration: number;
  volume: number;
  muted: boolean;
  /** Clip ended (non-loop) and is parked on its last frame. */
  ended?: boolean;
}

export type VideoCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'seek'; sec: number }
  | { type: 'skip'; delta: number }
  | { type: 'restart' }
  | { type: 'loop'; on: boolean }
  | { type: 'rate'; rate: number }
  | { type: 'volume'; volume: number }
  | { type: 'mute'; muted: boolean };

const finite = (n: number) => Number.isFinite(n);
const hasDuration = (d: number) => finite(d) && d > 0;

/** Where the clip should be at wall-clock `nowMs`. Loops wrap; one-shots park at the end. */
export function predictedPosition(t: VideoTransport, nowMs: number): number {
  const base = t.pos + (t.playing ? Math.max(0, nowMs - t.anchorMs) / 1000 * t.rate : 0);
  if (!hasDuration(t.duration)) return Math.max(0, base);
  if (t.loop) {
    const m = base % t.duration;
    return m < 0 ? m + t.duration : m;
  }
  return Math.min(Math.max(0, base), t.duration);
}

/** Whether, as of `nowMs`, a one-shot clip has run out. */
export function hasEnded(t: VideoTransport, nowMs: number): boolean {
  if (t.loop || !hasDuration(t.duration) || !t.playing) return !!t.ended;
  return t.pos + Math.max(0, nowMs - t.anchorMs) / 1000 * t.rate >= t.duration;
}

/**
 * Signed distance (s) from `predicted` to `actual`: positive = we are AHEAD.
 * For looping clips the shortest way round the loop, so a follower that
 * wrapped 20 ms before the authority reads +0.02 rather than ~ -duration.
 */
export function signedDrift(actual: number, predicted: number, loop: boolean, duration: number): number {
  const d = actual - predicted;
  if (!loop || !hasDuration(duration)) return d;
  let w = d % duration;
  if (w > duration / 2) w -= duration;
  else if (w < -duration / 2) w += duration;
  return w;
}

export interface DriftTuning {
  /** Below this, play at the nominal rate. */
  deadZone: number;
  /** Above this, hard-seek. */
  seekAt: number;
  /** Max rate nudge (fraction), e.g. 0.04 = +/-4 %. */
  maxNudge: number;
}
export const DEFAULT_DRIFT: DriftTuning = { deadZone: 0.03, seekAt: 0.12, maxNudge: 0.04 };

export type DriftAction =
  | { action: 'none'; rate: number }
  | { action: 'nudge'; rate: number }
  | { action: 'seek'; to: number; rate: number };

/**
 * What a follower should do. `drift` = actual - predicted (see signedDrift).
 * The nudge scales with the error (proportional), clamped to +/- maxNudge, and
 * opposes it: ahead -> slow down, behind -> speed up.
 */
export function driftDecision(drift: number, predicted: number, nominalRate: number, tune: DriftTuning = DEFAULT_DRIFT): DriftAction {
  const a = Math.abs(drift);
  if (!finite(drift) || a >= tune.seekAt) return { action: 'seek', to: predicted, rate: nominalRate };
  if (a < tune.deadZone) return { action: 'none', rate: nominalRate };
  const frac = Math.min(tune.maxNudge, (a / tune.seekAt) * tune.maxNudge * 1.5);
  return { action: 'nudge', rate: nominalRate * (1 + (drift > 0 ? -frac : frac)) };
}

/** Re-anchor a transport at `nowMs` without changing where the clip is. */
export function reanchor(t: VideoTransport, nowMs: number): VideoTransport {
  return { ...t, pos: predictedPosition(t, nowMs), anchorMs: nowMs };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Apply an operator command to a transport (pure; the caller then drives the element). */
export function applyCommand(t: VideoTransport, c: VideoCommand, nowMs: number): VideoTransport {
  const cur = reanchor(t, nowMs);
  const dur = t.duration;
  const seekTo = (sec: number): VideoTransport => ({
    ...cur,
    pos: hasDuration(dur) ? clamp(sec, 0, t.loop ? Math.max(0, dur - 0.001) : dur) : Math.max(0, sec),
    ended: false,
  });
  switch (c.type) {
    case 'play': {
      // Playing a finished one-shot starts it over, like every player does.
      const restart = hasDuration(dur) && !t.loop && cur.pos >= dur - 0.01;
      return { ...cur, playing: true, ended: false, pos: restart ? 0 : cur.pos };
    }
    case 'pause': return { ...cur, playing: false };
    case 'toggle': return applyCommand(t, { type: cur.playing && !cur.ended ? 'pause' : 'play' }, nowMs);
    case 'seek': return seekTo(c.sec);
    case 'skip': return seekTo(cur.pos + c.delta);
    case 'restart': return { ...seekTo(0), playing: true };
    case 'loop': return { ...cur, loop: c.on };
    case 'rate': return { ...cur, rate: clamp(c.rate, 0.25, 4) };
    case 'volume': return { ...cur, volume: clamp(c.volume, 0, 1), muted: c.volume <= 0 ? true : false };
    case 'mute': return { ...cur, muted: c.muted };
  }
}

/** Transports are re-sent only when something other than the position moved. */
export function transportChanged(a: VideoTransport | undefined, b: VideoTransport): boolean {
  if (!a) return true;
  return a.playing !== b.playing || a.rate !== b.rate || a.loop !== b.loop || a.volume !== b.volume
    || a.muted !== b.muted || a.duration !== b.duration || !!a.ended !== !!b.ended;
}

/**
 * Has the authority's position departed from its own prediction? A seek, a stall
 * or a loop restart shows up here and forces an immediate publish.
 */
export function positionJumped(prev: VideoTransport | undefined, actualPos: number, nowMs: number, tol = 0.25): boolean {
  if (!prev) return true;
  return Math.abs(signedDrift(actualPos, predictedPosition(prev, nowMs), prev.loop, prev.duration)) > tol;
}

export function formatClock(sec: number): string {
  if (!finite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
