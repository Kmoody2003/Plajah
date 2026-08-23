// The emotional engine — the single source of state for a Stillness Deep session.
//
// This is deliberately headless: seed and elapsed time in, a state vector out. No audio, no
// visuals, no React. Everything else in the feature subscribes to it.
//
// Why it is built this way rather than as an audio analyser:
//
//   The obvious approach is to run an FFT over the generated audio and drive the visuals from
//   it. That is what Pixels already does for VJ work (engine/audioDrivers.ts), and it is the
//   wrong tool here — a drone has no transients, so beat and onset detection return noise and
//   the visuals wander independently of the music. Instead VELA and Pixels both *subscribe* to
//   this module, so they move together by construction.
//
//   And because `at(t)` is a pure function of (seed, elapsed), a session renders identically
//   offline. That is not a nicety: the pre-baked headset path, the offline bounce and the
//   generative channel all depend on it.
//
// The session arc below is a real sequence, not a fade in and a fade out. Each phase only makes
// sense after the one before it.

export type ArcPhase = 'arrival' | 'settling' | 'depth' | 'turn' | 'return';

/** Ora's existing five-point check-in, reused as the arrival signal. */
export type ArrivalMood = 1 | 2 | 3 | 4 | 5;

export interface SessionState {
  /** Seconds since the session started. */
  t: number;
  phase: ArcPhase;
  /** 0..1 within the current phase. */
  phaseProgress: number;

  /** 0..1 session depth, shaped by the arc rather than linear with time. */
  depth: number;
  /** 0..1 position within the current breath cycle. The only fast-moving value here. */
  breathPhase: number;
  /** Seconds per complete breath cycle. */
  breathRate: number;
  /** 0..1 estimated activation. Seeded by the check-in, then decays along the arc. */
  arousal: number;
  /** 0..1 how much silence and space the session is currently allowing. */
  openness: number;
  /** 0..1 impulse when a note is voiced, decaying over roughly four seconds. */
  bloom: number;
  /** Where the most recent bloom sits in the stereo/3D field, -1..1. */
  bloomPan: number;

  /** True once the Turn's single struck bowl has happened. */
  turned: boolean;
  /** Whether breath pacing should be visibly cued right now. */
  pacing: boolean;
}

export interface SessionOptions {
  seed: number;
  durationSec: number;
  /** How the person said they were arriving. Defaults to Steady. */
  arrival?: ArrivalMood;
}

// ── Arc definition ───────────────────────────────────────────────────────────
// Fractions of the session. These are the phase boundaries from the design and the burst
// boundary rule in the channel depends on them: a Sola burst is always one whole arc.

const ARC: Array<{ phase: ArcPhase; until: number }> = [
  { phase: 'arrival', until: 0.10 },
  { phase: 'settling', until: 0.30 },
  { phase: 'depth', until: 0.70 },
  { phase: 'turn', until: 0.90 },
  { phase: 'return', until: 1.0 },
];

/** Average bloom events per minute, per phase. Depth is nearly empty on purpose. */
const BLOOM_PER_MIN: Record<ArcPhase, number> = {
  arrival: 34,
  settling: 18,
  depth: 4.5,
  turn: 3,
  return: 11,
};

const BLOOM_DECAY_SEC = 4;

// ── Small deterministic helpers ──────────────────────────────────────────────

/** Mulberry32. Small, fast, and identical in Rust, JS and a worker — which is what matters. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Piecewise interpolation over `[position, value]` stops. */
function curve(stops: Array<[number, number]>, u: number): number {
  if (u <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [p1, v1] = stops[i];
    if (u <= p1) {
      const [p0, v0] = stops[i - 1];
      const span = p1 - p0 || 1;
      return lerp(v0, v1, smooth((u - p0) / span));
    }
  }
  return stops[stops.length - 1][1];
}

// ── The shapes ───────────────────────────────────────────────────────────────

/**
 * Depth across the session. Deliberately not linear: the long plateau through the middle is
 * where a session actually does its work, and time spent there should not feel like progress
 * toward an ending.
 */
