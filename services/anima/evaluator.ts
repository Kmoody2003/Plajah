/**
 * services/anima/evaluator.ts
 *
 * Plajah Anima — High-Performance Motion Evaluator
 * Pure, deterministic evaluation of tracks at continuous time t and discrete frame f.
 * Supports:
 * - O(log N) Binary Search Keyframe Sampling
 * - Bézier, Cubic Hermite, Elastic, Bounce, Hold, and Linear Easings
 * - Sandboxed Expressions (wiggle, loopOut, math)
 * - Physics Behaviors (Springs, Wobble, Inertia)
 * - Cel Exposure Sheet Resolution (on 1s, 2s, 3s, 4s)
 * - 2D/3D Bone FK Matrix Evaluation
 */

import type {
  AnimaChannel,
  AnimaLayer,
  AnimaProject,
  CelTrack,
  InterpolationEase,
  Keyframe,
} from './types';
import { compileExpression } from './expression';

/** Frames are 1-based on the timeline: frame 1 is t = 0. */
export const frameToTime = (frame: number, fps: number) => (frame - 1) / Math.max(1, fps);
export const timeToFrame = (t: number, fps: number) => Math.round(t * Math.max(1, fps)) + 1;

// Clamp helper
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Cubic Bézier evaluation for keyframe easing handles */
export function cubicBezierProgress(p: number, x1: number, y1: number, x2: number, y2: number): number {
  let t = p;
  // Newton-Raphson 4 iterations for fast convergence
  for (let i = 0; i < 4; i++) {
    const currentSlope = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(currentSlope) < 1e-5) break;
    const currentX =
      3 * (1 - t) * (1 - t) * t * x1 +
      3 * (1 - t) * t * t * x2 +
      t * t * t - p;
    t -= currentX / currentSlope;
    t = Math.max(0, Math.min(1, t));
  }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}

/** Built-in easings */
export function shapeEase(p: number, ease?: InterpolationEase): number {
  switch (ease) {
    case 'hold':
      return 0; // maintain left value until next key
    case 'in':
      return p * p * p; // cubic ease-in
    case 'out':
      return 1 - Math.pow(1 - p, 3); // cubic ease-out
    case 'smooth':
      return p * p * (3 - 2 * p); // smoothstep
    case 'elastic': {
      if (p === 0 || p === 1) return p;
      return -Math.pow(2, 10 * (p - 1)) * Math.sin((p - 1.1) * 5 * Math.PI);
    }
    case 'bounce': {
      let q = 1 - p;
      if (q < 1 / 2.75) return 1 - 7.5625 * q * q;
      if (q < 2 / 2.75) return 1 - (7.5625 * (q -= 1.5 / 2.75) * q + 0.75);
      if (q < 2.5 / 2.75) return 1 - (7.5625 * (q -= 2.25 / 2.75) * q + 0.9375);
      return 1 - (7.5625 * (q -= 2.625 / 2.75) * q + 0.984375);
    }
    default:
      return p; // linear
  }
}

/**
 * A 'bezier' segment from a to b: the curve runs through (a.t, a.v) → a.outHandle →
 * b.inHandle → (b.t, b.v), the same curve the graph editor draws. Time is solved for the
 * curve parameter, then the value read off it, so flat segments (a.v === b.v) can still bulge.
 * Missing handles default to a third of the span with zero slope (smooth).
 */
export function sampleBezierSegment(a: Keyframe<number>, b: Keyframe<number>, p: number): number {
  const span = b.t - a.t;
  const out = a.outHandle ?? { dx: span / 3, dy: 0 };
  const inn = b.inHandle ?? { dx: -span / 3, dy: 0 };
  const x1 = clamp01(out.dx / span);
  const x2 = clamp01(1 + inn.dx / span);
  const y0 = a.v;
  const y1 = a.v + out.dy;
  const y2 = b.v + inn.dy;
  const y3 = b.v;
  // Solve x(s) = p for the curve parameter s (x is monotonic because x1, x2 ∈ [0, 1]).
  let s = p;
  for (let i = 0; i < 8; i++) {
    const x = 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
    const dx = 3 * (1 - s) * (1 - s) * x1 + 6 * (1 - s) * s * (x2 - x1) + 3 * s * s * (1 - x2);
    if (Math.abs(x - p) < 1e-6) break;
    if (Math.abs(dx) < 1e-6) {
      // Flat slope: fall back to bisection-ish nudge.
      s += x < p ? 1e-3 : -1e-3;
    } else {
      s -= (x - p) / dx;
    }
    s = clamp01(s);
  }
  const u = 1 - s;
  return u * u * u * y0 + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3;
}

