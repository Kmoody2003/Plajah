// Plajah Vegetation — measure a tree from its art (docs/plajah-vegetation.md §3, steps 2).
//
// Input: the alpha masks of the front and side cut-outs (from the sheet reader + cutFigure). Output: the numbers a
// TreeSpecies needs — the crown's silhouette (radius against height), where the crown starts, how wide the trunk is,
// which way and how far it leans, how deep the crown is compared with its width. Pure: masks in, numbers out.
import type { ProfilePoint } from '../species';

export interface Mask { data: Uint8Array | Uint8ClampedArray; width: number; height: number; /** bytes per pixel and which byte is alpha */ stride?: number; channel?: number }

export interface TreeMeasure {
  /** Crown radius against height, as fractions of the tree's height (r measured about the crown's own centre). */
  profile: ProfilePoint[];
  crownBase: number;
  /** Trunk radius at 10% height, as a fraction of the height. */
  trunkRadius: number;
  /** Horizontal offset of the crown's centre from the trunk's base, as a fraction of the height. */
  lean: number;
  /** Side-view crown width / front-view crown width. */
  depthScale: number;
  /** Ground flare: width at the base / trunk width. */
  flare: number;
}

const on = (m: Mask, x: number, y: number) => {
  const s = m.stride ?? 4, c = m.channel ?? 3;
  return m.data[(x + y * m.width) * s + c] > 127;
};

/** Per row (top → bottom): leftmost and rightmost solid pixel and the solid count, for rows with any. */
function rows(m: Mask) {
  const out: { y: number; l: number; r: number; n: number }[] = [];
  for (let y = 0; y < m.height; y++) {
    let l = -1, r = -1, n = 0;
    for (let x = 0; x < m.width; x++) if (on(m, x, y)) { if (l < 0) l = x; r = x; n++; }
    if (n) out.push({ y, l, r, n });
  }
  return out;
}

export function measureTree(front: Mask, side?: Mask, samples = 9): TreeMeasure {
  const rf = rows(front);
  if (rf.length < 4) throw new Error('measureTree: the front cut-out is empty');
  const top = rf[0].y, bottom = rf[rf.length - 1].y, H = bottom - top + 1;
  const at = (fracFromGround: number) => {
    const y = Math.round(bottom - fracFromGround * (H - 1));
    return rf.find((r) => r.y === y) ?? rf.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
  };
  // trunk: the solid count at 10–20% height (the run of solid pixels, not the l…r span: roots spread out wide)
  const trunkRow = at(0.15);
  const trunkW = Math.max(1, trunkRow.n);
  const baseRow = at(0.02);
  // crown base: lowest height (from 25% up) where the span is clearly wider than the trunk
  let crownBase = 0.4;
  for (let f = 0.25; f < 0.9; f += 0.01) { const r = at(f); if (r.r - r.l + 1 > trunkW * 2.6) { crownBase = f; break; } }
  // crown silhouette: radius about the crown's centre line at `samples` heights from the crown base to the top
  const crownRows = rf.filter((r) => r.y <= bottom - crownBase * (H - 1));
  const cx = crownRows.reduce((s, r) => s + (r.l + r.r) / 2 * (r.r - r.l), 0) / Math.max(1, crownRows.reduce((s, r) => s + (r.r - r.l), 0));
  const profile: ProfilePoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const f = crownBase + (1 - crownBase) * (i / samples);
    const r = at(Math.min(0.999, f));
    profile.push({ y: +f.toFixed(3), r: +(((r.r - r.l + 1) / 2) / H).toFixed(4) });
  }
  profile[profile.length - 1].r = Math.min(profile[profile.length - 1].r, profile[profile.length - 2].r * 0.5); // close at the top
  const trunkCx = (trunkRow.l + trunkRow.r) / 2;
  // depth: side crown width / front crown width, both over the crown's middle band
  let depthScale = 1;
  if (side) {
    const rs = rows(side);
    if (rs.length > 4) {
      const sTop = rs[0].y, sBot = rs[rs.length - 1].y, sH = sBot - sTop + 1;
      const band = (rr: typeof rf, t: number, hh: number) => rr.filter((r) => r.y >= t + hh * 0.15 && r.y <= t + hh * (1 - crownBase) * 0.85);
      const w = (rr: typeof rf) => rr.length ? rr.reduce((s, r) => s + (r.r - r.l + 1), 0) / rr.length : 0;
      const fw = w(band(rf, top, H)) / H, sw = w(band(rs, sTop, sH)) / sH;
      if (fw > 0 && sw > 0) depthScale = Math.max(0.5, Math.min(1.8, sw / fw));
    }
  }
  return {
    profile, crownBase: +crownBase.toFixed(3),
    trunkRadius: +((trunkW / 2) / H).toFixed(4),
    lean: +((cx - trunkCx) / H).toFixed(4),
    depthScale: +depthScale.toFixed(3),
    flare: +Math.max(1, (baseRow.r - baseRow.l + 1) / trunkW).toFixed(2),
  };
}
