// Shots inside one take. Edited footage (trailers, AI combat reels, turntable-then-action videos) cuts between camera
// set-ups; solving across a cut teleports the performer and smears two moves into one. A take is split where the
// picture changes completely (capture.ts ShotCuts scores) or where the performer jumps on screen faster than a body
// can move, and each shot is solved on its own.
import type { RawFrame, RawTake } from './types';

export interface Shot {
  /** Frame range [start, end] inside the take (inclusive). */
  start: number; end: number;
  /** Share of the shot's frames with the performer found. */
  found: number;
  /** Mean size of the performer on screen (shoulder→hip length, share of the frame height). */
  size: number;
  /** Why the shot starts here. */
  cause: 'start' | 'picture' | 'jump';
}

const centre = (f: RawFrame) => {
  const q = [11, 12, 23, 24].map((i) => f.pts[i]);
  return {
    x: q.reduce((a, b) => a + b.x, 0) / 4, y: q.reduce((a, b) => a + b.y, 0) / 4,
    s: (Math.hypot(q[0].x - q[2].x, q[0].y - q[2].y) + Math.hypot(q[1].x - q[3].x, q[1].y - q[3].y)) / 2,
  };
};

export interface ShotOptions {
  /** A picture spike counts when its score is this many times the calm around it (default 1.8) … */
  spike?: number;
  /** … and at least this big (0..1, default 0.2). */
  picture?: number;
  /** Performer jump between neighbouring frames, in torso lengths, that counts as a cut on its own (default 1.2);
   *  a picture spike needs only `confirm` torso lengths (default 0.45) or a size change of `zoomConfirm`. */
  jump?: number; confirm?: number;
  /** Size change between neighbouring frames that counts as a cut on its own (ratio, default 1.45; with a picture
   *  spike, 1.2). */
  zoom?: number; zoomConfirm?: number;
  /** Shots shorter than this are merged into the one before (seconds, default 0.3). */
  minSec?: number;
}

const med = (a: number[]) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/** Picture spikes: frames whose change from the frame before stands far above the change around them. A cut is a
 *  one-frame jump; camera moves, motion blur and particles change the picture every frame (high but flat), and a
 *  VFX flash spikes without the performer moving (checked by findShots). */
export function pictureSpikes(cuts: number[] | undefined, o: ShotOptions = {}): number[] {
  if (!cuts) return [];
  const k = o.spike ?? 1.8, min = o.picture ?? 0.2, out: number[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const calm = Math.max(med(cuts.slice(Math.max(1, i - 4), i)), med(cuts.slice(i + 1, i + 5)), 0.02);
    if (cuts[i] >= min && cuts[i] > k * calm) out.push(i);
  }
  return out;
}

/** Split a take into camera shots. */
export function findShots(take: RawTake, o: ShotOptions = {}): Shot[] {
  const n = take.frames.length, jump = o.jump ?? 1.2, zoom = o.zoom ?? 1.45, conf = o.confirm ?? 0.45, zc = o.zoomConfirm ?? 1.2;
  const minF = Math.max(2, Math.round((o.minSec ?? 0.3) * take.fps));
  const spikes = new Set(pictureSpikes(take.cuts, o));
  const at = (i: number) => (take.frames[i] ? centre(take.frames[i]!) : null);
  const near = (i: number, dir: 1 | -1) => { for (let k = 0; k < 3; k++) { const c = at(i + dir * k); if (c) return c; } return null; };
  const moved = (a: ReturnType<typeof centre> | null, b: ReturnType<typeof centre> | null) => {
    if (!a || !b) return null;
    return { d: Math.hypot(a.x - b.x, a.y - b.y) / Math.max(0.02, Math.max(a.s, b.s)), r: Math.max(a.s, b.s) / Math.max(1e-3, Math.min(a.s, b.s)) };
  };
  const starts: { i: number; cause: Shot['cause'] }[] = [{ i: 0, cause: 'start' }];
  for (let i = 1; i < n; i++) {
    let cause: Shot['cause'] | null = null;
    if (spikes.has(i)) {
      // confirmed by the performer: they jump on screen across the spike, or vanish on one side of it
      const m = moved(near(i - 1, -1), near(i, 1));
      if (!m || m.d > conf || m.r > zc) cause = 'picture';
    }
    if (!cause && take.frames[i] && take.frames[i - 1]) {
      // a jump that holds: the performer stays at the new place for the next frames (a one-frame mis-detection, a
      // VFX flash picked as the body, snaps back)
      const big = (m: ReturnType<typeof moved>) => !!m && (m.d > jump || m.r > zoom);
      const small = (m: ReturnType<typeof moved>) => !!m && m.d < conf && m.r < zc;
      if (big(moved(at(i - 1), at(i))) && big(moved(near(i - 1, -1), at(i + 2))) && small(moved(at(i), at(i + 2))) && small(moved(at(i - 1), at(i - 3)))) cause = 'jump';
    }
    if (!cause) continue;
    if (i - starts[starts.length - 1].i < minF) {
      // a run of quick flashes: keep the latest boundary, drop the sliver
      if (starts.length > 1) starts[starts.length - 1] = { i, cause };
    } else starts.push({ i, cause });
  }
  return starts.map((s, k) => {
    const end = (starts[k + 1]?.i ?? n) - 1;
    let got = 0, size = 0;
    for (let i = s.i; i <= end; i++) { const f = take.frames[i]; if (f) { got++; size += centre(f).s; } }
    const len = end - s.i + 1;
    return { start: s.i, end, found: +(got / len).toFixed(3), size: +(got ? size / got : 0).toFixed(3), cause: s.cause };
  });
}

/** The frames [a, b] of a take as a take of their own (times start at 0). */
export function sliceTake(take: RawTake, a: number, b: number, label?: string): RawTake {
  const frames = take.frames.slice(a, b + 1).map((f, k) => (f ? { ...f, t: k / take.fps } : null));
  return {
    ...take, frames, cuts: take.cuts?.slice(a, b + 1),
    source: { ...take.source, label: label ?? `${take.source.label} [${(a / take.fps).toFixed(2)}–${(b / take.fps).toFixed(2)}s]` },
  };
}

/** Frame index for a time in seconds. */
export const frameAt = (take: RawTake, sec: number) => Math.max(0, Math.min(take.frames.length - 1, Math.round(sec * take.fps)));
