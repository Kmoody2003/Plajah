// handwritingFormEngine — the pure, deterministic core of Penna (the handwriting workshop).
//
// This is the genuinely new piece of the workshop: given a child's captured pen stroke and the
// reference model for the letter they're forming, it grades the four things an occupational
// therapist grades — right STARTING POINT, right DIRECTION, right SEQUENCE, and staying inside the
// letter's CORRIDOR — and returns a 0–100 score plus a per-check breakdown the view turns into
// coaching ("start on the dot", "follow the arrow"). The whole product decision lives in the
// tolerance dial: too strict frustrates a four-year-old, too loose teaches nothing, so tolerances
// are age-banded (see DEFAULT_STRICTNESS) and tunable.
//
// Deliberately model-free: no React, no Firebase, no DOM, no Date/Math.random. All geometry works
// in a normalized 100 × 140 writing box (guide lines: cap y=15, midline y=75, baseline y=125) so
// scoring is resolution-independent and the module is unit-testable under `node --test`.
//
//   npx tsx --test tests/handwritingFormEngine.test.ts

export interface Pt { x: number; y: number; }

/** One reference stroke as an ordered polyline in the normalized box. Point order encodes the
 *  taught direction (e.g. capitals start at the top). */
export interface StrokeModel { points: Pt[]; }

export type LetterCategory = 'prewriting' | 'capital' | 'lowercase' | 'number';

/** A letter/shape modelled as an ordered list of strokes (the taught sequence). */
export interface LetterModel {
  key: string;
  glyph: string;            // display character
  category: LetterCategory;
  strokes: StrokeModel[];
}

/** Grading tolerances, in normalized units (box is 100 wide, 140 tall). */
export interface Tolerance { start: number; corridor: number; end: number; }

/** Per-stroke grade returned to the view. */
export interface StrokeResult {
  pass: boolean;            // all four checks passed
  startOk: boolean;         // ① began in the right place
  directionOk: boolean;     // ② travelled the right way
  sequenceOk: boolean;      // ③ this was the expected next stroke
  corridorOk: boolean;      // ④ stayed inside the letter's path
  score: number;            // 0–100, for stars / progress, not gating
  reversed: boolean;        // drew the stroke backwards
  deviation: number;        // mean corridor deviation (normalized units)
  startError: number;       // distance from the intended start
  endError: number;         // distance from the intended end
}

// ── geometry helpers (also used by the view for rendering) ──────────────────────────

export const distance = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** A straight stroke from (x1,y1) to (x2,y2). */
export const line = (x1: number, y1: number, x2: number, y2: number): StrokeModel => ({
  points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
});

/** An arc stroke. Angles in degrees; sweep negative = visually counter-clockwise (screen y-down). */
export const arc = (
  cx: number, cy: number, r: number, startDeg: number, sweepDeg: number, steps = 40,
): StrokeModel => {
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (startDeg + sweepDeg * (i / steps)) * Math.PI / 180;
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return { points };
};

