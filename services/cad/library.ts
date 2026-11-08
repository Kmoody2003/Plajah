// Architectural symbol library: our own parametric drawings of what architects place every day
// (doors, windows, stairs, furniture, kitchen and bath fixtures, structure, MEP symbols,
// landscape, vehicles, annotation). Not copied from any vendor library: each item is built
// from its parameters, so a 900 door becomes an 800 door by changing one number.
//
// Geometry is in millimetres with the insertion point at the origin, drawn on layer "0" so the
// block takes the layer it is inserted on. Plan conventions: doors hinge at the origin and swing
// into +y; wall openings sit centred on the wall line along +x.

import type { CadEntity2D, CadBlock, CadModel, Vec3 } from './model';
import { MM_PER_UNIT } from './model';

export type ParamKind = 'length' | 'angle' | 'count' | 'choice' | 'text' | 'bool';
export interface ParamDef { key: string; label: string; kind: ParamKind; default: number | string | boolean; min?: number; max?: number; choices?: string[] }
export type Params = Record<string, number | string | boolean>;

export interface LibraryItem {
  id: string; name: string; category: LibraryCategory; layer: string; about: string;
  params: ParamDef[]; build: (p: Params) => CadEntity2D[];
}
export type LibraryCategory = 'Doors' | 'Windows' | 'Stairs' | 'Furniture' | 'Kitchen' | 'Bathroom' | 'Structure' | 'Electrical' | 'Landscape' | 'Vehicles & parking' | 'Annotation';
export const CATEGORIES: LibraryCategory[] = ['Doors', 'Windows', 'Stairs', 'Furniture', 'Kitchen', 'Bathroom', 'Structure', 'Electrical', 'Landscape', 'Vehicles & parking', 'Annotation'];

// ── drawing helpers (mm, layer 0) ───────────────────────────────────────────

const L = '0';
const v = (x: number, y: number): Vec3 => [x, y, 0];
const line = (x1: number, y1: number, x2: number, y2: number): CadEntity2D => ({ type: 'line', layer: L, a: v(x1, y1), b: v(x2, y2) });
const poly = (pts: Array<[number, number]>, closed = true, bulges?: number[]): CadEntity2D => ({ type: 'polyline', layer: L, points: pts.map(([x, y]) => v(x, y)), closed, ...(bulges ? { bulges } : {}) });
const rect = (x: number, y: number, w: number, h: number) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
/** Rectangle with rounded corners (radius r) via polyline bulges. */
const rrect = (x: number, y: number, w: number, h: number, r: number): CadEntity2D => {
  r = Math.min(r, w / 2, h / 2); const b = Math.tan(Math.PI / 8);
  return poly([[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]], true, [0, b, 0, b, 0, b, 0, b]);
};
const circle = (x: number, y: number, r: number): CadEntity2D => ({ type: 'circle', layer: L, c: v(x, y), r });
const arc = (x: number, y: number, r: number, start: number, end: number): CadEntity2D => ({ type: 'arc', layer: L, c: v(x, y), r, start, end });
const ellipse = (x: number, y: number, rx: number, ry: number): CadEntity2D => rx >= ry ? { type: 'ellipse', layer: L, c: v(x, y), major: v(rx, 0), ratio: ry / rx, start: 0, end: Math.PI * 2 } : { type: 'ellipse', layer: L, c: v(x, y), major: v(0, ry), ratio: rx / ry, start: 0, end: Math.PI * 2 };
const text = (x: number, y: number, s: string, h: number, align: 'left' | 'center' | 'right' = 'center', rotation = 0): CadEntity2D => ({ type: 'text', layer: L, at: v(x, y), height: h, rotation, text: s, align });
const hatch = (pts: Array<[number, number]>): CadEntity2D => ({ type: 'hatch', layer: L, loops: [pts.map(([x, y]) => v(x, y))], pattern: 'SOLID', solid: true });
const num = (p: Params, k: string) => Number(p[k]);

const len = (key: string, label: string, def: number, min = 1, max = 100000): ParamDef => ({ key, label, kind: 'length', default: def, min, max });
const cnt = (key: string, label: string, def: number, min = 0, max = 50): ParamDef => ({ key, label, kind: 'count', default: def, min, max });
const ang = (key: string, label: string, def: number): ParamDef => ({ key, label, kind: 'angle', default: def, min: 0, max: 180 });
const choice = (key: string, label: string, def: string, choices: string[]): ParamDef => ({ key, label, kind: 'choice', default: def, choices });
const txt = (key: string, label: string, def: string): ParamDef => ({ key, label, kind: 'text', default: def });

/** Door leaf (thin rectangle) + swing arc, hinged at (hx, 0). dir 1: hinge on the left, opens counter-clockwise; -1: hinge on the right. */
function leaf(hx: number, w: number, swing: number, dir: 1 | -1, t = 40): CadEntity2D[] {
  const a = swing * Math.PI / 180;
  const ux = dir * Math.cos(a), uy = Math.sin(a); // leaf direction when open
  const px = -uy * dir, py = ux * dir;           // thickness side, away from the swing
  const ex = hx + ux * w, ey = uy * w;
  return [
    poly([[hx, 0], [ex, ey], [ex + px * t, ey + py * t], [hx + px * t, py * t]]),
    dir === 1 ? arc(hx, 0, w, 0, swing) : arc(hx, 0, w, 180 - swing, 180),
  ];
}

/** Wall jambs for an opening of width w in a wall of thickness t (the wall body runs from y = -t to 0). */
const jambs = (w: number, t: number) => [line(0, 0, 0, -t), line(w, 0, w, -t)];

// ── the library ─────────────────────────────────────────────────────────────

