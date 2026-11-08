// Live accessibility pre-checks. Rules are written here in our own words and cite the section of
// the 2010 ADA Standards for Accessible Design they come from (a US federal regulation, public
// domain). This is a design aid that flags likely problems early; it is not a code review,
// approval or certification, and local codes may add or change requirements.

import type { CadModel, CadEntity2D } from './model';
import { MM_PER_UNIT } from './model';
import { detectRooms, pointInPoly, type Room } from './rooms';
import { findJoins, wallFaces, stationOf } from './walls';
import { parseLibraryBlock, hingeAndLatch } from './schedules';

type P = [number, number];
type Wall = Extract<CadEntity2D, { type: 'wall' }>;

export type CheckStatus = 'pass' | 'fail' | 'warn';
export interface Finding { rule: string; status: CheckStatus; title: string; detail: string; at: P; citation: string; entityIndex?: number }

export interface Rule { id: string; title: string; citation: string; what: string }
export const RULES: Rule[] = [
  { id: 'door-clear-width', title: 'Door clear width', citation: '2010 ADA Standards §404.2.3', what: 'Clear opening at least 815 mm (32 in) with the door open 90°. We estimate clear width as leaf width less 50 mm for the stop and leaf.' },
  { id: 'door-latch-clearance', title: 'Latch-side clearance, pull side', citation: '2010 ADA Standards §404.2.4.1', what: 'At least 455 mm (18 in) of wall beyond the latch on the pull (swing) side, for a front approach.' },
  { id: 'turning-space', title: 'Wheelchair turning space in toilet rooms', citation: '2010 ADA Standards §603.2.1, §304.3.1', what: 'A 1525 mm (60 in) diameter circle fits in rooms named bath, toilet, WC, restroom or washroom.' },
  { id: 'wc-centerline', title: 'Toilet centreline to side wall', citation: '2010 ADA Standards §604.2', what: 'Toilet centreline 405 to 455 mm (16 to 18 in) from the side wall.' },
  { id: 'stair-tread', title: 'Stair tread depth', citation: '2010 ADA Standards §504.2', what: 'Treads at least 279 mm (11 in) deep, uniform within a flight.' },
];
const rule = (id: string) => RULES.find(r => r.id === id)!;

const TOILET_ROOM = /\b(bath|bathroom|toilet|wc|restroom|washroom|lavatory|powder)\b/i;

/** Largest circle that fits inside a polygon (grid search, then refine). */
export function inscribedRadius(poly: P[]): { r: number; c: P } {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const edgeDist = (p: P) => { let d = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return d; };
  let best: { r: number; c: P } = { r: 0, c: [(x0 + x1) / 2, (y0 + y1) / 2] };
  for (let round = 0; round < 4; round++) {
    const n = 24; const sx = (x1 - x0) / n, sy = (y1 - y0) / n;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const p: P = [x0 + i * sx, y0 + j * sy]; if (!pointInPoly(p, poly)) continue; const d = edgeDist(p); if (d > best.r) best = { r: d, c: p }; }
    x0 = best.c[0] - sx * 2; x1 = best.c[0] + sx * 2; y0 = best.c[1] - sy * 2; y1 = best.c[1] + sy * 2;
  }
  return best;
}

