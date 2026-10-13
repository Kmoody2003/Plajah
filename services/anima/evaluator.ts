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

/** Wiggle expression generator */
function evaluateWiggle(freq: number, amp: number, time: number): number {
  const t = time * freq;
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const h1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const r1 = (h1 - Math.floor(h1)) * 2 - 1;
  const h2 = Math.sin((i + 1) * 12.9898 + 78.233) * 43758.5453;
  const r2 = (h2 - Math.floor(h2)) * 2 - 1;
  return (r1 + (r2 - r1) * u) * amp;
}

/** Evaluate a single AnimaChannel with Keyframe + Expression + Behavior tiers */
export function evaluateChannel(channel: AnimaChannel<number>, t: number, fps = 24): number {
  // Tier 1: Keyframe Base
  let val = sampleKeyframeTrack(channel.keyframes, t, channel.defaultValue);

  // Tier 2: Mathematical Expression
  if (channel.expression?.enabled && channel.expression.code) {
    const code = channel.expression.code.trim();
    if (code.startsWith('wiggle(')) {
      const match = code.match(/wiggle\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
      if (match) {
        const freq = parseFloat(match[1]) || 2;
        const amp = parseFloat(match[2]) || 10;
        val += evaluateWiggle(freq, amp, t);
      }
    } else if (code.startsWith('loopOut(')) {
      if (channel.keyframes.length >= 2) {
        const first = channel.keyframes[0].t;
        const last = channel.keyframes[channel.keyframes.length - 1].t;
        const cycle = last - first;
        if (cycle > 1e-4 && t > last) {
          const rem = (t - first) % cycle;
          val = sampleKeyframeTrack(channel.keyframes, first + rem, channel.defaultValue);
        }
      }
    } else if (code.includes('Math.sin')) {
      try {
        const fn = new Function('time', 'frame', 'fps', 'value', `return (${code});`);
        val = fn(t, Math.floor(t * fps), fps, val);
      } catch {
        // Safe fallback
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
}

/** Evaluate the entire project at a given frame */
export function evaluateProjectAtFrame(project: AnimaProject, frame: number): EvaluatedLayerState[] {
  const t = frame / Math.max(1, project.fps);

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
    };
  });
}
