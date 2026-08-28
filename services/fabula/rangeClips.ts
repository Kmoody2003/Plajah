// rangeClips — transform a timeline to a sub-range [t0, t1) for range rendering
// (In→Out, or per-marker dailies). Keeps clips that overlap the window, shifts
// them to a zero origin, and pushes srcIn forward when the range cuts mid-clip
// so the source frame stays correct. Pure — the render queue and its test share it.

export interface RangeClip {
  start: number;
  duration: number;
  srcIn?: number;
  [k: string]: any;
}

export function rangeClips<T extends RangeClip>(clips: T[], t0: number, t1: number): T[] {
  const out: T[] = [];
  for (const c of clips) {
    const cs = c.start, ce = c.start + c.duration;
    const s = Math.max(cs, t0), e = Math.min(ce, t1);
    if (e - s < 1e-4) continue;                          // no overlap with the range
    out.push({ ...c, start: s - t0, duration: e - s, srcIn: (c.srcIn || 0) + (s - cs) });
  }
  return out;
}