export function runChecks(m: CadModel): Finding[] {
  const upm = 1 / MM_PER_UNIT[m.units]; const mm = (v: number) => v / upm; const out: Finding[] = [];
  const walls = m.entities.filter((e): e is Wall => e.type === 'wall'); const joins = findJoins(walls);
  const imp = m.units === 'in' || m.units === 'ft'; const show = (v: number) => imp ? `${(v / 25.4).toFixed(1)} in` : `${Math.round(v)} mm`;

  // Doors hosted in walls.
  m.entities.forEach((e, i) => {
    if (e.type !== 'wall') return;
    const a: P = [e.a[0], e.a[1]], b: P = [e.b[0], e.b[1]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const u: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    for (const o of e.openings) {
      if (o.kind !== 'door') continue; const at: P = [a[0] + u[0] * (o.at + o.width / 2), a[1] + u[1] * (o.at + o.width / 2)];
      const swinging = !o.item || ['door-single', 'door-double'].includes(o.item);
      // A pair: one active leaf must give the clear width on its own.
      const clear = mm(o.width) / (o.item === 'door-double' ? 2 : 1) - (swinging ? 50 : 0);
      const r1 = rule('door-clear-width');
      out.push({ rule: r1.id, status: clear >= 815 ? 'pass' : 'fail', title: r1.title, detail: `Clear width about ${show(clear)} (needs ${show(815)}).`, at, citation: r1.citation, entityIndex: i });
      if (o.item === 'door-single') {
        const { latch, hinge } = hingeAndLatch(e, o); const faces = wallFaces(e, joins.get(e) ?? []); const face = o.flip ? faces.right : faces.left;
        const s0 = stationOf(e, face[0]).s, s1 = stationOf(e, face[1]).s;
        // The wall may continue past the latch into another opening; that space is not usable either.
        const towardEnd = latch > hinge; let room = towardEnd ? s1 - latch : latch - s0;
        for (const other of e.openings) if (other !== o) { if (towardEnd && other.at >= latch) room = Math.min(room, other.at - latch); if (!towardEnd && other.at + other.width <= latch) room = Math.min(room, latch - (other.at + other.width)); }
        const r2 = rule('door-latch-clearance'); const latchPt: P = [a[0] + u[0] * latch, a[1] + u[1] * latch];
        out.push({ rule: r2.id, status: mm(room) >= 455 ? 'pass' : 'fail', title: r2.title, detail: `${show(mm(room))} of wall beyond the latch on the swing side (needs ${show(455)}).`, at: latchPt, citation: r2.citation, entityIndex: i });
      }
    }
  });

  // Toilet rooms: turning space.
  const rooms: Room[] = detectRooms(m.entities);
  for (const r of rooms) {
    if (!r.name || !TOILET_ROOM.test(r.name)) continue; const ins = inscribedRadius(r.net); const rr = rule('turning-space');
    out.push({ rule: rr.id, status: mm(ins.r * 2) >= 1525 ? 'pass' : 'fail', title: rr.title, detail: `${r.name}: largest clear circle about ${show(mm(ins.r * 2))} (needs ${show(1525)}).`, at: ins.c, citation: rr.citation });
  }

  // Wall faces (and plain lines) for the toilet check.
  const faceLines: Array<[P, P]> = [];
  for (const w of walls) { const f = wallFaces(w, joins.get(w) ?? []); faceLines.push(f.left, f.right); }
  for (const e of m.entities) if (e.type === 'line') faceLines.push([[e.a[0], e.a[1]], [e.b[0], e.b[1]]]);

  m.entities.forEach((e, i) => {
    if (e.type !== 'insert') return; const lib = parseLibraryBlock(e.block); if (!lib) return;
    const at: P = [e.at[0], e.at[1]];
    if (lib.item.id === 'wc') {
      // The toilet's axis points out of the wall it backs onto (+y in the library, then rotated and possibly flipped).
      const rad = e.rotation * Math.PI / 180; const ax: P = [-Math.sin(rad) * Math.sign(e.scale[1] || 1), Math.cos(rad) * Math.sign(e.scale[1] || 1)];
      let best = Infinity;
      for (const [p, q] of faceLines) {
        const dx = q[0] - p[0], dy = q[1] - p[1]; const l = Math.hypot(dx, dy); if (l < 1e-9) continue;
        if (Math.abs((dx * ax[1] - dy * ax[0]) / l) > 0.1) continue; // only walls parallel to the axis are side walls
        const t = ((at[0] - p[0]) * dx + (at[1] - p[1]) * dy) / (l * l); const reachMm = 1500;
        const dist = Math.abs((at[0] - p[0]) * dy - (at[1] - p[1]) * dx) / l;
        // The side wall must run alongside the toilet (its span covers the toilet's back within reach).
        if (t < -reachMm * upm / l || t > 1 + reachMm * upm / l) continue;
        if (mm(dist) <= reachMm) best = Math.min(best, dist);
      }
      const rw = rule('wc-centerline');
      if (!Number.isFinite(best)) out.push({ rule: rw.id, status: 'warn', title: rw.title, detail: 'No side wall within 1500 mm of the toilet centreline.', at, citation: rw.citation, entityIndex: i });
      else out.push({ rule: rw.id, status: mm(best) >= 405 && mm(best) <= 455 ? 'pass' : 'fail', title: rw.title, detail: `Centreline ${show(mm(best))} from the side wall (needs ${show(405)} to ${show(455)}).`, at, citation: rw.citation, entityIndex: i });
    }
    if (lib.item.id === 'stair-straight' || lib.item.id === 'stair-l') {
      const going = Number(lib.params.going); const rs = rule('stair-tread');
      out.push({ rule: rs.id, status: going >= 279 ? 'pass' : 'fail', title: rs.title, detail: `Treads ${show(going)} deep (needs at least ${show(279)}). Riser height is not modelled yet.`, at, citation: rs.citation, entityIndex: i });
    }
  });
  return out;
}

export const DISCLAIMER = 'Pre-check only: flags likely issues against the 2010 ADA Standards as you draw. It is not a code review or approval; local codes and the authority having jurisdiction decide.';
