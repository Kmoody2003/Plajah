// presentationTimeline — the timed-slideshow model behind the timeline strip that
// sits above every Stage presentation.
//
// A slide's time on the strip is its own `advanceAfterSec` when the operator has
// set one (typed, or dragged out like a clip), otherwise the presentation's
// default seconds-per-slide (`show.timeline.defaultSlideSec`, 8s unless changed).
// Pure and dependency-free so the strip, the playback clock and the Fabula
// export all agree on the same numbers.

import type { Show, Slide } from './showModel';

export const DEFAULT_SLIDE_SEC = 8;
export const MIN_SLIDE_SEC = 0.5;
export const MAX_SLIDE_SEC = 60 * 60;

export interface TimelineClip {
  slideId: string;
  index: number;
  start: number;
  dur: number;
  /** True when the slide carries its own duration (not the default). */
  custom: boolean;
}

export interface TimelineLayout {
  clips: TimelineClip[];
  total: number;
}

export function clampSlideSec(sec: number): number {
  if (!Number.isFinite(sec)) return DEFAULT_SLIDE_SEC;
  return Math.min(MAX_SLIDE_SEC, Math.max(MIN_SLIDE_SEC, Math.round(sec * 10) / 10));
}

export function defaultSlideSec(show: Pick<Show, 'timeline'> | null | undefined): number {
  const d = show?.timeline?.defaultSlideSec;
  return d && d > 0 ? clampSlideSec(d) : DEFAULT_SLIDE_SEC;
}

export function slideDurationSec(slide: Pick<Slide, 'advanceAfterSec'>, show: Pick<Show, 'timeline'> | null | undefined): number {
  return slide.advanceAfterSec && slide.advanceAfterSec > 0 ? clampSlideSec(slide.advanceAfterSec) : defaultSlideSec(show);
}

export function layoutTimeline(slides: readonly Slide[], show: Pick<Show, 'timeline'> | null | undefined): TimelineLayout {
  let t = 0;
  const clips = slides.map((s, index) => {
    const dur = slideDurationSec(s, show);
    const clip: TimelineClip = { slideId: s.id, index, start: t, dur, custom: !!(s.advanceAfterSec && s.advanceAfterSec > 0) };
    t += dur;
    return clip;
  });
  return { clips, total: t };
}

/** The clip playing at time `t` (clamped to the strip). */
export function clipAtTime(layout: TimelineLayout, t: number): TimelineClip | null {
  if (layout.clips.length === 0) return null;
  const x = Math.max(0, Math.min(t, layout.total - 1e-6));
  return layout.clips.find(c => x >= c.start && x < c.start + c.dur) ?? layout.clips[layout.clips.length - 1];
}

/** Where a drop at time `t` lands: before the clip whose midpoint is past `t`. */
export function insertIndexAtTime(layout: TimelineLayout, t: number): number {
  for (const c of layout.clips) if (t < c.start + c.dur / 2) return c.index;
  return layout.clips.length;
}

/** Snap a time to the grid (and to clip edges within `edgeTol`). */
export function snapTime(t: number, grid = 0.5, edges: readonly number[] = [], edgeTol = 0): number {
  for (const e of edges) if (Math.abs(e - t) <= edgeTol) return e;
  return Math.round(t / grid) * grid;
}

export function formatTimecode(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(r % 1 ? 1 : 0)}`;
}
