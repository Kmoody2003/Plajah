// Electric guitar and bass bodies for the CNC router: our own original "Arc" double-cutaway outline
// (not a copy of any maker's shape), with neck pocket, pickup and control routes placed from the
// scale length, plus a slotted fretboard. Fret positions use the equal-temperament rule
// d(n) = s − s / 2^(n/12), measured from the nut. Millimetres; body y = 0 at the tail.

import type { CadEntity2D, CadModel, Vec3 } from '../cad/model';
import { emptyModel } from '../cad/model';

export const fretPosition = (scale: number, n: number) => scale - scale / Math.pow(2, n / 12);

export interface GuitarSpec { scale: number; frets: number; pickups: Array<'humbucker' | 'single'>; bass?: boolean; name?: string }
export interface GuitarPlan { model: CadModel; routes: string[][]; notes: string[]; bridgeY: number; edgeFret: number; bodyLength: number }

/** Closed Catmull-Rom curve through control points. */
function smooth(pts: Array<[number, number]>, per = 10): Array<[number, number]> {
  const out: Array<[number, number]> = []; const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < per; k++) { const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  return out;
}
const rrect = (cx: number, cy: number, w: number, h: number, r: number): Array<[number, number]> => {
  const out: Array<[number, number]> = []; const q = (ax: number, ay: number, a0: number) => { for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; out.push([ax + r * Math.cos(a), ay + r * Math.sin(a)]); } };
  q(cx + w / 2 - r, cy + h / 2 - r, 0); q(cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2); q(cx - w / 2 + r, cy - h / 2 + r, Math.PI); q(cx + w / 2 - r, cy - h / 2 + r, 1.5 * Math.PI); return out;
};
const circle = (cx: number, cy: number, r: number) => Array.from({ length: 32 }, (_, i) => [cx + r * Math.cos(i / 32 * 2 * Math.PI), cy + r * Math.sin(i / 32 * 2 * Math.PI)] as [number, number]);