const depthCurve = (u: number) =>
  curve([[0, 0], [0.10, 0.12], [0.30, 0.55], [0.70, 0.92], [0.78, 1.0], [0.90, 0.72], [1.0, 0.22]], u);

/**
 * Breath cycle length in seconds.
 *
 * Arrival does not pace at all — it meets whatever the person brought. Pacing arrives during
 * Settling and the exhale lengthens first, because the extended exhale is where the autonomic
 * shift lives. Around 10 s per cycle is roughly six breaths a minute, which is the best
 * supported figure in the whole design.
 */
const breathRateCurve = (u: number, start: number) =>
  curve([[0, start], [0.10, start], [0.30, 10], [0.70, 12], [0.90, 8], [1.0, 6]], u);

/** Openness: how much space and silence the session allows. Tracks depth, but falls sooner. */
const opennessCurve = (u: number) =>
  curve([[0, 0.08], [0.10, 0.18], [0.30, 0.5], [0.70, 0.88], [0.90, 0.5], [1.0, 0.2]], u);

/** A mood of "Rough" arrives hot; the session meets it there rather than hushing it. */
const arrivalArousal = (mood: ArrivalMood) => ({ 1: 0.92, 2: 0.75, 3: 0.55, 4: 0.4, 5: 0.3 })[mood];

/** A natural starting cycle, before any pacing. Agitated breathing is faster. */
const arrivalBreathRate = (mood: ArrivalMood) => ({ 1: 3.4, 2: 4.0, 3: 4.6, 4: 5.2, 5: 5.6 })[mood];

// ── Session ──────────────────────────────────────────────────────────────────

interface BloomEvent {
  t: number;
  pan: number;
}

export interface Session {
  readonly seed: number;
  readonly durationSec: number;
  readonly arrival: ArrivalMood;
  /** The Turn's single struck bowl, in seconds from the start. */
  readonly turnAt: number;
  /** State at any elapsed time. Pure — calling out of order returns the same answers. */
  at(elapsedSec: number): SessionState;
  /** Every bloom event in the session. Useful for scheduling audio ahead of the live edge. */
  blooms(): ReadonlyArray<BloomEvent>;
}

/** Resolution of the precomputed breath-phase table, in seconds. */
const BREATH_STEP = 0.25;

