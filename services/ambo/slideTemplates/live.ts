// live — the hook for slide objects that redraw every frame from code:
// photo walls that drift, video wells that take over the screen, audio
// waveforms and progress bars, animated charts.
//
// A designer emits an ordinary box object (usually a RECT with no fill) and
// tags it `live: { drawer, props }`. The renderer calls the registered drawer
// inside the object's own transform, so theme entrances, exits and opacity
// still apply. Drawers live in their own modules (photoDrawers, videoSlide,
// audioSlide, dataDrawers) and register themselves on import.
//
// The SlideHost is the per-source context: one per TelaTemplateSource (each
// output window has its own). Galleries and thumbnails pass no host — drawers
// must then draw a still, representative frame and never start media.
import type { SlideObj, SlideTheme } from './types';

export interface SlideHost {
  /** Unique per source instance — key media elements / state by this. */
  id: string;
  /** True only in the one window allowed to make sound (Ambo program monitor). */
  audible: boolean;
  templateId: string;
  fields: Record<string, string>;
  /** Output size in px. */
  w: number; h: number;
  /** Seconds since this slide was taken (entrance start); -1 before. */
  shownSec: number;
  /** Exit progress 0..1 while the slide is being cleared, else 0. */
  exitP: number;
  /** Ask the source to redraw the whole frame every tick (media playing). */
  requestLive(on: boolean): void;
}

export interface LiveEnv {
  /** Ambient clock in seconds (0 when reduced motion). */
  t: number;
  th: SlideTheme;
  W: number; H: number;
  /** Entrance / exit progress of this object 0..1 (1 = fully on). */
  alpha: number;
  reduced: boolean;
  host?: SlideHost;
}

export type LiveDrawer = (ctx: CanvasRenderingContext2D, o: SlideObj, env: LiveEnv) => void;

const drawers = new Map<string, LiveDrawer>();
export function registerLiveDrawer(id: string, fn: LiveDrawer): void { drawers.set(id, fn); }
export function liveDrawer(id: string): LiveDrawer | undefined { return drawers.get(id); }

// ── host lifecycle ──────────────────────────────────────────────────────────
const disposers = new Map<string, Set<() => void>>();
/** Run `fn` when the host's slide is disposed (stop media, release elements). */
export function onHostDispose(hostId: string, fn: () => void): void {
  let s = disposers.get(hostId);
  if (!s) { s = new Set(); disposers.set(hostId, s); }
  s.add(fn);
}
export function disposeHost(hostId: string): void {
  const s = disposers.get(hostId);
  disposers.delete(hostId);
  s?.forEach(fn => { try { fn(); } catch { /* */ } });
}
