// Silkscreen: each footprint's outline, its reference beside the courtyard (moved until it clears
// every pad), and the board name. Segments that would print on a pad are left off.

import { rotPt } from '../components';
import { cap, dist, rect } from './geom';
import { textStrokes, textWidth } from './font';
import type { Board } from './types';

export type SilkSeg = [number, number, number, number];
export const SILK_W = 0.15;

export function silkscreen(b: Board): SilkSeg[] {
  const padShapes = b.pads.map(p => p.shape === 'circle' ? cap(p.x, p.y, p.x, p.y, p.w / 2 + 0.15) : rect(p.x, p.y, p.w + 0.3, p.h + 0.3));
  const holeShapes = b.holes.map(h => cap(h.x, h.y, h.x, h.y, h.d / 2 + 0.2));
  const clear = (s: SilkSeg) => { const c = cap(s[0], s[1], s[2], s[3], SILK_W / 2); return padShapes.every(p => dist(c, p) > 0) && holeShapes.every(p => dist(c, p) > 0); };
  const inside = (s: SilkSeg) => Math.min(s[0], s[2]) > 0.3 && Math.min(s[1], s[3]) > 0.3 && Math.max(s[0], s[2]) < b.W - 0.3 && Math.max(s[1], s[3]) < b.H - 0.3;
  const out: SilkSeg[] = [];
  for (const p of b.parts) for (const s of p.fp.silk) { const a = rotPt([s[0], s[1]], p.rot), c = rotPt([s[2], s[3]], p.rot); const seg: SilkSeg = [p.x + a[0], p.y + a[1], p.x + c[0], p.y + c[1]]; if (clear(seg) && inside(seg)) out.push(seg); }
  const label = (txt: string, x: number, y: number, h: number): SilkSeg[] => textStrokes(txt, x, y, h).flatMap(pl => pl.slice(1).map((q, i) => [pl[i][0], pl[i][1], q[0], q[1]] as SilkSeg));
  const taken: Array<[number, number, number, number]> = [];
  for (const p of b.parts) {
    const h = 1.0, w = textWidth(p.ref, h); const [x0, y0, x1, y1] = p.box; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const spots: Array<[number, number]> = [[cx - w / 2, y0 - h - 0.4], [cx - w / 2, y1 + 0.4], [x0 - w - 0.5, cy - h / 2], [x1 + 0.5, cy - h / 2], [cx - w / 2, cy - h / 2], [x0 + 0.3, y0 + 0.3]];
    for (const [tx, ty] of spots) {
      const segs = label(p.ref, tx, ty, h); const bx: [number, number, number, number] = [tx, ty, tx + w, ty + h];
      if (!segs.every(s => clear(s) && inside(s)) || taken.some(t => bx[0] < t[2] && t[0] < bx[2] && bx[1] < t[3] && t[1] < bx[3])) continue;
      out.push(...segs); taken.push(bx); break;
    }
  }
  const title = `${b.name} PLAJAH BUILD`.replace(/[^A-Za-z0-9 +\-._/:]/g, '').slice(0, 40);
  for (const h of [1.2, 1.0, 0.8]) {
    const w = textWidth(title, h); if (w > b.W - 10) continue; const segs = label(title, (b.W - w) / 2, b.H - h - 1.2, h);
    if (segs.every(s => clear(s) && inside(s))) { out.push(...segs); break; }
  }
  return out;
}
