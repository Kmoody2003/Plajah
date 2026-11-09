// Trims as simulated attachments: buttons (mass and a rigid disc riding on the cloth), zips (a stiff,
// heavier tape along a seam), elastic (an edge gathered to a ratio with a real pull), and drawcords
// (a cord threaded through a casing with ends that hang and swing). Each trim also carries what the
// safety rules need: a button's size against the small-parts cylinder, a cord's position (hood/neck
// or waist) and how far its ends hang out.

import type { Pt } from '../geometry';
import { rect } from '../geometry';
import type { Hazard } from '../../safety/hazards';
import type { Audience, Pattern } from '../patterns';
import { CHILD_SIZES } from '../patterns';
import type { ClothModel, GatherSpec, PlacedPiece, SeamSpec, SeamSide } from './cloth';
import { K_STITCH } from './cloth';
import type { Rig } from './garment';
import { fabricById, type Fabric } from './fabrics';
import type { V3 } from './avatar';

export type TrimSpec =
  | { kind: 'button'; piece: string; at: Pt; diameterMm: number; grams?: number; label?: string }
  | { kind: 'zip'; piece: string; from: Pt; to: Pt; via?: Pt; gramsPerM?: number; label?: string }
  | { kind: 'elastic'; piece: string; from: Pt; to: Pt; via?: Pt; ratio: number; forceN?: number; label?: string }
  | { kind: 'drawcord'; casing: SeamSide[]; endMm: number; diameterMm?: number; where: 'hood' | 'neck' | 'waist' | 'hem'; label?: string };

/** The cord itself: a narrow strip of stiff, non-stretch braid (5 mm), threaded and stitched to the casing. */
const CORD: Fabric = { ...fabricById('poplin')!, id: 'cord', name: 'Braided cord', knit: false, gsm: 1200, stretchWarp: 1, stretchWeft: 1, bend: 0.5, thickness: 4, friction: 0.5, colour: '#f1ece2', finish: 'twill' };

/** Before the cloth is built: cords become strip pieces stitched along their casing; elastic becomes a gather. */
export function trimsIntoRig(rig: Rig, trims: TrimSpec[]): Rig {
  const placed: PlacedPiece[] = [...rig.placed]; const seams: SeamSpec[] = [...rig.seams]; const gathers: GatherSpec[] = [...(rig.gathers ?? [])];
  trims.forEach((t, k) => {
    if (t.kind === 'elastic') gathers.push({ name: t.label ?? `Elastic ${k + 1}`, piece: t.piece, from: t.from, to: t.to, via: t.via, ratio: t.ratio, force: t.forceN ?? 8 });
    if (t.kind !== 'drawcord') return;
    // Trace the casing in 3D from each piece's own placement map (its flat edge, sampled).
    const segs = t.casing.map(c => { const P = placed.find(p => p.id === c.piece); return P ? { P, c } : null; }).filter(Boolean) as Array<{ P: PlacedPiece; c: SeamSide }>; if (!segs.length) return;
    const path3: V3[] = []; let casingLen = 0;
    for (const { P, c } of segs) { const n = 24; for (let i = 0; i <= n; i++) { const q: Pt = [c.from[0] + (c.to[0] - c.from[0]) * i / n, c.from[1] + (c.to[1] - c.from[1]) * i / n]; const w = P.map(q); if (path3.length) casingLen += Math.hypot(w[0] - path3[path3.length - 1][0], w[1] - path3[path3.length - 1][1], w[2] - path3[path3.length - 1][2]); path3.push(w); } }
    const flatCasing = t.casing.reduce((s, c) => s + Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]), 0); const L = flatCasing + 2 * t.endMm; const W = t.diameterMm ?? 5;
    const at = (s: number): V3 => {
      // Along the cord: an end hanging straight down, the casing, the other end hanging.
      if (s <= t.endMm) { const a = path3[0]; return [a[0], a[1] - (t.endMm - s), a[2] + 3]; }
      if (s >= t.endMm + flatCasing) { const b = path3[path3.length - 1]; return [b[0], b[1] - (s - t.endMm - flatCasing), b[2] + 3]; }
      const f = (s - t.endMm) / flatCasing * (path3.length - 1); const i = Math.min(path3.length - 2, Math.floor(f)), u = f - i; const a = path3[i], b = path3[i + 1]; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + 2];
    };
    const id = `cord-${k}`; placed.push({ id, name: t.label ?? 'Drawcord', pieceId: 'drawcord', role: 'other', seam: rect(0, 0, L, W), fabric: CORD, grainAngle: 0, map: q => { const w = at(q[0]); return [w[0], w[1], w[2] + q[1]]; }, sizing: () => 4, layer: Math.max(...placed.map(p => p.layer ?? 0)) + 1, garment: placed.find(p => p.id === t.casing[0].piece)?.garment ?? 0 });
    // Stitch the cord's casing run to the casing edges, in order.
    let s0 = t.endMm; for (const c of t.casing) { const len = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]); seams.push({ name: `${t.label ?? 'Drawcord'} in casing`, a: [{ piece: id, from: [s0, 0], to: [s0 + len, 0] }], b: [c] }); s0 += len; }
    void casingLen;
  });
  return { ...rig, placed, seams, gathers };
}