export function guitarPlan(spec: GuitarSpec): GuitarPlan {
  const s = spec.scale; const sy = s > 700 ? 1.15 : 1; const valley = 360 * sy;
  // Our outline: offset double cutaway, bass horn longer than treble horn.
  const ctrl: Array<[number, number]> = [[0, 0], [115, 18], [168, 100], [152, 205], [122, 262], [150, 335], [128, 420], [100, 450], [72, 405], [33, 362],
    [-33, 362], [-62, 405], [-84, 418], [-112, 365], [-112, 280], [-150, 205], [-162, 100], [-110, 18]].map(([x, y]) => [x, y * sy] as [number, number]);
  const outline = smooth(ctrl);
  // The neck joins where the bridge lands at least 90 mm from the tail.
  let edgeFret = 16; while (edgeFret < 22 && valley - (s - fretPosition(s, edgeFret)) < 90) edgeFret++;
  const bridgeY = valley - (s - fretPosition(s, edgeFret));
  const notes: string[] = []; const ents: CadEntity2D[] = []; const routes: string[][] = [['Route', 'Size (mm)', 'Depth (mm)', 'From']];
  const P = (pts: Array<[number, number]>, layer: string, closed = true): CadEntity2D => ({ type: 'polyline', layer, closed, points: pts.map(([x, y]) => [x, y, 0] as Vec3) });
  const text = (x: number, y: number, t: string, h = 4): CadEntity2D => ({ type: 'text', layer: 'NOTES', at: [x, y, 0], height: h, rotation: 0, text: t });
  ents.push(P(outline, 'OUTLINE')); routes.push(['Body outline', 'through', 'full thickness (44-45 mm blank)', 'top, with tabs']);
  // Neck pocket: 56 mm wide (typical heel), from 80 mm inside the body out through the top edge.
  const neckW = spec.bass ? 64 : 56; ents.push(P(rrect(0, valley - 30, neckW, 110, 4), 'NECK_POCKET')); routes.push(['Neck pocket', `${neckW} × ${110 - 30}`, '16', 'top']);
  // Pickups: bridge pickup ~42 mm ahead of the saddle, neck pickup near 23.5% of the scale.
  const pos = spec.pickups.length === 1 ? [bridgeY + 42] : [bridgeY + 42, bridgeY + 0.235 * s];
  spec.pickups.forEach((t, i) => {
    const y = pos[i] ?? bridgeY + 42 + i * 60; const w = spec.bass ? 100 : t === 'humbucker' ? 72 : 88, h = t === 'humbucker' ? 40 : 20;
    ents.push(P(rrect(0, y, w, h, t === 'humbucker' ? 4 : 9), 'PICKUP')); routes.push([`${i ? 'Neck' : 'Bridge'} ${t}`, `${w} × ${h}`, t === 'humbucker' ? '19' : '17', 'top']);
  });
  // Wiring channel and control cavity (rear).
  const cav: [number, number] = [-88, 118 * sy];
  ents.push(P(rrect(-44, (pos[0] + cav[1]) / 2, 10, Math.abs(pos[0] - cav[1]) + 10, 5), 'CHANNEL')); routes.push(['Wire channel', '10 wide', '12', 'top (under pickguard) or drill']);
  ents.push(P(rrect(cav[0], cav[1], 110, 62, 12), 'CONTROL')); routes.push(['Control cavity', '110 × 62', '32 (leave 6 mm top)', 'back']);
  const pots = 2 + (spec.pickups.length > 1 ? 1 : 0);
  for (let k = 0; k < pots; k++) ents.push(P(circle(cav[0] - 35 + k * 35, cav[1], 4.75), 'POT_HOLES'));
  routes.push(['Pot / switch holes', '9.5 Ø (3/8")', 'through top into cavity', 'top']);
  ents.push(text(cav[0] - 50, cav[1] - 45, 'Side jack: 22 mm (7/8") bore, 30 mm deep, into the cavity'));
  // Bridge and centreline.
  ents.push({ type: 'line', layer: 'BRIDGE', a: [-38, bridgeY, 0], b: [38, bridgeY, 0] }, text(42, bridgeY - 2, `Saddle line ${bridgeY.toFixed(1)} mm (scale ${s} mm)`, 3.5));
  ents.push({ type: 'line', layer: 'CENTRE', a: [0, -10, 0], b: [0, valley + 110 * sy, 0] });
  notes.push(`Neck meets the body at fret ${edgeFret}; saddle line ${bridgeY.toFixed(1)} mm from the tail.`, 'Set saddles 2-3 mm behind the line for intonation (wound strings further).');
  // Fretboard, drawn to the right: nut 43/45 mm, widening to 56/62 mm at the last fret.
  const x0 = 260, end = fretPosition(s, spec.frets) + 6; const wn = spec.bass ? 42 : 43, we = spec.bass ? 62 : 56; const wAt = (d: number) => wn + (we - wn) * d / end;
  ents.push(P([[x0 - wn / 2, 0], [x0 + wn / 2, 0], [x0 + we / 2, end], [x0 - we / 2, end]], 'FRETBOARD'));
  for (let n = 1; n <= spec.frets; n++) { const d = fretPosition(s, n); ents.push({ type: 'line', layer: 'FRET_SLOTS', a: [x0 - wAt(d) / 2 + 1, d, 0], b: [x0 + wAt(d) / 2 - 1, d, 0] }); }
  ents.push(text(x0 + we / 2 + 4, 0, 'Nut (0)', 3.5), text(x0 + we / 2 + 4, fretPosition(s, 12), `12th fret ${fretPosition(s, 12).toFixed(2)} mm`, 3.5));
  routes.push(['Fret slots', `${spec.frets} slots, 0.6 mm saw`, '3', 'fretboard top']);
  const m = emptyModel(`${spec.name ?? (spec.bass ? 'bass' : 'guitar')}-body.dxf`, 'dxf', 'plajah-elec'); m.units = 'mm'; m.is2D = true;
  const col: Record<string, string> = { OUTLINE: '#ff4d4d', NECK_POCKET: '#ffd43b', PICKUP: '#51cf66', CHANNEL: '#74c0fc', CONTROL: '#b197fc', POT_HOLES: '#f783ac', BRIDGE: '#ffffff', CENTRE: '#868e96', FRETBOARD: '#ff922b', FRET_SLOTS: '#e9ecef', NOTES: '#adb5bd' };
  m.layers = Object.entries(col).map(([name, color]) => ({ name, color, visible: true }));
  m.entities = ents;
  const xs = ents.flatMap(e => e.type === 'polyline' ? e.points.map(p => p[0]) : e.type === 'line' ? [e.a[0], e.b[0]] : []), ys = ents.flatMap(e => e.type === 'polyline' ? e.points.map(p => p[1]) : e.type === 'line' ? [e.a[1], e.b[1]] : []);
  m.bounds = { min: [Math.min(...xs), Math.min(...ys), 0], max: [Math.max(...xs), Math.max(...ys), 0] };
  return { model: m, routes, notes, bridgeY, edgeFret, bodyLength: Math.max(...outline.map(p => p[1])) };
}
