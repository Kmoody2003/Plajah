// Melos Beats — the snap grid. One grid model for every editor that places things in time (the
// arrangement, the piano roll, the loop brace, the knife), anchored to the meter map so a grid
// line in 7/8 starts at each bar line rather than marching on in 4/4.
//
//   adaptive — the finest musical division that is still >= MIN_PX wide at the current zoom
//              (Bitwig / Studio One "adaptive"), so zooming in snaps finer without a menu trip.
//   fixed    — the chosen division regardless of zoom.
//   off      — free placement.
// Triplet multiplies the division by 2/3. Holding Shift (or Alt) while dragging bypasses snap.

import type { MeterMap } from './tempoMap';

export type GridDiv = 'bar' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/64';
export type GridMode = 'adaptive' | 'fixed' | 'off';

export interface GridSettings {
  mode: GridMode;
  div: GridDiv;        // used by 'fixed'; in 'adaptive' it is the COARSEST division allowed
  triplet: boolean;
}

export const DEFAULT_GRID: GridSettings = { mode: 'adaptive', div: 'bar', triplet: false };

export const GRID_DIVS: GridDiv[] = ['bar', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64'];

const DIV_BEATS: Record<Exclude<GridDiv, 'bar'>, number> = {
  '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125, '1/64': 0.0625,
};

/** Minimum on-screen width of one adaptive grid cell. */
export const MIN_PX = 14;

/** The active grid cell: whole bars, a fixed number of beats, or none (snap off). */
export type GridStep = { kind: 'bar' } | { kind: 'beats'; beats: number; div: GridDiv } | { kind: 'off' };

/** Resolve the grid cell for a zoom level (pxPerBeat) and bar length (beats). */
export function gridStep(g: GridSettings, pxPerBeat: number, barBeats = 4): GridStep {
  if (g.mode === 'off') return { kind: 'off' };
  const t = g.triplet ? 2 / 3 : 1;
  if (g.mode === 'fixed') {
    if (g.div === 'bar') return { kind: 'bar' };
    return { kind: 'beats', beats: DIV_BEATS[g.div] * t, div: g.div };
  }
  // Adaptive: walk from fine to coarse and take the first division wide enough to hit.
  const coarsest = g.div === 'bar' ? Infinity : DIV_BEATS[g.div];
  const fine: Exclude<GridDiv, 'bar'>[] = ['1/64', '1/32', '1/16', '1/8', '1/4', '1/2'];
  for (const d of fine) {
    const beats = DIV_BEATS[d] * t;
    if (DIV_BEATS[d] > coarsest) break;
    if (beats * pxPerBeat >= MIN_PX && beats < barBeats - 1e-9) return { kind: 'beats', beats, div: d };
  }
  if (coarsest !== Infinity) return { kind: 'beats', beats: coarsest * t, div: g.div };
  return { kind: 'bar' };
}

/** Status-bar text: "Adaptive · 1/16", "1/8T", "Bar", "Off". */
export function gridLabel(g: GridSettings, pxPerBeat: number, barBeats = 4): string {
  const s = gridStep(g, pxPerBeat, barBeats);
  const name = s.kind === 'off' ? 'Off' : s.kind === 'bar' ? 'Bar' : `${s.div}${g.triplet ? 'T' : ''}`;
  return g.mode === 'adaptive' ? `Adaptive · ${name}` : name;
}

export type SnapHow = 'nearest' | 'floor' | 'ceil';

/**
 * Snap a beat to the grid. The grid restarts at every bar line, so odd meters and meter changes
 * snap to real musical positions. `bypass` (Shift/Alt held) returns the beat untouched.
 */
export function snapBeat(
  beat: number, g: GridSettings, meter: MeterMap, pxPerBeat: number,
  opts: { bypass?: boolean; how?: SnapHow } = {},
): number {
  if (opts.bypass) return beat;
  const how = opts.how ?? 'nearest';
  const bar = meter.at(Math.max(0, beat));
  const step = gridStep(g, pxPerBeat, bar.lenBeats);
  if (step.kind === 'off') return beat;
  const candidates: number[] = [];
  if (step.kind === 'bar') {
    candidates.push(bar.startBeat, bar.startBeat + bar.lenBeats);
  } else {
    const local = Math.max(0, beat) - bar.startBeat;
    const k = local / step.beats;
    const lo = bar.startBeat + Math.floor(k + 1e-9) * step.beats;
    candidates.push(lo, Math.min(bar.startBeat + bar.lenBeats, lo + step.beats), bar.startBeat + bar.lenBeats);
  }
  if (beat < 0) return 0;
  if (how === 'floor') return Math.max(...candidates.filter((c) => c <= beat + 1e-9), bar.startBeat);
  if (how === 'ceil') return Math.min(...candidates.filter((c) => c >= beat - 1e-9));
  let best = candidates[0];
  for (const c of candidates) if (Math.abs(c - beat) < Math.abs(best - beat)) best = c;
  return best;
}

/** The size of one grid cell at a position — the minimum clip/note length a trim can reach. */
export function gridCellBeats(beat: number, g: GridSettings, meter: MeterMap, pxPerBeat: number): number {
  const bar = meter.at(Math.max(0, beat));
  const step = gridStep(g, pxPerBeat, bar.lenBeats);
  if (step.kind === 'bar') return bar.lenBeats;
  if (step.kind === 'beats') return step.beats;
  return 1 / 64;
}

export interface GridLineSet {
  bars: { beat: number; bar: number; num: number; den: number; sigChange: boolean }[];
  beats: number[];   // meter counts (quarters in 4/4, eighths in 6/8)
  subs: number[];    // grid subdivisions finer than the count
}

/** Every visible line in [fromBeat, toBeat), thinned so lines never crowd below ~4px. */
export function gridLines(meter: MeterMap, fromBeat: number, toBeat: number, pxPerBeat: number, g: GridSettings): GridLineSet {
  const out: GridLineSet = { bars: [], beats: [], subs: [] };
  // Seed from the bar before the window so only REAL meter changes are flagged (bar 1 always is).
  const first = meter.at(Math.max(0, fromBeat));
  const before = first.bar > 0 ? meter.at(first.startBeat - 1e-6) : null;
  let prevSig = before ? `${before.num}/${before.den}` : '';
  for (const b of meter.bars(Math.max(0, fromBeat), toBeat)) {
    const sig = `${b.num}/${b.den}`;
    out.bars.push({ beat: b.startBeat, bar: b.bar, num: b.num, den: b.den, sigChange: sig !== prevSig });
    prevSig = sig;
    if (b.unitBeats * pxPerBeat >= 6) {
      for (let u = 1; u < b.num; u++) out.beats.push(b.startBeat + u * b.unitBeats);
    }
    const step = gridStep(g, pxPerBeat, b.lenBeats);
    if (step.kind === 'beats' && step.beats * pxPerBeat >= 4 && step.beats < b.unitBeats - 1e-9) {
      for (let x = step.beats; x < b.lenBeats - 1e-9; x += step.beats) {
        const units = x / b.unitBeats;
        if (Math.abs(units - Math.round(units)) > 1e-6) out.subs.push(b.startBeat + x);
      }
    }
  }
  return out;
}