export interface TrimState { buttons: Array<{ vertex: number; diameterMm: number; label: string }>; cords: Array<{ piece: number; endMm: number; where: string; label: string }>; zips: string[] }

/** After the cloth is built: buttons add mass at their vertex, zips stiffen and weigh down their path. */
export function trimsIntoModel(m: ClothModel, trims: TrimSpec[]): TrimState {
  const st: TrimState = { buttons: [], cords: [], zips: [] };
  trims.forEach((t, k) => {
    if (t.kind === 'button') { const P = m.pieces.find(p => p.id === t.piece); if (!P) return; let bi = P.v0, bd = Infinity; for (let i = P.v0; i < P.v0 + P.vn; i++) { const d = Math.hypot(m.rest2[2 * i] - t.at[0], m.rest2[2 * i + 1] - t.at[1]); if (d < bd) { bd = d; bi = i; } }
      const g = t.grams ?? Math.max(0.3, t.diameterMm * t.diameterMm * 0.004); m.mass[bi] += g; m.invMass[bi] = 1 / m.mass[bi]; st.buttons.push({ vertex: bi, diameterMm: t.diameterMm, label: t.label ?? `Button ${k + 1}` }); }
    if (t.kind === 'zip') { const P = m.pieces.findIndex(p => p.id === t.piece); if (P < 0) return; const C = m.pieces[P];
      // Vertices within 8 mm of the zip line: heavier, and every constraint between two of them is made near-rigid (zip tape and teeth).
      const near = new Set<number>(); const seg = (q: Pt) => { const ax = t.from[0], ay = t.from[1], bx = t.to[0], by = t.to[1]; const dx = bx - ax, dy = by - ay; const u = Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(q[0] - ax - dx * u, q[1] - ay - dy * u); };
      for (let i = C.v0; i < C.v0 + C.vn; i++) if (seg([m.rest2[2 * i], m.rest2[2 * i + 1]]) < 8) near.add(i);
      const len = Math.hypot(t.to[0] - t.from[0], t.to[1] - t.from[1]); const gEach = (t.gramsPerM ?? 25) * len / 1000 / Math.max(1, near.size); for (const i of near) { m.mass[i] += gEach; m.invMass[i] = 1 / m.mass[i]; }
      for (let c = 0; c < m.nc; c++) if (m.kind[c] !== K_STITCH && near.has(m.a0[c]) && near.has(m.b0[c])) { m.compT[c] = Math.min(m.compT[c], 1e-8); m.compC[c] = Math.min(m.compC[c], 1e-7); }
      st.zips.push(t.label ?? `Zip ${k + 1}`); }
    if (t.kind === 'drawcord') { const pi = m.pieces.findIndex(p => p.id === `cord-${k}`); if (pi >= 0) st.cords.push({ piece: pi, endMm: t.endMm, where: t.where, label: t.label ?? 'Drawcord' }); }
  });
  return st;
}

/** Hanging length (mm) of each cord end below its casing, measured on the draped cord. */
export function cordEnds(m: ClothModel, cord: { piece: number; endMm: number }): [number, number] {
  const P = m.pieces[cord.piece]; let lo0 = Infinity, lo1 = Infinity; const L = Math.max(...Array.from({ length: P.vn }, (_, k) => m.rest2[2 * (P.v0 + k)]));
  const endPos = (s: number) => { let bi = P.v0, bd = Infinity; for (let i = P.v0; i < P.v0 + P.vn; i++) { const d = Math.abs(m.rest2[2 * i] - s); if (d < bd) { bd = d; bi = i; } } return bi; };
  const a = endPos(0), a0 = endPos(cord.endMm), b = endPos(L), b0 = endPos(L - cord.endMm); void lo0; void lo1;
  const d = (i: number, j: number) => Math.hypot(m.pos[3 * i] - m.pos[3 * j], m.pos[3 * i + 1] - m.pos[3 * j + 1], m.pos[3 * i + 2] - m.pos[3 * j + 2]);
  return [d(a, a0), d(b, b0)];
}