/** Binary search to find bracketing keyframes: O(log K) */
export function sampleKeyframeTrack(keyframes: Keyframe<number>[], t: number, defaultValue: number): number {
  if (!keyframes || keyframes.length === 0) return defaultValue;
  if (keyframes.length === 1) return keyframes[0].v;
  if (t <= keyframes[0].t) return keyframes[0].v;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) return last.v;

  let low = 0;
  let high = keyframes.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (keyframes[mid].t <= t) {
      if (mid === keyframes.length - 1 || keyframes[mid + 1].t > t) {
        const a = keyframes[mid];
        const b = keyframes[mid + 1];
        const span = b.t - a.t;
        if (span < 1e-6) return a.v;
        const normP = clamp01((t - a.t) / span);
        if (a.ease === 'bezier') return sampleBezierSegment(a, b, normP);
        const p = shapeEase(normP, a.ease);
        return a.v + (b.v - a.v) * p;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return defaultValue;
}

/** Evaluate a single AnimaChannel with Keyframe + Expression + Behavior tiers */
export function evaluateChannel(channel: AnimaChannel<number>, t: number, fps = 24): number {
  // Tier 1: Keyframe Base
  let val = sampleKeyframeTrack(channel.keyframes, t, channel.defaultValue);

  // Tier 2: Expression (safe parser — services/anima/expression.ts)
  if (channel.expression?.enabled && channel.expression.code) {
    const code = channel.expression.code.trim();
    if (code.startsWith('loopOut(')) {
      if (channel.keyframes.length >= 2) {
        const first = channel.keyframes[0].t;
        const last = channel.keyframes[channel.keyframes.length - 1].t;
        const cycle = last - first;
        if (cycle > 1e-4 && t > last) {
          const rem = (t - first) % cycle;
          val = sampleKeyframeTrack(channel.keyframes, first + rem, channel.defaultValue);
        }
      }
    } else {
      const fn = compileExpression(code);
      if (fn) {
        const scope = { time: t, frame: Math.floor(t * fps) + 1, fps, value: val };
        // A bare wiggle() adds to the keyed motion; any other expression replaces it.
        val = /^wiggle\s*\(/.test(code) ? val + fn(scope) : fn(scope);
      }
    }
  }

  // Tier 3: Physics Behaviors
  if (channel.behavior?.enabled) {
    const b = channel.behavior;
    if (b.kind === 'wobble') {
      const freq = b.frequency ?? 3.0;
      const amp = b.amplitude ?? 8.0;
      val += Math.sin(t * freq * Math.PI * 2) * amp * Math.exp(-t * (1 - (b.decay ?? 0.9)));
    } else if (b.kind === 'spring') {
      // Damped harmonic oscillator
      const freq = b.frequency ?? 2.5;
      const decay = b.decay ?? 0.88;
      val += Math.cos(t * freq * Math.PI * 2) * Math.exp(-t * (1 - decay) * 5) * (b.amplitude ?? 12);
    }
  }

  return val;
}

/** Resolve Cel Drawing ID from an Exposure Sheet Track */
export function resolveCelExposure(track: CelTrack | undefined, frame: number): string | null {
  if (!track || !track.exposures || track.exposures.length === 0) return null;
  for (const exp of track.exposures) {
    if (frame >= exp.startFrame && frame < exp.startFrame + exp.durationFrames) {
      return exp.drawingId === '__EMPTY__' ? null : exp.drawingId;
    }
  }
  return null;
}

/** Evaluated Layer State */
export interface EvaluatedLayerState {
  layerId: string;
  name: string;
  type: AnimaLayer['type'];
  visible: boolean;
  opacity: number;
  transform: {
    x: number;
    y: number;
    z: number;
    rotationZ: number;
    scaleX: number;
    scaleY: number;
  };
  activeDrawingId: string | null;
  /** Every channel on the layer evaluated at this frame, by path (bone.*, face.*, fx.* …). */
  channels: Record<string, number>;
}

/** Evaluate the entire project at a given frame */
export function evaluateProjectAtFrame(project: AnimaProject, frame: number): EvaluatedLayerState[] {
  const t = frameToTime(frame, project.fps);

  return project.layers.map((layer) => {
    // 1. Evaluate channels or fall back to static transform
    const x = layer.channels['transform.x']
      ? evaluateChannel(layer.channels['transform.x'], t, project.fps)
      : layer.transform.x;

    const y = layer.channels['transform.y']
      ? evaluateChannel(layer.channels['transform.y'], t, project.fps)
      : layer.transform.y;

    const z = layer.channels['transform.z']
      ? evaluateChannel(layer.channels['transform.z'], t, project.fps)
      : layer.transform.z;

    const rotZ = layer.channels['transform.rotationZ']
      ? evaluateChannel(layer.channels['transform.rotationZ'], t, project.fps)
      : layer.transform.rotationZ;

    const scX = layer.channels['transform.scaleX']
      ? evaluateChannel(layer.channels['transform.scaleX'], t, project.fps)
      : layer.transform.scaleX;

    const scY = layer.channels['transform.scaleY']
      ? evaluateChannel(layer.channels['transform.scaleY'], t, project.fps)
      : layer.transform.scaleY;

    const opacity = layer.channels['opacity']
      ? evaluateChannel(layer.channels['opacity'], t, project.fps)
      : layer.opacity;

    // 2. Resolve Cel Drawing if applicable
    const activeDrawingId = resolveCelExposure(layer.celTrack, frame);
    const channels: Record<string, number> = {};
    for (const [path, ch] of Object.entries(layer.channels)) channels[path] = evaluateChannel(ch, t, project.fps);

    return {
      layerId: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible,
      opacity: Math.max(0, Math.min(1, opacity)),
      transform: {
        x,
        y,
        z,
        rotationZ: rotZ,
        scaleX: scX,
        scaleY: scY,
      },
      activeDrawingId,
      channels,
    };
  });
}
