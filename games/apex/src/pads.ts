import { GRID } from './grid';
// Building pads: a civil engineer grades a flat pad for every large building and parking lot. Without it, warehouses and depots stood half sunk into a slope, perched
// on the high side and floating on the low side (the industrial district runs over an old embankment). Each pad is the footprint plus a 5 m apron at the median height of
// the ground under it, blending back to the natural ground over 18 m. Heights are raw map units, like the height map; run before the terrain is meshed.
export interface Pad { x: number; z: number; w: number; d: number; rot: number }

export function carvePads(heights: Float32Array, W: number, H: number, mpp: number, pads: Pad[]): number {
  const APRON = 5, BLEND = 18;
  let n = 0;
  for (const p of pads) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    const hw = p.w / 2 + APRON, hd = p.d / 2 + APRON, R = Math.hypot(hw, hd) + BLEND;
    const i0 = Math.max(0, Math.floor(((p.x - R) - GRID.ox) / mpp + W / 2)), i1 = Math.min(W - 1, Math.ceil(((p.x + R) - GRID.ox) / mpp + W / 2));
    const j0 = Math.max(0, Math.floor(((p.z - R) - GRID.oz) / mpp + H / 2)), j1 = Math.min(H - 1, Math.ceil(((p.z + R) - GRID.oz) / mpp + H / 2));
    // pad level: the median of the ground inside the footprint (cut and fill balance)
    const inside: number[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (((i - W / 2) * mpp) + GRID.ox) - p.x, z = (((j - H / 2) * mpp) + GRID.oz) - p.z;
      const a = x * c - z * s, b = x * s + z * c;                         // into the pad's own axes (a across the width, b along the depth)
      if (Math.abs(a) <= p.w / 2 && Math.abs(b) <= p.d / 2) inside.push(heights[j * W + i]);
    }
    if (!inside.length) continue;
    inside.sort((u, v) => u - v);
    const level = inside[Math.floor(inside.length / 2)];
    if (level < 2.6) continue;                                            // never grade a pad down to the waterline
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (((i - W / 2) * mpp) + GRID.ox) - p.x, z = (((j - H / 2) * mpp) + GRID.oz) - p.z;
      const a = Math.abs(x * c - z * s) - hw, b = Math.abs(x * s + z * c) - hd;
      const out = Math.hypot(Math.max(a, 0), Math.max(b, 0));            // distance outside the pad (0 on it)
      if (out >= BLEND) continue;
      const t = out / BLEND, w = 1 - t * t * (3 - 2 * t), k = j * W + i;
      heights[k] = heights[k] * (1 - w) + level * w;
    }
    n++;
  }
  return n;
}
