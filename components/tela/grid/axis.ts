// axis — pixel layout of one grid axis (rows or columns) at spreadsheet scale.
//
// A sheet can have a million rows, but only a handful differ from the default
// size (custom heights, hidden or filtered rows). So an Axis stores just those
// "special" indices, sorted, with a prefix sum of their size deltas: offsetOf(i)
// and indexAt(px) are O(log k) binary searches, never an O(n) array. Rebuilding
// an Axis costs O(k log k), which is why the grid can rebuild it per workbook.

export class Axis {
  /** Sorted indices whose size differs from `def` (hidden ones have size 0). */
  private idx: number[] = [];
  private size: number[] = [];
  /** prefix[k] = sum of (size - def) over specials before k. */
  private prefix: number[] = [];

  constructor(
    /** Number of addressable lines (rows / cols) on this axis. */
    readonly count: number,
    /** Default line size in px. */
    readonly def: number,
    sizes?: Record<string, number> | Map<number, number>,
    hidden?: Iterable<number>,
  ) {
    const m = new Map<number, number>();
    if (sizes instanceof Map) for (const [k, v] of sizes) { if (v !== def) m.set(k, Math.max(0, v)); }
    else if (sizes) for (const k in sizes) { const v = sizes[k]; if (v !== def && Number.isFinite(v)) m.set(+k, Math.max(0, v)); }
    if (hidden) for (const h of hidden) m.set(h, 0);
    const keys = [...m.keys()].filter(k => k >= 0 && k < count).sort((a, b) => a - b);
    let acc = 0;
    for (const k of keys) { this.idx.push(k); const s = m.get(k)!; this.size.push(s); this.prefix.push(acc); acc += s - def; }
    this.prefix.push(acc);
  }

  /** Count of specials with index < i. */
  private rank(i: number): number {
    let lo = 0, hi = this.idx.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.idx[mid] < i) lo = mid + 1; else hi = mid; }
    return lo;
  }

  sizeOf(i: number): number {
    const k = this.rank(i);
    return k < this.idx.length && this.idx[k] === i ? this.size[k] : this.def;
  }
  isHidden(i: number): boolean { return this.sizeOf(i) === 0; }

  /** Pixel start of line i (i may equal count → total extent). */
  offsetOf(i: number): number {
    const k = this.rank(i);
    return i * this.def + this.prefix[k];
  }
  get total(): number { return this.offsetOf(this.count); }

  /** Line under pixel px (clamped to [0, count-1]); skips zero-size lines. */
  indexAt(px: number): number {
    if (px <= 0) return this.nextVisible(0);
    if (px >= this.total) return this.prevVisible(this.count - 1);
    // Largest special k whose start <= px.
    let lo = 0, hi = this.idx.length - 1, k = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const start = this.idx[mid] * this.def + this.prefix[mid];
      if (start <= px) { k = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (k < 0) return Math.min(this.count - 1, Math.floor(px / this.def));
    const start = this.idx[k] * this.def + this.prefix[k];
    if (px < start + this.size[k]) return this.idx[k];
    const after = start + this.size[k];
    const i = this.idx[k] + 1 + Math.floor((px - after) / this.def);
    return Math.min(this.count - 1, this.nextVisible(i));
  }

  nextVisible(i: number): number {
    let j = Math.max(0, i);
    while (j < this.count - 1 && this.sizeOf(j) === 0) j++;
    return j;
  }
  prevVisible(i: number): number {
    let j = Math.min(this.count - 1, i);
    while (j > 0 && this.sizeOf(j) === 0) j--;
    return j;
  }

  /** Visible step from i by `delta` lines, skipping hidden ones (clamped). */
  step(i: number, delta: number): number {
    let j = i; const dir = delta < 0 ? -1 : 1; let n = Math.abs(delta);
    while (n > 0) {
      let k = j + dir;
      while (k >= 0 && k < this.count && this.sizeOf(k) === 0) k += dir;
      if (k < 0 || k >= this.count) break;
      j = k; n--;
    }
    return j;
  }

  /** Lines intersecting [px0, px1) in order (visible only). */
  range(px0: number, px1: number): number[] {
    const out: number[] = [];
    if (px1 <= px0) return out;
    let i = this.indexAt(px0);
    let at = this.offsetOf(i);
    while (i < this.count && at < px1) {
      const s = this.sizeOf(i);
      if (s > 0) out.push(i);
      at += s; i++;
    }
    return out;
  }
}