export function createSession(opts: SessionOptions): Session {
  const seed = opts.seed >>> 0;
  const durationSec = Math.max(30, opts.durationSec);
  const arrival = opts.arrival ?? 3;
  const startRate = arrivalBreathRate(arrival);

  // Breath phase is the integral of 1/rate over time, and the rate itself changes across the
  // arc — so there is no closed form. Precompute a cumulative table once, then interpolate.
  // This is what keeps `at(t)` O(1) and independent of call order.
  const steps = Math.ceil(durationSec / BREATH_STEP) + 2;
  const cumCycles = new Float64Array(steps);
  for (let i = 1; i < steps; i++) {
    const tMid = (i - 0.5) * BREATH_STEP;
    const rate = breathRateCurve(clamp01(tMid / durationSec), startRate);
    cumCycles[i] = cumCycles[i - 1] + BREATH_STEP / rate;
  }

  // The Turn: one gesture, placed just inside the turn phase. It is the only moment in the
  // session with a real transient, which is exactly why it lands.
  const turnAt = durationSec * 0.78;

  // Bloom schedule, generated once from the seed. Density follows the arc, and the gaps are
  // drawn from an exponential distribution so the stream never sounds like a grid.
  const rand = rng(seed ^ 0x5f37_1d2b);
  const events: BloomEvent[] = [];
  {
    let t = 0.6;
    let guard = 0;
    while (t < durationSec && guard++ < 20000) {
      const u = clamp01(t / durationSec);
      const perMin = BLOOM_PER_MIN[phaseAt(u).phase];
      const mean = 60 / Math.max(0.5, perMin);
      // Exponential gap: -ln(U) · mean. A Poisson stream, which is what "no grid" means.
      const gap = -Math.log(Math.max(1e-9, rand())) * mean;
      t += Math.max(0.35, gap);
      if (t >= durationSec) break;
      // Gate: below 100 % a scheduled event simply does not fire, which is what stops the
      // pattern from ever settling into one.
      const gate = 0.62 + 0.3 * (1 - clamp01(depthCurve(clamp01(t / durationSec))));
      if (rand() > gate) continue;
      events.push({ t, pan: rand() * 2 - 1 });
    }
  }

  function at(elapsedSec: number): SessionState {
    const t = Math.max(0, Math.min(durationSec, elapsedSec));
    const u = clamp01(t / durationSec);
    const { phase, phaseProgress } = phaseAt(u);

    // Breath phase from the cumulative table.
    const fi = t / BREATH_STEP;
    const i0 = Math.min(steps - 2, Math.floor(fi));
    const frac = fi - i0;
    const cycles = cumCycles[i0] + (cumCycles[i0 + 1] - cumCycles[i0]) * frac;
    const breathPhase = cycles - Math.floor(cycles);

    const depth = depthCurve(u);

    // Arousal falls along the arc from wherever the person arrived, with one small rise at the
    // Turn — the gesture is meant to be noticed.
    const settle = curve([[0, 1], [0.30, 0.55], [0.70, 0.18], [0.90, 0.3], [1.0, 0.45]], u);
    const turnBump = Math.exp(-Math.pow((t - turnAt) / 6, 2)) * 0.22;
    const arousal = clamp01(arrivalArousal(arrival) * settle + turnBump);

    // Most recent bloom before t. Linear scan is fine: a 20-minute session holds a few hundred
    // events, and this runs once per frame at most.
    let bloom = 0;
    let bloomPan = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].t <= t) {
        const age = t - events[i].t;
        if (age < BLOOM_DECAY_SEC) {
          bloom = Math.exp(-age / (BLOOM_DECAY_SEC / 3));
          bloomPan = events[i].pan;
        }
        break;
      }
    }
    // The Turn overrides any bloom near it — it is a single event and nothing shares the moment.
    const turnAge = t - turnAt;
    if (turnAge >= 0 && turnAge < 12) {
      const strike = Math.exp(-turnAge / 3.5);
      if (strike > bloom) {
        bloom = strike;
        bloomPan = -0.55; // behind and to the left, per the design
      }
    }

    return {
      t,
      phase,
      phaseProgress,
      depth,
      breathPhase,
      breathRate: breathRateCurve(u, startRate),
      arousal,
      openness: opennessCurve(u),
      bloom,
      bloomPan,
      turned: t >= turnAt,
      // Pacing is cued during Settling and fades out through Depth: by then the sound is
      // carrying it, and a visible cue has become something to obey rather than follow.
      pacing: u > 0.10 && u < 0.45,
    };
  }

  return { seed, durationSec, arrival, turnAt, at, blooms: () => events };
}

function phaseAt(u: number): { phase: ArcPhase; phaseProgress: number } {
  let prev = 0;
  for (const seg of ARC) {
    if (u <= seg.until) {
      const span = seg.until - prev || 1;
      return { phase: seg.phase, phaseProgress: clamp01((u - prev) / span) };
    }
    prev = seg.until;
  }
  return { phase: 'return', phaseProgress: 1 };
}

/**
 * A seed that cannot be reconstructed.
 *
 * Drawn from crypto entropy, returned, and never written down by this module. The Sola design
 * depends on the moment being genuinely unrecoverable rather than merely un-offered, which
 * means callers must not persist this, log it, or attach it to an analytics event. It is worth
 * being blunt about here, because "we'll strip it from telemetry later" never happens.
 */
export function drawEphemeralSeed(): number {
  const buf = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
  else buf[0] = Math.floor(Math.random() * 4294967296);
  return buf[0] >>> 0;
}