export function pathLength(points: Pt[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distance(points[i - 1], points[i]);
  return d;
}

/** $1-recognizer resample: return exactly n points spaced evenly by arc length. */
export function resample(points: Pt[], n: number): Pt[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }));
  const pts = points.map(p => ({ x: p.x, y: p.y }));
  const interval = pathLength(pts) / (n - 1);
  if (interval === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const out: Pt[] = [{ ...pts[0] }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distance(pts[i - 1], pts[i]);
    if (acc + d >= interval && d > 0) {
      const t = (interval - acc) / d;
      const np = {
        x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
      };
      out.push(np);
      pts.splice(i, 0, np);
      acc = 0;
    } else acc += d;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}

/** Mean index-aligned distance between two equal-length point lists. */
export function meanAligned(a: Pt[], b: Pt[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += distance(a[i], b[i]);
  return n ? s / n : Infinity;
}

// ── tolerance model ─────────────────────────────────────────────────────────────────

/** Strictness (0 = forgiving, 1 = strict) → tolerances in normalized units. */
export function toleranceFor(strictness: number): Tolerance {
  const s = Math.max(0, Math.min(1, strictness));
  return {
    start: 22 - 14 * s,
    corridor: 16 - 10 * s,
    end: 24 - 14 * s,
  };
}

export type AgeBandKey = 'early' | 'middle' | 'senior';

/** Age-banded defaults, aligned to data/ageScaling.ts AgeBand. Pre-K is forgiving. */
export const DEFAULT_STRICTNESS: Record<AgeBandKey, number> = {
  early: 0.28,
  middle: 0.52,
  senior: 0.74,
};

// ── adult tuning (parent / teacher) ──────────────────────────────────────────────────
// Difficulty is set BY the adult FOR the learner, and otherwise auto-adapts to skill. A learner
// never controls their own difficulty. 'auto' ramps strictness up as the child masters more letters
// ("according to skill and level progress"); 'manual' pins an adult-chosen level.

export type TuningMode = 'auto' | 'manual';

/** A single learner's difficulty setting. `manual` is a raw strictness 0..1 (used when mode==='manual'). */
export interface HandwritingTuning { mode: TuningMode; manual: number; }

export const DEFAULT_TUNING: HandwritingTuning = { mode: 'auto', manual: 0.42 };

export interface TuningLevel { key: string; label: string; hint: string; strictness: number; }

/** The named levels a parent/teacher picks from in manual mode. */
export const TUNING_LEVELS: TuningLevel[] = [
  { key: 'emerging',   label: 'Emerging',   hint: 'Just starting — very forgiving', strictness: 0.15 },
  { key: 'developing', label: 'Developing', hint: 'Getting the hang of it',          strictness: 0.42 },
  { key: 'proficient', label: 'Proficient', hint: 'Neat, consistent letters',        strictness: 0.64 },
  { key: 'advanced',   label: 'Advanced',   hint: 'Tight, exam-ready form',          strictness: 0.84 },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Auto strictness ramps from the age-band base as the learner masters letters:
 *  +0.02 per mastered letter, capped at +0.35. This is the skill/level progression. */
export function autoStrictness(band: AgeBandKey, masteredCount: number): number {
  return clamp01(DEFAULT_STRICTNESS[band] + Math.min(0.35, Math.max(0, masteredCount) * 0.02));
}

/** The strictness actually used to grade — an adult 'manual' override wins over the auto ramp. */
export function effectiveStrictness(
  band: AgeBandKey,
  tuning: HandwritingTuning | null | undefined,
  masteredCount: number,
): number {
  if (tuning && tuning.mode === 'manual') return clamp01(tuning.manual);
  return autoStrictness(band, masteredCount);
}

/** The named level nearest a strictness value (labels the current setting, incl. auto). */
export function levelForStrictness(s: number): TuningLevel {
  return TUNING_LEVELS.reduce(
    (best, lv) => (Math.abs(lv.strictness - s) < Math.abs(best.strictness - s) ? lv : best),
    TUNING_LEVELS[0],
  );
}

// ── scoring ─────────────────────────────────────────────────────────────────────────

const RESAMPLE_N = 64;

/** Index of the stroke whose start is nearest to p (used for the sequence check). */
export function nearestStrokeStart(letter: LetterModel, p: Pt): number {
  let best = -1, bd = Infinity;
  letter.strokes.forEach((st, i) => {
    const d = distance(p, st.points[0]);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/**
 * Grade a captured stroke (already in normalized 100×140 coordinates) against the expected
 * stroke of `letter` at `strokeIndex`. Pure — no side effects.
 */
export function scoreStroke(
  userPoints: Pt[],
  letter: LetterModel,
  strokeIndex: number,
  strictness: number,
): StrokeResult {
  const fail: StrokeResult = {
    pass: false, startOk: false, directionOk: false, sequenceOk: false, corridorOk: false,
    score: 0, reversed: false, deviation: Infinity, startError: Infinity, endError: Infinity,
  };
  const ref = letter.strokes[strokeIndex];
  if (!ref || userPoints.length < 2) return fail;

  const U = resample(userPoints, RESAMPLE_N);
  const R = resample(ref.points, RESAMPLE_N);
  const Rrev = [...R].reverse();

  const fwd = meanAligned(U, R);
  const rev = meanAligned(U, Rrev);
  const reversed = rev < fwd * 0.98;
  const aligned = reversed ? Rrev : R;
  const deviation = meanAligned(U, aligned);

  const startError = distance(userPoints[0], ref.points[0]);
  const endError = distance(userPoints[userPoints.length - 1], ref.points[ref.points.length - 1]);
  const tol = toleranceFor(strictness);

  const sequenceOk = nearestStrokeStart(letter, userPoints[0]) === strokeIndex
    || startError < tol.start * 1.4;
  const startOk = startError < tol.start && sequenceOk;
  const directionOk = !reversed && fwd < tol.corridor * 3.2;
  const corridorOk = deviation < tol.corridor;
  const pass = startOk && directionOk && sequenceOk && corridorOk;

  const e = (deviation / tol.corridor) * 0.5
    + (startError / tol.start) * 0.28
    + (endError / tol.end) * 0.22
    + (reversed ? 0.6 : 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - e * 46)));

  return { pass, startOk, directionOk, sequenceOk, corridorOk, score, reversed, deviation, startError, endError };
}
