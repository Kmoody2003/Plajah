// Melos Beats — automation. Pure lane math shared by the timeline lanes, the piano roll's CC
// lanes, the live engine, the offline bounce, the recorder and MIDI export.
//
// A lane is breakpoints in native units (grooveDoc AutomationTarget). Between two points the
// value follows the left point's curve (linear / smooth S / ease-in / ease-out / hold). Before
// the first point the lane holds the first value; after the last, the last value.

import type {
  ArrangeTrack, AutomationCurve, AutomationPoint, AutomationTarget, GrooveDoc, TimelineClip, TrackAutomationLane,
} from './grooveDoc';
import { contentWindows } from './clipContent';

export interface TargetSpec {
  label: string;
  short: string;
  min: number;
  max: number;
  /** The control's value when no lane drives it. */
  rest: number;
  /** Stepped targets (sustain pedal) never interpolate. */
  stepped?: boolean;
  format: (v: number) => string;
  color: string;
}

export const VOLUME_FLOOR_DB = -70;

export function targetSpec(t: AutomationTarget): TargetSpec {
  switch (t.kind) {
    case 'volume': return { label: 'Volume', short: 'Vol', min: VOLUME_FLOOR_DB, max: 6, rest: 0, color: '#00DAF3',
      format: (v) => (v <= VOLUME_FLOOR_DB + 0.05 ? '−∞ dB' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`) };
    case 'pan': return { label: 'Pan', short: 'Pan', min: -1, max: 1, rest: 0, color: '#D0BCFF',
      format: (v) => (Math.abs(v) < 0.005 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`) };
    case 'send': return { label: `Send FX ${t.index + 1}`, short: `FX${t.index + 1}`, min: 0, max: 1.5, rest: 0, color: '#06D6A0',
      format: (v) => `${Math.round(v * 100)}%` };
    case 'macro': return { label: `Macro ${t.index + 1}`, short: `M${t.index + 1}`, min: 0, max: 1, rest: 0, color: '#FF8C00',
      format: (v) => `${Math.round(v * 100)}%` };
    case 'mod-wheel': return { label: 'Mod wheel (CC1)', short: 'CC1', min: 0, max: 1, rest: 0, color: '#FFD166',
      format: (v) => String(Math.round(v * 127)) };
    case 'expression': return { label: 'Expression (CC11)', short: 'CC11', min: 0, max: 1, rest: 1, color: '#38BDF8',
      format: (v) => String(Math.round(v * 127)) };
    case 'sustain': return { label: 'Sustain (CC64)', short: 'CC64', min: 0, max: 1, rest: 0, stepped: true, color: '#F472B6',
      format: (v) => (v >= 0.5 ? 'Down' : 'Up') };
    case 'pitch-bend': return { label: 'Pitch bend', short: 'PB', min: -1, max: 1, rest: 0, color: '#FB923C',
      format: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%` };
  }
}

export const targetKey = (t: AutomationTarget): string =>
  t.kind === 'send' || t.kind === 'macro' ? `${t.kind}:${t.index}` : t.kind;

/** Targets driven by Web Audio params (sample-accurate live and offline). */
export const isParamTarget = (t: AutomationTarget) =>
  t.kind === 'volume' || t.kind === 'pan' || t.kind === 'send' || t.kind === 'expression';
/** Targets that are instrument messages (sent at the engine tick live, suspend-applied offline). */
export const isMessageTarget = (t: AutomationTarget) =>
  t.kind === 'macro' || t.kind === 'mod-wheel' || t.kind === 'pitch-bend';

/** Targets a TRACK lane can carry (by track kind). Clip CC lanes use MIDI_LANE_TARGETS. */
export function trackLaneTargets(track: ArrangeTrack): AutomationTarget[] {
  const mix: AutomationTarget[] = [{ kind: 'volume' }, { kind: 'pan' }, { kind: 'send', index: 0 }, { kind: 'send', index: 1 }];
  if (track.kind !== 'instrument') return mix;
  return [...mix, ...Array.from({ length: 8 }, (_, i) => ({ kind: 'macro', index: i }) as AutomationTarget), ...MIDI_LANE_TARGETS];
}
export const MIDI_LANE_TARGETS: AutomationTarget[] = [
  { kind: 'mod-wheel' }, { kind: 'expression' }, { kind: 'sustain' }, { kind: 'pitch-bend' },
];

/** The control's current static value on a track (what the lane overrides). */
export function staticValue(track: ArrangeTrack, t: AutomationTarget): number {
  if (t.kind === 'volume') return track.gainDb;
  if (t.kind === 'pan') return track.pan;
  if (t.kind === 'send') return track.sends?.[t.index] ?? 0;
  return targetSpec(t).rest;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Shape a 0..1 segment fraction by the curve. */
export function shape(curve: AutomationCurve | undefined, f: number): number {
  switch (curve) {
    case 'hold': return 0;
    case 'smooth': return f * f * (3 - 2 * f);
    case 'ease-in': return f * f;
    case 'ease-out': return 1 - (1 - f) * (1 - f);
    default: return f;
  }
}

/** Lane value at a beat. Empty lane → undefined (the control's static value applies). */
export function laneValueAt(lane: Pick<TrackAutomationLane, 'points' | 'target'>, beat: number): number | undefined {
  const pts = lane.points;
  if (!pts.length) return undefined;
  if (beat <= pts[0].beat) return pts[0].value;
  const last = pts[pts.length - 1];
  if (beat >= last.beat) return last.value;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].beat <= beat) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[hi];
  if (targetSpec(lane.target).stepped) return a.value;
  const f = (beat - a.beat) / Math.max(1e-9, b.beat - a.beat);
  return a.value + (b.value - a.value) * shape(a.curve, f);
}

/**
 * Breakpoints to schedule as LINEAR ramps over [fromBeat, toBeat]: the value at fromBeat, every
 * point inside, and curved segments sampled every `resolution` beats. Hold segments emit a step
 * (two points at the same beat).
 */
export function laneRamps(lane: TrackAutomationLane, fromBeat: number, toBeat: number, resolution = 1 / 16): AutomationPoint[] {
  const v0 = laneValueAt(lane, fromBeat);
  if (v0 === undefined) return [];
  const out: AutomationPoint[] = [{ beat: fromBeat, value: v0 }];
  const pts = lane.points;
  const stepped = !!targetSpec(lane.target).stepped;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const segStart = a.beat, segEnd = b ? b.beat : Infinity;
    if (segEnd <= fromBeat || segStart >= toBeat) continue;
    if (!b) break;
    const holding = stepped || a.curve === 'hold';
    if (holding) {
      if (b.beat > fromBeat && b.beat <= toBeat) {
        out.push({ beat: b.beat, value: a.value }, { beat: b.beat, value: b.value });
      }
      continue;
    }
    if (a.curve && a.curve !== 'linear') {
      const s = Math.max(fromBeat, segStart);
      const e = Math.min(toBeat, segEnd);
      for (let x = Math.ceil((s - segStart) / resolution) * resolution + segStart; x < e - 1e-9; x += resolution) {
        if (x > fromBeat + 1e-9) out.push({ beat: x, value: laneValueAt(lane, x)! });
      }
    }
    if (b.beat > fromBeat && b.beat <= toBeat) out.push({ beat: b.beat, value: b.value });
  }
  return out;
}

/**
 * A clip's CC lane as ABSOLUTE song-beat points, honouring the clip's content offset and loop.
 * Outside the clip the control returns to rest, so the lane begins and ends at rest values.
 */
export function clipLaneToSong(clip: TimelineClip, lane: TrackAutomationLane): AutomationPoint[] {
  const rest = targetSpec(lane.target).rest;
  const EPS = 1e-6;
  const end = clip.startBeats + clip.lengthBeats;
  // Rest right up to the clip, then each content window (a loop pass, or the single pass), each
  // ending in a hold so the jump back to the loop start is a step, not a ramp.
  const out: AutomationPoint[] = [{ beat: Math.max(0, clip.startBeats - EPS), value: rest, curve: 'hold' }];
  for (const w of contentWindows(clip, clip.startBeats, end)) {
    const songOf = (c: number) => w.songStart + (c - w.contentStart);
    const at = (c: number) => laneValueAt(lane, c) ?? rest;
    const startCurve = lane.points.filter((p) => p.beat <= w.contentStart + 1e-9).pop()?.curve;
    out.push({ beat: w.songStart, value: at(w.contentStart), curve: startCurve });
    for (const p of lane.points) {
      if (p.beat > w.contentStart + 1e-9 && p.beat < w.contentEnd - 1e-9) out.push({ beat: songOf(p.beat), value: p.value, curve: p.curve });
    }
    out.push({ beat: songOf(w.contentEnd) - EPS, value: at(w.contentEnd - EPS), curve: 'hold' });
  }
  out.push({ beat: end, value: rest, curve: 'hold' });
  return sortPoints(out);
}

const sortPoints = (pts: AutomationPoint[]) => pts.slice().sort((a, b) => a.beat - b.beat);

/**
 * Everything that drives a track during song playback, merged per target: the track's own lanes
 * plus its clips' CC lanes (clip lanes win while their clip plays). Keyed by targetKey.
 */
export function effectiveLanes(track: ArrangeTrack): Map<string, TrackAutomationLane> {
  const out = new Map<string, TrackAutomationLane>();
  for (const lane of track.automationLanes ?? []) {
    if (lane.points.length) out.set(targetKey(lane.target), { ...lane, points: lane.points.slice().sort((a, b) => a.beat - b.beat) });
  }
  for (const clip of track.clips) {
    for (const lane of clip.automationLanes ?? []) {
      if (!lane.points.length) continue;
      const key = targetKey(lane.target);
      const songPts = clipLaneToSong(clip, { ...lane, points: lane.points.slice().sort((a, b) => a.beat - b.beat) });
      const base = out.get(key);
      if (!base) { out.set(key, { id: `clip:${clip.id}:${key}`, target: lane.target, points: songPts }); continue; }
      // Splice the clip's span into the track lane.
      const s = clip.startBeats, e = clip.startBeats + clip.lengthBeats;
      const kept = base.points.filter((p) => p.beat < s - 1e-9 || p.beat > e + 1e-9);
      const resume = laneValueAt(base, e);
      const merged = [...kept, ...songPts.slice(0, -1)];
      if (resume !== undefined) merged.push({ beat: e, value: resume });
      out.set(key, { ...base, points: sortPoints(merged) });
    }
  }
  return out;
}

/** effectiveLanes, memoised per track until the doc changes (every mutate bumps updatedAt). */
const laneCache = new WeakMap<ArrangeTrack, { v: number; lanes: Map<string, TrackAutomationLane> }>();
export function effectiveLanesFor(doc: GrooveDoc, track: ArrangeTrack): Map<string, TrackAutomationLane> {
  const hit = laneCache.get(track);
  if (hit && hit.v === doc.updatedAt) return hit.lanes;
  const lanes = effectiveLanes(track);
  laneCache.set(track, { v: doc.updatedAt, lanes });
  return lanes;
}

/**
 * Sustain pedal: a note whose natural end lands while the pedal is down rings until the pedal
 * comes up. Returns the extended end beat (capped at `limit`).
 */
export function sustainedEnd(sustain: TrackAutomationLane | undefined, endBeat: number, limit: number): number {
  if (!sustain || !sustain.points.length) return endBeat;
  if ((laneValueAt(sustain, endBeat) ?? 0) < 0.5) return endBeat;
  for (const p of sustain.points) {
    if (p.beat > endBeat && p.value < 0.5) return Math.min(limit, p.beat);
  }
  return limit;
}

// ── recording ───────────────────────────────────────────────────────────────

/**
 * Write a value over (fromBeat, toBeat] into a lane — what Touch/Latch/Write do every tick. The
 * existing points in that span are replaced; consecutive equal values are thinned so a held
 * fader writes two points, not a hundred.
 */
export function writeLane(lane: TrackAutomationLane, fromBeat: number, toBeat: number, value: number): void {
  if (toBeat <= fromBeat) return;
  const spec = targetSpec(lane.target);
  const v = clamp(value, spec.min, spec.max);
  const before = laneValueAt(lane, fromBeat);
  const kept = lane.points.filter((p) => p.beat <= fromBeat + 1e-9 || p.beat > toBeat + 1e-9);
  const pts = kept.filter((p) => p.beat <= fromBeat + 1e-9);
  const after = kept.filter((p) => p.beat > toBeat + 1e-9);
  // Anchor the start of the write so earlier automation isn't bent toward the new value.
  if (before !== undefined && !pts.some((p) => Math.abs(p.beat - fromBeat) < 1e-9)) pts.push({ beat: fromBeat, value: before });
  const prev = pts[pts.length - 1];
  const prev2 = pts[pts.length - 2];
  if (prev && prev2 && Math.abs(prev.value - v) < 1e-6 && Math.abs(prev2.value - v) < 1e-6) prev.beat = toBeat; // extend a flat run
  else pts.push({ beat: toBeat, value: v });
  lane.points = [...pts, ...after].sort((a, b) => a.beat - b.beat);
}

/** Find or create a track lane for a target. */
export function ensureLane(track: ArrangeTrack, target: AutomationTarget, uid: () => string): TrackAutomationLane {
  const key = targetKey(target);
  const lanes = (track.automationLanes ??= []);
  let lane = lanes.find((l) => targetKey(l.target) === key);
  if (!lane) { lane = { id: uid(), target, points: [] }; lanes.push(lane); }
  return lane;
}

/** Sorted, value-clamped copy (after an edit). */
export function normalizeLane(lane: TrackAutomationLane): void {
  const spec = targetSpec(lane.target);
  lane.points = lane.points
    .map((p) => ({ ...p, beat: Math.max(0, p.beat), value: clamp(p.value, spec.min, spec.max) }))
    .sort((a, b) => a.beat - b.beat);
}

/** dB → linear gain with the lane floor as silence. */
export const laneDbToGain = (db: number) => (db <= VOLUME_FLOOR_DB + 0.05 ? 0 : Math.pow(10, db / 20));

/** Every lane of every track, effective, for the doc (engine + render share this). */
export function docEffectiveLanes(doc: GrooveDoc): Map<string, Map<string, TrackAutomationLane>> {
  const out = new Map<string, Map<string, TrackAutomationLane>>();
  for (const t of doc.arrangement) {
    if (t.foreign) continue;
    const lanes = effectiveLanes(t);
    if (lanes.size) out.set(t.id, lanes);
  }
  return out;
}