/** The standard trims a pattern asks for, placed on the rig's pieces (hood drawcord, waist elastic). */
export function trimsForPattern(p: Pattern, rig: Rig, prefix = ''): TrimSpec[] {
  const out: TrimSpec[] = []; const has = (id: string) => rig.placed.some(x => x.id === prefix + id);
  if (p.template === 'hoodie' && p.features.drawstring && has('hood-L') && has('hood-R')) {
    const hood = rig.placed.find(x => x.id === prefix + 'hood-L')!; const top = Math.max(...hood.seam.filter(q => q[0] < 1).map(q => q[1]));
    out.push({ kind: 'drawcord', where: 'hood', endMm: 180, label: 'Hood drawcord', casing: [{ piece: prefix + 'hood-L', from: [0, 0], to: [0, top] }, { piece: prefix + 'hood-R', from: [0, top], to: [0, 0] }] });
  }
  return out;
}

/** Safety from the trims as simulated. */
export function trimHazards(p: Pattern, audience: Audience, st: TrimState, m: ClothModel): Hazard[] {
  const out: Hazard[] = []; const child = audience !== 'adult' || (!!p.size && CHILD_SIZES.includes(p.size)); const young = audience === 'under3' || audience === 'infant';
  for (const b of st.buttons) {
    if (young && b.diameterMm < 31.7) out.push({ id: 'trim-small-part', stage: 'idea', severity: 'critical', block: true, title: `${b.label}: a small part for under-3s`, why: `A ${b.diameterMm} mm button fits the small-parts cylinder (31.7 mm). If it comes off, a baby or toddler can choke on it.`, mitigate: ['Use snaps tested for pull strength, or sew-through fabric loops; or leave buttons off garments for under-3s.'], cite: '16 CFR 1501' });
    else if (child) out.push({ id: `trim-button-pull-${b.vertex}`, stage: 'build', severity: 'high', title: `${b.label}: must survive a pull test`, why: 'Buttons on children\'s clothes must not come off under a firm pull and twist.', mitigate: ['Sew with a thread shank, strong polyester thread, at least 6 passes; pull-test every one.'], cite: 'ASTM D4846; CPSIA' });
  }
  for (const c of st.cords) {
    // The rule is about the cut cord with the garment flat and relaxed: use the end length as cut;
    // the draped ends (which also sag and stretch in the solver) are reported alongside.
    const [e0, e1] = cordEnds(m, c); const longest = c.endMm;
    if (child && (c.where === 'hood' || c.where === 'neck')) out.push({ id: 'trim-cord-hood-child', stage: 'idea', severity: 'critical', block: true, title: `${c.label} on a child's ${c.where}`, why: `Hood and neck drawstrings on children's upper outerwear (sizes 2T-12) are a substantial product hazard: they catch on slides, bus doors and cribs. This one hangs ${Math.round(longest / 10)} cm out.`, mitigate: ['Remove it: elastic, snaps or a fixed hood instead.'], cite: '16 CFR 1120; ASTM F1816' });
    else if (child && longest > 75) out.push({ id: 'trim-cord-ends', stage: 'idea', severity: 'high', block: true, title: `${c.label}: ends too long for children`, why: `The ends are cut ${Math.round(c.endMm)} mm long (on the avatar they hang ${Math.round(e0)} and ${Math.round(e1)} mm). Children's waist and bottom drawstrings may extend no more than 75 mm (3″) with the garment flat and relaxed.`, mitigate: ['Shorten the ends to 75 mm or less, no toggles or knots, and bartack the cord at its midpoint.'], cite: 'ASTM F1816; 16 CFR 1120' });
    else if (longest > 250) out.push({ id: 'trim-cord-long', stage: 'build', severity: 'low', title: `${c.label}: long ends`, why: `Ends hang ${Math.round(longest / 10)} cm; long cords catch in doors and machinery.`, mitigate: ['Shorten the ends and bartack the cord at centre back.'] });
  }
  return out;
}
