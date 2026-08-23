/**
 * stillnessDrivers — the slow driver set, sibling to audioDrivers.ts.
 *
 * `AudioDriverSampler` exposes bpm, intensity, isBeat, isKick, isSnare and density. Every one of
 * those is a transient detector built for a VJ set, and every one of them reads flat on a drone:
 * there are no onsets to detect, so beat tracking returns noise and scene automation wanders.
 *
 * This is a SIBLING, not a modification. The automation matrix and the shader renderer bind to
 * driver values; they do not need to change, they need a second source to bind to.
 *
 * The other inversion is the direction of drive. In a VJ set the audio is the ground truth and
 * the visuals follow it. Here the emotional engine is the ground truth and BOTH the audio and
 * the visuals follow it — which is what keeps them in step and what keeps an offline render
 * deterministic. Nothing in this file analyses a signal.
 *
 * Framework-agnostic and free of firing logic, matching audioDrivers.ts.
 *
 *   const s = new StillnessDriverSampler();
 *   // inside a requestAnimationFrame loop:
 *   s.update(session.at(elapsedSec));
 *   s.uniforms()  // → the four values every meditation shader binds
 */

/** The state shape this reads. Structurally typed so Pixels does not import from services/ora. */
export interface StillnessInput {
  depth: number;
  breathPhase: number;
  arousal: number;
  bloom: number;
  bloomPan: number;
  breathRate: number;
  openness: number;
}

/**
 * The four-uniform contract.
 *
 * The shader gallery has a four-parameter ceiling. That is a constraint worth honouring rather
 * than working around: it forces the engine to say what actually matters, and it means any
 * shader already in the library can be promoted into a session by declaring these four.
 */
export interface StillnessUniforms {
  /** 0..1 within the breath cycle, eased. The only uniform allowed to move quickly — and even
   *  then it takes five to twelve seconds to travel. */
  uBreath: number;
  /** 0..1 across the session. Scale, distance, slowness. */
  uDepth: number;
  /** 0..1 inverse arousal. Chroma, detail density, particle count. */
  uCalm: number;
  /** An impulse decaying over roughly four seconds, carrying a position. Light arrives where a
   *  sound arrived. */
  uBloom: number;
}

/**
 * Renderer-enforced safety gates.
 *
 * These are applied to the composited frame rather than left to the shader author, because a
 * meditation audience includes people sitting in a dark room with their eyes half closed, and
 * because a full-field immersive visual is exactly the case where photosensitivity matters.
 */
export const STILLNESS_GATES = {
  /** Maximum fraction of full-scale luminance the frame may change in one second. */
  maxLuminanceRatePerSec: 0.10,
  /** Hard ceiling on luminance direction changes per second — the photosensitivity rule. */
  maxTransitionsPerSec: 3,
  /** Never fully black: a black frame reads as the stream having died. */
  luminanceFloor: 0.04,
  /** Screen-widths per second at full depth. Anything faster reads as weather, not stillness. */
  maxMotionAtDepth: 0.05,
  /** Chroma ceiling in the red sector — the worst case for photosensitivity, and it reads as
   *  alarm regardless. */
  maxRedChroma: 0.35,
} as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class StillnessDriverSampler {
  // ── Live driver outputs ────────────────────────────────────────────────────
  breath = 0;
  depth = 0;
  calm = 1;
  bloom = 0;
  bloomPan = 0;
  openness = 0;
  /** Seconds per breath cycle — the period every slow shader oscillation should use. */
  period = 10;

  /** Luminance actually permitted this frame, after the rate gate. */
  luminance = STILLNESS_GATES.luminanceFloor;

  private lastMs = 0;
  private targetLuminance = 0.5;

  /** Feed one frame of engine state. `nowMs` is only used for the luminance rate limiter. */
  update(s: StillnessInput, nowMs?: number): void {
    // Ease the breath so the visual field swells and settles rather than sliding linearly. The
    // curve matters: a linear breath looks mechanical even at the right rate.
    const p = clamp01(s.breathPhase);
    this.breath = 0.5 - 0.5 * Math.cos(Math.PI * 2 * p);

    this.depth = clamp01(s.depth);
    this.calm = clamp01(1 - s.arousal);
    this.bloom = clamp01(s.bloom);
    this.bloomPan = Math.max(-1, Math.min(1, s.bloomPan));
    this.openness = clamp01(s.openness);
    this.period = Math.max(2, s.breathRate);

    // Luminance falls with depth and rises for Return, with the one permitted bloom at the Turn
    // riding on top.
    this.targetLuminance = clamp01(
      STILLNESS_GATES.luminanceFloor +
        (0.55 - this.depth * 0.34) * (0.6 + this.calm * 0.4) +
        this.bloom * 0.18,
    );

    // Rate limit. Without a clock we cannot enforce it, so hold rather than jump — failing
    // closed is the right direction for a safety gate.
    const t = nowMs ?? 0;
    const dt = this.lastMs && t > this.lastMs ? (t - this.lastMs) / 1000 : 1 / 60;
    this.lastMs = t;
    const maxStep = STILLNESS_GATES.maxLuminanceRatePerSec * Math.min(dt, 0.25);
    const delta = this.targetLuminance - this.luminance;
    this.luminance = clamp01(this.luminance + Math.max(-maxStep, Math.min(maxStep, delta)));
  }

  uniforms(): StillnessUniforms {
    return { uBreath: this.breath, uDepth: this.depth, uCalm: this.calm, uBloom: this.bloom };
  }

  /** Motion speed a shader may use this frame, in screen-widths per second. */
  motionBudget(): number {
    // Quadratic, not linear. A linear ramp only reaches the ceiling at depth exactly 1.0, which
    // means most of the Depth phase would still be moving two to three times too fast — the
    // spec says under 0.05 *through* Depth, not at the single instant of the Turn.
    const headroom = 1 - this.depth;
    return (
      STILLNESS_GATES.maxMotionAtDepth +
      headroom * headroom * (0.30 - STILLNESS_GATES.maxMotionAtDepth)
    );
  }

  /**
   * Whether a shader family is allowed in a Sola burst.
   *
   * Radial symmetry is the one exclusion, and it is not about taste. Mandala geometry rotates,
   * rotation has a period, and anything with a period reads as permanent and recoverable — the
   * exact opposite of a moment that will not happen again. It is a beautiful family and it
   * belongs to the shared stream instead.
   */
  static allowsFamily(family: string, unrepeatable: boolean): boolean {
    if (!unrepeatable) return true;
    return family !== 'radial' && family !== 'mandala';
  }
}
