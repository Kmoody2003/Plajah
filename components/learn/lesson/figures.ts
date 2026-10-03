/**
 * Lesson figures: everything in a lesson that is not a paragraph. One typed model, a few renderers, and pure helpers
 * (tested) for the scientific kinds. Subject recipes:
 *   history / civics   plate (archive photo or artwork) + timeline + audio (speeches, music of the era)
 *   science            chart (real data, axes, units) + diagram (process, cycle, apparatus)
 *   math               graph (function plot with marked points) + worked steps in the text
 *   art / design       plate (museum open-access artwork, large) + palette/detail crops
 *   music              audio (Vault recording) + score excerpt later
 *   film / media       video (poster + player, teacher or Reello upload) + stills
 * A figure always carries a caption in our words (the teaching point), a credit/source, and a text alternative.
 */
import type { MediaRef } from '../../../services/lessonMedia';

export type FigureLayout = 'wide' | 'inline' | 'margin';
interface Base { id: string; caption: string; /** index of the text block it follows; default: after the lede */ after?: number; layout?: FigureLayout; alt?: string; credit?: string; sourceUrl?: string }

export interface Series { name: string; points: Array<[number, number]> }
export type Figure = Base & (
  | { type: 'plate'; ref: MediaRef }
  | { type: 'audio'; ref: MediaRef }
  | { type: 'video'; url: string; poster?: string }
  | { type: 'chart'; kind: 'line' | 'bar' | 'scatter'; title: string; x: { label: string; unit?: string }; y: { label: string; unit?: string }; series: Series[] }
  | { type: 'graph'; title: string; /** authored in code */ fn?: (x: number) => number; /** a curve with one adjustable parameter (drawn with a slider): fnp(x, p) */ fnp?: (x: number, p: number) => number; param?: { name: string; min: number; max: number; step: number; value: number; unit?: string }; /** typed by a teacher; parsed safely, never evaluated as code */ expr?: string; domain: [number, number]; x: { label: string }; y: { label: string }; marks?: Array<{ x: number; label: string }> }
  | { type: 'diagram'; title: string; nodes: Array<{ id: string; label: string; col: number; row: number }>; edges: Array<[string, string, string?]> }
  | { type: 'sim'; title: string; sim: 'unitcircle' | 'population' | 'sorting' }
  | { type: 'timeline'; title: string; events: Array<{ when: string; label: string }> }
);

/** "Nice" axis ticks (1, 2, 5 times a power of ten) covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): { ticks: number[]; lo: number; hi: number } {
  if (!(isFinite(min) && isFinite(max))) return { ticks: [0, 1], lo: 0, hi: 1 };
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks: number[] = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { ticks, lo, hi };
}

/** Maps data to an SVG box and returns a polyline path; points outside the finite range break the line. */
export function plotPath(pts: Array<[number, number]>, sx: (x: number) => number, sy: (y: number) => number): string {
  let d = '', pen = false;
  for (const [x, y] of pts) {
    if (!isFinite(x) || !isFinite(y)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`; pen = true;
  }
  return d;
}

export function sampleFn(fn: (x: number) => number, [a, b]: [number, number], n = 200): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) { const x = a + ((b - a) * i) / n; let y = NaN; try { y = fn(x); } catch { /* undefined here */ } out.push([x, y]); }
  return out;
}

export const fmtTick = (v: number): string => (Math.abs(v) >= 10000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(0) : String(+v.toPrecision(6)));

/** Where each figure goes among the text blocks: after `after`, else after the first body block. */
export function placeFigures<T extends { after?: number }>(figs: T[], textBlockCount: number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const f of figs) {
    const at = Math.min(Math.max(0, f.after ?? 0), Math.max(0, textBlockCount - 1));
    (m.get(at) || m.set(at, []).get(at)!).push(f);
  }
  return m;
}
