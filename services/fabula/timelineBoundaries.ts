/** Preserve source edit times. Millisecond rounding can report a cut before it exists. */
export function timelineBoundaries(clips: any[]): number[] {
  const marks = new Set<number>([0]);
  for (const c of clips) {
    if (!Number.isFinite(c.start) || !Number.isFinite(c.duration)) continue;
    marks.add(c.start); marks.add(c.start + c.duration);
    const fx = c.fx || {};
    for (let t = 0.1; t <= Math.min(fx.fadeIn || 0, c.duration); t += 0.1) marks.add(c.start + t);
    for (let t = 0.1; t <= Math.min(fx.fadeOut || 0, c.duration); t += 0.1) marks.add(c.start + c.duration - t);
  }
  return [...marks].sort((a, b) => a - b);
}

export function crossedTimelineBoundary(bounds: number[], previous: number, current: number): boolean {
  if (previous === current) return false;
  // Forward enters at the boundary; reverse leaves only once strictly below it.
  return current > previous
    ? bounds.some((b) => b > previous && b <= current)
    : bounds.some((b) => b > current && b <= previous);
}