export const LIBRARY: LibraryItem[] = [
  // Doors (hinge at origin, wall face along y = 0, wall body below, swing up)
  { id: 'door-single', name: 'Single swing door', category: 'Doors', layer: 'A-DOOR', about: 'Hinged leaf with its swing. Width is the clear leaf width.',
    params: [len('width', 'Width', 900, 300, 2000), len('wall', 'Wall thickness', 150, 0, 1000), ang('swing', 'Swing angle', 90), choice('hand', 'Hinge side', 'left', ['left', 'right'])],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'); const right = p.hand === 'right'; return [...jambs(w, t), ...(right ? leaf(w, w, num(p, 'swing'), -1) : leaf(0, w, num(p, 'swing'), 1))]; } },
  { id: 'door-double', name: 'Double swing door', category: 'Doors', layer: 'A-DOOR', about: 'Pair of leaves meeting in the middle.',
    params: [len('width', 'Overall width', 1600, 600, 4000), len('wall', 'Wall thickness', 150, 0, 1000), ang('swing', 'Swing angle', 90)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'); return [...jambs(w, t), ...leaf(0, w / 2, num(p, 'swing'), 1), ...leaf(w, w / 2, num(p, 'swing'), -1)]; } },
  { id: 'door-sliding', name: 'Sliding door', category: 'Doors', layer: 'A-DOOR', about: 'Two panels on parallel tracks, overlapping 50 mm.',
    params: [len('width', 'Overall width', 1800, 600, 6000), len('wall', 'Wall thickness', 150, 0, 1000)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'); const pw = w / 2 + 25; return [...jambs(w, t), rect(0, -t * 0.35, pw, 30), rect(w - pw, -t * 0.65, pw, 30)]; } },
  { id: 'door-pocket', name: 'Pocket door', category: 'Doors', layer: 'A-DOOR', about: 'Leaf slides into a cavity in the wall (cavity shown dashed-free as a box).',
    params: [len('width', 'Width', 800, 400, 1500), len('wall', 'Wall thickness', 150, 60, 1000)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'); return [...jambs(w, t), rect(0, -t / 2 - 15, w * 0.35, 30), rect(-w, -t * 0.8, w, t * 0.6)]; } },
  { id: 'door-bifold', name: 'Bi-fold door', category: 'Doors', layer: 'A-DOOR', about: 'Folding leaves drawn half open.',
    params: [len('width', 'Width', 900, 400, 3000), len('wall', 'Wall thickness', 150, 0, 1000), cnt('panels', 'Panels', 2, 2, 8)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'), n = Math.max(2, Math.round(num(p, 'panels'))); const pw = w / n;
      // Panels folded half open (60 degrees): a zigzag from the hinge jamb.
      const pts: Array<[number, number]> = []; for (let k = 0; k <= n; k++) pts.push([k * pw * 0.5, k % 2 ? pw * 0.866 : 0]);
      return [...jambs(w, t), poly(pts, false)]; } },
  { id: 'door-overhead', name: 'Garage / overhead door', category: 'Doors', layer: 'A-DOOR', about: 'Sectional overhead door: opening with the door line in the wall.',
    params: [len('width', 'Width', 2400, 1800, 6000), len('wall', 'Wall thickness', 200, 0, 1000)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'); return [...jambs(w, t), line(0, -t / 2, w, -t / 2), line(0, 300, w, 300), text(w / 2, 450, 'OVERHEAD DOOR', 120)]; } },
  { id: 'opening', name: 'Cased opening', category: 'Doors', layer: 'A-DOOR', about: 'Doorless opening through a wall.',
    params: [len('width', 'Width', 900, 300, 5000), len('wall', 'Wall thickness', 150, 0, 1000)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'); return [...jambs(w, t)]; } },

  // Windows (opening along +x in a wall from y = -wall to 0)
  { id: 'window-fixed', name: 'Window, fixed', category: 'Windows', layer: 'A-GLAZ', about: 'Jambs, two glass lines and a sill line.',
    params: [len('width', 'Width', 1200, 300, 6000), len('wall', 'Wall thickness', 150, 50, 1000)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'); return [...jambs(w, t), line(0, -t / 2 - 10, w, -t / 2 - 10), line(0, -t / 2 + 10, w, -t / 2 + 10), line(0, 0, w, 0), line(0, -t, w, -t)]; } },
  { id: 'window-casement', name: 'Window, casement', category: 'Windows', layer: 'A-GLAZ', about: 'Side-hung sash with its swing drawn outward.',
    params: [len('width', 'Width', 900, 300, 2400), len('wall', 'Wall thickness', 150, 50, 1000), cnt('sashes', 'Sashes', 1, 1, 2)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'), n = num(p, 'sashes') >= 2 ? 2 : 1; const out = [...jambs(w, t), line(0, -t / 2, w, -t / 2), line(0, 0, w, 0), line(0, -t, w, -t)];
      if (n === 1) out.push(line(0, -t, w * 0.7, -t - w * 0.7), arc(0, -t, w, 315, 360)); else out.push(line(0, -t, w * 0.35, -t - w * 0.35), arc(0, -t, w / 2, 315, 360), line(w, -t, w * 0.65, -t - w * 0.35), arc(w, -t, w / 2, 180, 225));
      return out; } },
  { id: 'window-sliding', name: 'Window, sliding', category: 'Windows', layer: 'A-GLAZ', about: 'Two sashes on offset tracks.',
    params: [len('width', 'Width', 1500, 600, 6000), len('wall', 'Wall thickness', 150, 50, 1000)],
    build: p => { const w = num(p, 'width'), t = num(p, 'wall'); return [...jambs(w, t), line(0, 0, w, 0), line(0, -t, w, -t), line(0, -t * 0.4, w * 0.55, -t * 0.4), line(w * 0.45, -t * 0.6, w, -t * 0.6)]; } },
  { id: 'window-bay', name: 'Bay window', category: 'Windows', layer: 'A-GLAZ', about: 'Three-sided projecting bay.',
    params: [len('width', 'Opening width', 2400, 1200, 6000), len('depth', 'Projection', 600, 200, 1500)],
    build: p => { const w = num(p, 'width'), d = num(p, 'depth'); const s = d; return [poly([[0, 0], [s, d], [w - s, d], [w, 0]], false), poly([[0, -60], [s, d - 60], [w - s, d - 60], [w, -60]], false), line(0, 0, 0, -150), line(w, 0, w, -150)]; } },

  // Stairs
  { id: 'stair-straight', name: 'Stair, straight run', category: 'Stairs', layer: 'A-FLOR', about: 'Treads, a break line and the UP arrow. Total run = treads x going.',
    params: [len('width', 'Width', 1000, 600, 3000), cnt('treads', 'Treads', 14, 2, 30), len('going', 'Going (tread depth)', 280, 200, 400)],
    build: p => { const w = num(p, 'width'), n = Math.round(num(p, 'treads')), g = num(p, 'going'); const run = n * g; const out: CadEntity2D[] = [rect(0, 0, w, run)];
      for (let i = 1; i < n; i++) out.push(line(0, i * g, w, i * g));
      const bk = run * 0.55; out.push(poly([[0, bk], [w * 0.45, bk], [w * 0.5, bk + 120], [w * 0.55, bk - 120], [w * 0.6, bk], [w, bk]], false));
      out.push(line(w / 2, g / 2, w / 2, run - g), poly([[w / 2 - 80, run - g - 160], [w / 2, run - g], [w / 2 + 80, run - g - 160]], false), text(w / 2, g * 0.5 + 40, 'UP', 140)); return out; } },
  { id: 'stair-l', name: 'Stair, L-shaped with landing', category: 'Stairs', layer: 'A-FLOR', about: 'Two flights at right angles around a square landing.',
    params: [len('width', 'Width', 1000, 600, 3000), cnt('flight1', 'Treads, first flight', 8, 1, 20), cnt('flight2', 'Treads, second flight', 6, 1, 20), len('going', 'Going', 280, 200, 400)],
    build: p => { const w = num(p, 'width'), g = num(p, 'going'), n1 = Math.round(num(p, 'flight1')), n2 = Math.round(num(p, 'flight2')); const r1 = n1 * g, r2 = n2 * g; const out: CadEntity2D[] = [rect(0, 0, w, r1), rect(0, r1, w, w), rect(w, r1, r2, w)];
      for (let i = 1; i < n1; i++) out.push(line(0, i * g, w, i * g)); for (let i = 1; i < n2; i++) out.push(line(w + i * g, r1, w + i * g, r1 + w));
      out.push(poly([[w / 2, g / 2], [w / 2, r1 + w / 2], [w + r2 - g, r1 + w / 2]], false), text(w / 2, g * 0.5 + 40, 'UP', 140)); return out; } },
  { id: 'stair-spiral', name: 'Stair, spiral', category: 'Stairs', layer: 'A-FLOR', about: 'Circular stair with a centre column; treads radiate.',
    params: [len('diameter', 'Diameter', 1600, 1000, 3000), cnt('treads', 'Treads per turn', 12, 8, 20)],
    build: p => { const r = num(p, 'diameter') / 2, n = Math.round(num(p, 'treads')); const out: CadEntity2D[] = [circle(0, 0, r), circle(0, 0, 100)]; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push(line(100 * Math.cos(a), 100 * Math.sin(a), r * Math.cos(a), r * Math.sin(a))); } out.push(text(0, -r * 0.55, 'UP', 120)); return out; } },
  { id: 'ramp', name: 'Ramp (1:12)', category: 'Stairs', layer: 'A-FLOR', about: 'Accessible ramp; length follows rise at a 1:12 slope (ADA maximum).',
    params: [len('width', 'Clear width', 1000, 900, 3000), len('rise', 'Rise', 450, 50, 760)],
    build: p => { const w = num(p, 'width'), r = num(p, 'rise'); const run = r * 12; return [rect(0, 0, w, run), line(w / 2, 150, w / 2, run - 150), poly([[w / 2 - 80, run - 310], [w / 2, run - 150], [w / 2 + 80, run - 310]], false), text(w / 2, 250, `RAMP 1:12  UP ${r}`, 110)]; } },

  // Furniture (origin = back-left corner unless noted)
  { id: 'bed', name: 'Bed', category: 'Furniture', layer: 'A-FURN', about: 'Bed with pillows and turned-down cover.',
    params: [choice('size', 'Size', 'Queen', ['Single', 'Double', 'Queen', 'King', 'Custom']), len('w', 'Custom width', 1530, 700, 2500), len('l', 'Custom length', 2030, 1700, 2400)],
    build: p => { const sizes: Record<string, [number, number]> = { Single: [900, 1900], Double: [1350, 1900], Queen: [1530, 2030], King: [1930, 2030] }; const [w, l] = sizes[String(p.size)] ?? [num(p, 'w'), num(p, 'l')];
      const pil = w > 1100 ? [rrect(80, l - 430, w / 2 - 120, 330, 60), rrect(w / 2 + 40, l - 430, w / 2 - 120, 330, 60)] : [rrect(80, l - 430, w - 160, 330, 60)];
      return [rect(0, 0, w, l), ...pil, line(0, l * 0.62, w, l * 0.62), line(0, l * 0.62, w * 0.25, l * 0.62 - 220), line(w * 0.25, l * 0.62 - 220, w, l * 0.62 - 220)]; } },
  { id: 'sofa', name: 'Sofa', category: 'Furniture', layer: 'A-FURN', about: 'Back, arms and seat cushions.',
    params: [cnt('seats', 'Seats', 3, 1, 6), len('seatW', 'Seat width', 600, 450, 900), len('depth', 'Depth', 900, 700, 1200)],
    build: p => { const n = Math.round(num(p, 'seats')), sw = num(p, 'seatW'), d = num(p, 'depth'), arm = 180, back = 200; const w = n * sw + 2 * arm; const out: CadEntity2D[] = [rrect(0, 0, w, d, 60), line(arm, 0, arm, d - back), line(w - arm, 0, w - arm, d - back), line(arm, d - back, w - arm, d - back)];
      for (let i = 1; i < n; i++) out.push(line(arm + i * sw, 0, arm + i * sw, d - back)); return out; } },
  { id: 'armchair', name: 'Armchair', category: 'Furniture', layer: 'A-FURN', about: 'Single upholstered chair.',
    params: [len('w', 'Width', 850, 600, 1200), len('d', 'Depth', 850, 600, 1200)],
    build: p => { const w = num(p, 'w'), d = num(p, 'd'); return [rrect(0, 0, w, d, 80), rrect(150, 50, w - 300, d - 250, 50)]; } },
  { id: 'chair', name: 'Chair', category: 'Furniture', layer: 'A-FURN', about: 'Dining or desk chair seen from above (origin = seat centre).',
    params: [len('w', 'Width', 450, 350, 700)],
    build: p => { const w = num(p, 'w'); return [rrect(-w / 2, -w / 2, w, w, 40), line(-w / 2, w / 2 - 60, w / 2, w / 2 - 60)]; } },
  { id: 'table-dining', name: 'Dining table with chairs', category: 'Furniture', layer: 'A-FURN', about: 'Rectangular table; chairs spread evenly along the long sides and one at each end.',
    params: [len('w', 'Length', 1800, 800, 4000), len('d', 'Width', 900, 600, 1500), cnt('perSide', 'Chairs per side', 3, 0, 8), choice('ends', 'Chairs at ends', 'yes', ['yes', 'no'])],
    build: p => { const w = num(p, 'w'), d = num(p, 'd'), n = Math.round(num(p, 'perSide')); const out: CadEntity2D[] = [rect(0, 0, w, d)]; const cw = 450;
      const chairAt = (x: number, y: number, rot: number) => { const c = Math.cos(rot), s = Math.sin(rot); const pts: Array<[number, number]> = [[-cw / 2, -cw / 2], [cw / 2, -cw / 2], [cw / 2, cw / 2], [-cw / 2, cw / 2]]; out.push(poly(pts.map(([a, b]) => [x + a * c - b * s, y + a * s + b * c]))); };
      for (let i = 0; i < n; i++) { const x = w * (i + 0.5) / n; chairAt(x, -cw / 2 - 60, 0); chairAt(x, d + cw / 2 + 60, Math.PI); }
      if (p.ends === 'yes') { chairAt(-cw / 2 - 60, d / 2, Math.PI / 2); chairAt(w + cw / 2 + 60, d / 2, -Math.PI / 2); } return out; } },
  { id: 'table-round', name: 'Round table with chairs', category: 'Furniture', layer: 'A-FURN', about: 'Round table (origin = centre) with chairs around it.',
    params: [len('diameter', 'Diameter', 1200, 600, 2400), cnt('chairs', 'Chairs', 4, 0, 12)],
    build: p => { const r = num(p, 'diameter') / 2, n = Math.round(num(p, 'chairs')); const out: CadEntity2D[] = [circle(0, 0, r)]; const cw = 450, rr = r + 60 + cw / 2;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); const cx = rr * c, cy = rr * s; const pts: Array<[number, number]> = [[-cw / 2, -cw / 2], [cw / 2, -cw / 2], [cw / 2, cw / 2], [-cw / 2, cw / 2]]; out.push(poly(pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]))); } return out; } },
  { id: 'desk', name: 'Desk with chair', category: 'Furniture', layer: 'A-FURN', about: 'Work desk and task chair.',
    params: [len('w', 'Width', 1400, 800, 2400), len('d', 'Depth', 700, 500, 1000)],
    build: p => { const w = num(p, 'w'), d = num(p, 'd'); return [rect(0, 0, w, d), rrect(w / 2 - 250, -420, 500, 500, 80), circle(w / 2, -170, 60)]; } },
  { id: 'wardrobe', name: 'Wardrobe', category: 'Furniture', layer: 'A-FURN', about: 'Built-in wardrobe with hanging rail.',
    params: [len('w', 'Width', 1800, 600, 4000), len('d', 'Depth', 600, 450, 800)],
    build: p => { const w = num(p, 'w'), d = num(p, 'd'); return [rect(0, 0, w, d), line(0, d / 2, w, d / 2), line(w / 2, 0, w / 2, 40)]; } },
  { id: 'bookshelf', name: 'Bookshelf', category: 'Furniture', layer: 'A-FURN', about: 'Shelving unit with uprights.',
    params: [len('w', 'Width', 1200, 400, 4000), len('d', 'Depth', 300, 200, 500), cnt('bays', 'Bays', 3, 1, 12)],
    build: p => { const w = num(p, 'w'), d = num(p, 'd'), n = Math.round(num(p, 'bays')); const out = [rect(0, 0, w, d)]; for (let i = 1; i < n; i++) out.push(line(w * i / n, 0, w * i / n, d)); return out; } },

  // Kitchen
  { id: 'counter', name: 'Base cabinets / counter run', category: 'Kitchen', layer: 'A-FLOR-CASE', about: 'Counter with cabinet divisions every 600.',
    params: [len('length', 'Length', 3000, 300, 12000), len('depth', 'Depth', 600, 300, 900)],
    build: p => { const l = num(p, 'length'), d = num(p, 'depth'); const out = [rect(0, 0, l, d), line(0, d - 20, l, d - 20)]; for (let x = 600; x < l - 1; x += 600) out.push(line(x, 0, x, d - 20)); return out; } },
  { id: 'sink-kitchen', name: 'Kitchen sink', category: 'Kitchen', layer: 'P-FIXT', about: 'Single or double bowl with drainer.',
    params: [choice('bowls', 'Bowls', 'double', ['single', 'double']), len('w', 'Width', 1000, 450, 1500)],
    build: p => { const w = num(p, 'w'), d = 500; const out: CadEntity2D[] = [rrect(0, 0, w, d, 40)]; if (p.bowls === 'double') { out.push(rrect(40, 60, w / 2 - 60, d - 120, 50), rrect(w / 2 + 20, 60, w / 2 - 60, d - 120, 50)); } else out.push(rrect(40, 60, w * 0.55, d - 120, 50)); out.push(circle(w / 2, d - 30, 18)); return out; } },
  { id: 'range', name: 'Range / cooktop', category: 'Kitchen', layer: 'A-FLOR-EQPM', about: 'Four or six burners.',
    params: [len('w', 'Width', 600, 450, 1200), cnt('burners', 'Burners', 4, 2, 6)],
    build: p => { const w = num(p, 'w'), d = 600, n = Math.round(num(p, 'burners')); const out: CadEntity2D[] = [rect(0, 0, w, d)]; const cols = n > 4 ? 3 : 2, rows = n > 2 ? 2 : 1;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (out.length - 1 < n) out.push(circle(w * (i + 0.5) / cols, d * (j + 0.5) / rows, Math.min(w / cols, d / rows) * 0.32)); return out; } },
  { id: 'fridge', name: 'Refrigerator', category: 'Kitchen', layer: 'A-FLOR-EQPM', about: 'Fridge with door swing.',
    params: [len('w', 'Width', 700, 500, 1000), len('d', 'Depth', 700, 550, 800)],
    build: p => { const w = num(p, 'w'), d = num(p, 'd'); return [rect(0, 0, w, d), text(w / 2, d / 2, 'REF', 120), line(0, 0, 0, -w), arc(0, 0, w, 270, 360)]; } },
  { id: 'dishwasher', name: 'Dishwasher', category: 'Kitchen', layer: 'A-FLOR-EQPM', about: '600 under-counter unit.',
    params: [len('w', 'Width', 600, 450, 600)],
    build: p => { const w = num(p, 'w'); return [rect(0, 0, w, 600), text(w / 2, 300, 'DW', 120)]; } },
  { id: 'island', name: 'Kitchen island', category: 'Kitchen', layer: 'A-FLOR-CASE', about: 'Island with seating overhang.',
    params: [len('w', 'Length', 2400, 1200, 4000), len('d', 'Depth', 1000, 800, 1400), cnt('stools', 'Stools', 3, 0, 6)],
    build: p => { const w = num(p, 'w'), d = num(p, 'd'), n = Math.round(num(p, 'stools')); const out: CadEntity2D[] = [rect(0, 0, w, d), line(0, 300, w, 300)]; for (let i = 0; i < n; i++) out.push(circle(w * (i + 0.5) / n, -250, 180)); return out; } },

  // Bathroom
  { id: 'wc', name: 'Toilet (WC)', category: 'Bathroom', layer: 'P-FIXT', about: 'Close-coupled WC; origin = middle of the wall it backs onto.',
    params: [len('projection', 'Projection', 700, 500, 800)],
    build: p => { const pr = num(p, 'projection'); return [rrect(-250, 0, 500, 200, 40), ellipse(0, 200 + (pr - 200) / 2, 190, (pr - 200) / 2), ellipse(0, 200 + (pr - 200) / 2 + 20, 130, (pr - 200) / 2 - 60)]; } },
  { id: 'basin', name: 'Wash basin', category: 'Bathroom', layer: 'P-FIXT', about: 'Wall-hung basin or vanity; origin = middle of the wall.',
    params: [choice('type', 'Type', 'wall-hung', ['wall-hung', 'vanity']), len('w', 'Width', 550, 350, 1500)],
    build: p => { const w = num(p, 'w'); const d = p.type === 'vanity' ? 550 : 450; const out: CadEntity2D[] = p.type === 'vanity' ? [rect(-w / 2, 0, w, d)] : [rrect(-w / 2, 0, w, d, 120)]; out.push(ellipse(0, d * 0.55, w * 0.32, d * 0.3), circle(0, 60, 20)); return out; } },
  { id: 'bathtub', name: 'Bathtub', category: 'Bathroom', layer: 'P-FIXT', about: 'Built-in bath with drain.',
    params: [len('l', 'Length', 1700, 1200, 2000), len('w', 'Width', 750, 600, 1000)],
    build: p => { const l = num(p, 'l'), w = num(p, 'w'); return [rect(0, 0, l, w), rrect(60, 60, l - 120, w - 120, 180), circle(180, w / 2, 30)]; } },
  { id: 'shower', name: 'Shower', category: 'Bathroom', layer: 'P-FIXT', about: 'Shower tray with drain and the conventional cross.',
    params: [len('w', 'Width', 900, 700, 2000), len('d', 'Depth', 900, 700, 2000)],
    build: p => { const w = num(p, 'w'), d = num(p, 'd'); return [rect(0, 0, w, d), line(0, 0, w, d), line(w, 0, 0, d), circle(w / 2, d / 2, 40)]; } },
  { id: 'urinal', name: 'Urinal', category: 'Bathroom', layer: 'P-FIXT', about: 'Wall-hung urinal; origin = middle of the wall.',
    params: [len('w', 'Width', 400, 300, 600)],
    build: p => { const w = num(p, 'w'); return [poly([[-w / 2, 0], [w / 2, 0], [w / 2, 250], [0, 380], [-w / 2, 250]])]; } },
  { id: 'ada-turning', name: 'Wheelchair turning space', category: 'Bathroom', layer: 'A-ANNO-SYMB', about: '1525 mm (60 in) circle, the turning space in the 2010 ADA Standards (304.3.1); origin = centre.',
    params: [len('diameter', 'Diameter', 1525, 1500, 1600)],
    build: p => { const r = num(p, 'diameter') / 2; return [circle(0, 0, r), line(-r, 0, r, 0), line(0, -r, 0, r), text(0, r * 0.35, 'Ø1525 TURNING', 90)]; } },
  { id: 'grab-bar', name: 'Grab bar', category: 'Bathroom', layer: 'P-FIXT', about: 'Straight grab bar on its wall flanges.',
    params: [len('l', 'Length', 900, 300, 1500)],
    build: p => { const l = num(p, 'l'); return [rect(0, 40, l, 38), rect(0, 0, 80, 40), rect(l - 80, 0, 80, 40)]; } },

  // Structure
  { id: 'column-square', name: 'Column, square', category: 'Structure', layer: 'S-COLS', about: 'Square column, filled; origin = centre.',
    params: [len('size', 'Size', 400, 100, 2000)],
    build: p => { const s = num(p, 'size') / 2; return [hatch([[-s, -s], [s, -s], [s, s], [-s, s]]), rect(-s, -s, 2 * s, 2 * s)]; } },
  { id: 'column-round', name: 'Column, round', category: 'Structure', layer: 'S-COLS', about: 'Round column; origin = centre.',
    params: [len('diameter', 'Diameter', 400, 100, 2000)],
    build: p => [circle(0, 0, num(p, 'diameter') / 2)] },
  { id: 'column-steel', name: 'Steel column (H)', category: 'Structure', layer: 'S-COLS', about: 'Wide-flange H section; origin = centre.',
    params: [len('depth', 'Depth', 300, 100, 1000), len('flange', 'Flange width', 300, 100, 600), len('tf', 'Flange thickness', 20, 5, 60), len('tw', 'Web thickness', 12, 4, 40)],
    build: p => { const d = num(p, 'depth') / 2, b = num(p, 'flange') / 2, tf = num(p, 'tf'), tw = num(p, 'tw') / 2; const pts: Array<[number, number]> = [[-b, -d], [b, -d], [b, -d + tf], [tw, -d + tf], [tw, d - tf], [b, d - tf], [b, d], [-b, d], [-b, d - tf], [-tw, d - tf], [-tw, -d + tf], [-b, -d + tf]]; return [hatch(pts), poly(pts)]; } },
  { id: 'grid-bubble', name: 'Grid line with bubble', category: 'Structure', layer: 'S-GRID', about: 'Structural grid line with its label bubble at the top.',
    params: [txt('label', 'Label', 'A'), len('length', 'Line length', 10000, 1000, 100000), len('bubble', 'Bubble diameter', 600, 200, 1500)],
    build: p => { const r = num(p, 'bubble') / 2, l = num(p, 'length'); return [line(0, 0, 0, l), circle(0, l + r, r), text(0, l + r * 0.6, String(p.label), r * 0.9)]; } },

  // Electrical (common plan symbols)
  { id: 'outlet', name: 'Duplex receptacle', category: 'Electrical', layer: 'E-POWR', about: 'Wall outlet symbol; origin on the wall.',
    params: [len('size', 'Symbol size', 300, 100, 600)],
    build: p => { const s = num(p, 'size'); return [circle(0, s / 2, s / 2), line(-s / 2, s / 2, -s, s / 2), line(-s / 2 + s * 0.3, s * 0.2, -s / 2 + s * 0.3, s * 0.8), line(s / 2 - s * 0.3, s * 0.2, s / 2 - s * 0.3, s * 0.8)]; } },
  { id: 'switch', name: 'Light switch', category: 'Electrical', layer: 'E-LITE', about: 'Switch symbol (S), single or 3-way.',
    params: [choice('type', 'Type', 'single', ['single', '3-way']), len('size', 'Text size', 200, 80, 400)],
    build: p => [text(0, 0, p.type === '3-way' ? 'S3' : 'S', num(p, 'size'))] },
  { id: 'light-ceiling', name: 'Ceiling light', category: 'Electrical', layer: 'E-LITE', about: 'Surface-mounted luminaire; origin = centre.',
    params: [len('d', 'Symbol diameter', 400, 100, 1000)],
    build: p => { const r = num(p, 'd') / 2; return [circle(0, 0, r), line(-r * 0.7, -r * 0.7, r * 0.7, r * 0.7), line(-r * 0.7, r * 0.7, r * 0.7, -r * 0.7)]; } },
  { id: 'light-recessed', name: 'Recessed downlight', category: 'Electrical', layer: 'E-LITE', about: 'Downlight; origin = centre.',
    params: [len('d', 'Diameter', 200, 60, 400)],
    build: p => { const r = num(p, 'd') / 2; return [circle(0, 0, r), circle(0, 0, r * 0.45)]; } },
  { id: 'smoke', name: 'Smoke detector', category: 'Electrical', layer: 'E-FIRE', about: 'Ceiling smoke alarm symbol.',
    params: [len('d', 'Diameter', 300, 100, 600)],
    build: p => { const r = num(p, 'd') / 2; return [circle(0, 0, r), text(0, -r * 0.3, 'SD', r * 0.8)]; } },

  // Landscape
  { id: 'tree', name: 'Tree', category: 'Landscape', layer: 'L-PLNT', about: 'Canopy outline with a trunk; origin = trunk.',
    params: [len('canopy', 'Canopy diameter', 4000, 1000, 15000), cnt('lobes', 'Lobes', 9, 5, 16)],
    build: p => { const r = num(p, 'canopy') / 2, n = Math.round(num(p, 'lobes')); const pts: Array<[number, number]> = []; const bul: number[] = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([r * Math.cos(a), r * Math.sin(a)]); bul.push(0.45); } return [poly(pts, true, bul), circle(0, 0, r * 0.06), ...Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2; return line(0, 0, r * 0.55 * Math.cos(a), r * 0.55 * Math.sin(a)); })]; } },
  { id: 'shrub', name: 'Shrub', category: 'Landscape', layer: 'L-PLNT', about: 'Small planting.',
    params: [len('d', 'Diameter', 1000, 300, 3000)],
    build: p => { const r = num(p, 'd') / 2; return [circle(0, 0, r), circle(0, 0, r * 0.55)]; } },
  { id: 'person', name: 'Person (plan)', category: 'Landscape', layer: 'A-ANNO-SYMB', about: 'Figure for scale, seen from above.',
    params: [],
    build: () => [ellipse(0, 0, 280, 150), circle(0, 0, 110)] },

  // Vehicles and parking
  { id: 'car', name: 'Car (plan)', category: 'Vehicles & parking', layer: 'C-VEHI', about: 'Medium car 4800 x 1850 for parking and garage layouts; origin = centre.',
    params: [len('l', 'Length', 4800, 3500, 6000), len('w', 'Width', 1850, 1500, 2200)],
    build: p => { const l = num(p, 'l'), w = num(p, 'w'); return [rrect(-l / 2, -w / 2, l, w, 350), poly([[l * 0.12, -w * 0.42], [l * 0.28, -w * 0.38], [l * 0.28, w * 0.38], [l * 0.12, w * 0.42]]), poly([[-l * 0.32, -w * 0.4], [-l * 0.22, -w * 0.38], [-l * 0.22, w * 0.38], [-l * 0.32, w * 0.4]])]; } },
  { id: 'parking-row', name: 'Parking stalls', category: 'Vehicles & parking', layer: 'C-PRKG', about: 'Row of 90-degree stalls; one can be an accessible stall with access aisle.',
    params: [cnt('stalls', 'Stalls', 5, 1, 30), len('w', 'Stall width', 2600, 2300, 3000), len('l', 'Stall length', 5000, 4500, 6000), choice('accessible', 'Accessible stall first', 'no', ['no', 'yes'])],
    build: p => { const n = Math.round(num(p, 'stalls')), w = num(p, 'w'), l = num(p, 'l'); const out: CadEntity2D[] = []; let x = 0;
      if (p.accessible === 'yes') { out.push(line(0, 0, 0, l), text(w * 0.75, l / 2, 'ACCESSIBLE', 200, 'center', 90)); x = w * 1.5; out.push(line(x, 0, x, l)); for (let k = 1; k < 6; k++) out.push(line(x, l * k / 6, x + 1500, l * k / 6 - 600)); x += 1500; }
      for (let i = 0; i <= n; i++) out.push(line(x + i * w, 0, x + i * w, l)); return out; } },

  // Annotation
  { id: 'north-arrow', name: 'North arrow', category: 'Annotation', layer: 'A-ANNO-SYMB', about: 'Circle and arrow with N; rotate to true north.',
    params: [len('size', 'Size', 1000, 200, 5000)],
    build: p => { const r = num(p, 'size') / 2; return [circle(0, 0, r), hatch([[0, r * 0.9], [r * 0.3, -r * 0.6], [0, -r * 0.3]]), poly([[0, r * 0.9], [r * 0.3, -r * 0.6], [0, -r * 0.3], [-r * 0.3, -r * 0.6]]), text(0, r * 1.15, 'N', r * 0.5)]; } },
  { id: 'section-mark', name: 'Section mark', category: 'Annotation', layer: 'A-ANNO-SYMB', about: 'Section cut head: bubble with view number over sheet number, and the direction arrow.',
    params: [txt('view', 'View', '1'), txt('sheet', 'Sheet', 'A-301'), len('size', 'Bubble diameter', 1000, 300, 3000)],
    build: p => { const r = num(p, 'size') / 2; return [circle(0, 0, r), line(-r, 0, r, 0), hatch([[r, 0], [r * 1.6, 0], [r, r * 0.7]]), text(0, r * 0.25, String(p.view), r * 0.45), text(0, -r * 0.65, String(p.sheet), r * 0.32)]; } },
  { id: 'elevation-mark', name: 'Elevation marker', category: 'Annotation', layer: 'A-ANNO-SYMB', about: 'Bubble with a pointer toward the elevation.',
    params: [txt('view', 'View', '1'), txt('sheet', 'Sheet', 'A-201'), len('size', 'Diameter', 1000, 300, 3000)],
    build: p => { const r = num(p, 'size') / 2; return [circle(0, 0, r), line(-r, 0, r, 0), hatch([[-r * 0.7, r * 0.7], [0, r * 1.5], [r * 0.7, r * 0.7]]), text(0, r * 0.25, String(p.view), r * 0.45), text(0, -r * 0.65, String(p.sheet), r * 0.32)]; } },
  { id: 'level-mark', name: 'Level / datum', category: 'Annotation', layer: 'A-ANNO-SYMB', about: 'Floor level marker with value.',
    params: [txt('value', 'Level', '+0.000'), len('size', 'Size', 300, 100, 1000)],
    build: p => { const s = num(p, 'size'); return [hatch([[0, 0], [s / 2, s * 0.6], [-s / 2, s * 0.6]]), line(-s * 2, 0, s * 2, 0), text(s * 0.8, s * 0.7, String(p.value), s * 0.6, 'left')]; } },
  { id: 'scale-bar', name: 'Scale bar', category: 'Annotation', layer: 'A-ANNO-SYMB', about: 'Alternating bar with distances.',
    params: [len('unit', 'Segment length', 1000, 100, 10000), cnt('segments', 'Segments', 5, 2, 10)],
    build: p => { const u = num(p, 'unit'), n = Math.round(num(p, 'segments')), h = u * 0.12; const out: CadEntity2D[] = [];
      for (let i = 0; i < n; i++) { out.push(rect(i * u, 0, u, h)); if (i % 2 === 0) out.push(hatch([[i * u, 0], [(i + 1) * u, 0], [(i + 1) * u, h], [i * u, h]])); out.push(text(i * u, h * 1.6, String(i * u), h)); }
      out.push(text(n * u, h * 1.6, `${n * u} mm`, h)); return out; } },
  { id: 'title-block', name: 'Sheet border and title block', category: 'Annotation', layer: 'A-ANNO-TTLB', about: 'ISO sheet at a drawing scale, with a title strip (project, title, scale, sheet, date).',
    params: [choice('sheet', 'Sheet', 'A3', ['A0', 'A1', 'A2', 'A3', 'A4']), cnt('scale', 'Scale 1:', 100, 1, 2000), txt('project', 'Project', 'Project name'), txt('title', 'Drawing title', 'Ground floor plan'), txt('number', 'Sheet number', 'A-101')],
    build: p => { const sizes: Record<string, [number, number]> = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210] }; const [sw, sh] = sizes[String(p.sheet)] ?? sizes.A3; const k = Math.max(1, num(p, 'scale'));
      const W = sw * k, H = sh * k, m = 10 * k, tb = 40 * k, th = 3.5 * k; const out: CadEntity2D[] = [rect(0, 0, W, H), rect(m, m, W - 2 * m, H - 2 * m), line(m, m + tb, W - m, m + tb)];
      const cols = [0.4, 0.3, 0.15, 0.15]; let x = m; const fields: Array<[string, string]> = [['PROJECT', String(p.project)], ['TITLE', String(p.title)], ['SCALE', `1:${k}`], ['SHEET', String(p.number)]];
      cols.forEach((c, i) => { const cw = (W - 2 * m) * c; if (i) out.push(line(x, m, x, m + tb)); out.push(text(x + 3 * k, m + tb - 7 * k, fields[i][0], th * 0.6, 'left'), text(x + 3 * k, m + 10 * k, fields[i][1], th * 1.6, 'left')); x += cw; });
      return out; } },
];

export const itemById = (id: string) => LIBRARY.find(i => i.id === id);

export function defaultParams(item: LibraryItem): Params { return Object.fromEntries(item.params.map(p => [p.key, p.default])); }

/** Library geometry (mm) scaled into a drawing's units. */
export function scaleEntities(ents: CadEntity2D[], k: number): CadEntity2D[] {
  if (k === 1) return ents;
  const s = (p: Vec3): Vec3 => [p[0] * k, p[1] * k, p[2] * k];
  return ents.map(e => {
    switch (e.type) {
      case 'line': return { ...e, a: s(e.a), b: s(e.b) };
      case 'polyline': return { ...e, points: e.points.map(s), width: e.width ? e.width * k : undefined };
      case 'circle': return { ...e, c: s(e.c), r: e.r * k };
      case 'arc': return { ...e, c: s(e.c), r: e.r * k };
      case 'ellipse': return { ...e, c: s(e.c), major: s(e.major) };
      case 'text': return { ...e, at: s(e.at), height: e.height * k };
      case 'hatch': return { ...e, loops: e.loops.map(l => l.map(s)) };
      case 'spline': return { ...e, points: e.points.map(s) };
      case 'face': return { ...e, points: e.points.map(s) };
      case 'point': return { ...e, at: s(e.at) };
      case 'insert': return { ...e, at: s(e.at), scale: s(e.scale) };
      case 'dimension': return { ...e, a: s(e.a), b: s(e.b), at: s(e.at), height: e.height * k };
      case 'room': return { ...e, at: s(e.at), height: e.height * k, unitsPerMm: e.unitsPerMm * k };
      case 'wall': return { ...e, a: s(e.a), b: s(e.b), thickness: e.thickness * k, height: e.height * k, unitsPerMm: e.unitsPerMm * k, openings: e.openings.map(o => ({ ...o, at: o.at * k, width: o.width * k })) };
    }
  });
}

/** A stable block name from the item and its parameters (same settings, same block). */
export function blockName(item: LibraryItem, p: Params): string {
  const parts = item.params.map(d => { const val = p[d.key]; return typeof val === 'number' ? String(Math.round(val * 10) / 10) : String(val).replace(/[^A-Za-z0-9]+/g, '').slice(0, 12); });
  return `${item.id.toUpperCase().replace(/-/g, '_')}${parts.length ? '_' + parts.join('x') : ''}`.slice(0, 120);
}

/** Build the block for an item in a drawing's units. */
export function makeBlock(item: LibraryItem, p: Params, units: CadModel['units']): CadBlock {
  const k = 1 / MM_PER_UNIT[units];
  return { name: blockName(item, p), base: [0, 0, 0], entities: scaleEntities(item.build({ ...defaultParams(item), ...p }), k) };
}

/** Add the block if the drawing lacks it, and the layer the item belongs on. */
export function ensureBlockAndLayer(m: CadModel, block: CadBlock, layer: string, color = '#ffffff'): CadModel {
  const blocks = m.blocks.some(b => b.name === block.name) ? m.blocks : [...m.blocks, block];
  const layers = m.layers.some(l => l.name === layer) ? m.layers : [...m.layers, { name: layer, color: LAYER_COLORS[layer] ?? color, visible: true }];
  return { ...m, blocks, layers };
}

/** Colours for the layers library items create (National CAD Standard names). */
export const LAYER_COLORS: Record<string, string> = {
  'A-DOOR': '#00ff00', 'A-GLAZ': '#00ffff', 'A-FLOR': '#c0c0c0', 'A-FURN': '#ff7f00', 'A-FLOR-CASE': '#bfbf00', 'A-FLOR-EQPM': '#7f7fff', 'P-FIXT': '#00bfff',
  'S-COLS': '#ff00ff', 'S-GRID': '#ff00ff', 'E-POWR': '#ff0000', 'E-LITE': '#ffbf00', 'E-FIRE': '#ff3f3f', 'L-PLNT': '#3fbf3f', 'C-VEHI': '#9f9f9f', 'C-PRKG': '#ffffff',
  'A-ANNO-SYMB': '#ffffff', 'A-ANNO-TTLB': '#ffffff',
};

/** Blocks a user can insert from a drawing: named ones (not *anonymous dimension or hatch blocks). */
export function userBlocks(m: CadModel): CadBlock[] {
  return m.blocks.filter(b => !b.name.startsWith('*') && !/^_/.test(b.name) && b.entities.length > 0);
}
