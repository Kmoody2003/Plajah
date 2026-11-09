// Sheet metal: bend tables, flat patterns and DXF for the press brake.
//   K-factor   from DIN 6935 (k = 0.65 + ½·lg(R/t), the neutral axis sits k·t/2 in), unless you give one.
//   BA         bend allowance = θ · (R + K·t), the length of the neutral axis through the bend.
//   OSSB       outside setback = tan(θ/2) · (R + t); BD (bend deduction) = 2·OSSB − BA.
//   Air bending: V-die opening ≈ 8·t (10·t past 6 mm), formed inside radius ≈ a material share of V,
//              force per metre F = 1.42 · Rm · t² / V (kN/m, Rm in MPa), minimum flange ≈ 0.7·V.
// Parts: a brake-formed profile (flanges and bends along one direction, any angles, up or down) or a
// tray (base with up to four 90° flanges and round corner reliefs). Flat patterns go out as DXF with
// the cut outline on CUT, bend centre lines on BEND and their notes on BEND_NOTES.

import type { P2, Loop } from './geom2d';
import { area } from './geom2d';
import type { DfmFinding } from './dfm';
import { type Hazard, sortHazards } from '../safety/hazards';
import type { CadEntity2D, CadModel } from '../cad/model';
import { emptyModel } from '../cad/model';
import { writeDxf } from '../cad/dxf';

export interface SheetMaterial { id: string; name: string; uts: number; /** Smallest inside radius, × t. */ minRadius: number; /** Air-bent inside radius as a share of the V opening. */ airRadius: number; springback: number; thicknesses: number[]; note?: string }
// Typical published values (mill and press-brake makers' guidance), not a supplier's certificate.
export const SHEET_MATERIALS: SheetMaterial[] = [
  { id: 'steel-cr', name: 'Mild steel (cold rolled)', uts: 400, minRadius: 0.5, airRadius: 0.156, springback: 1, thicknesses: [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8] },
  { id: 'ss304', name: 'Stainless 304', uts: 600, minRadius: 1, airRadius: 0.2, springback: 3, thicknesses: [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6] },
  { id: 'al5052', name: 'Aluminium 5052-H32', uts: 230, minRadius: 1, airRadius: 0.13, springback: 2, thicknesses: [0.5, 0.8, 1, 1.2, 1.6, 2, 2.5, 3, 4, 5, 6] },
  { id: 'al6061', name: 'Aluminium 6061-T6', uts: 310, minRadius: 3, airRadius: 0.2, springback: 4, thicknesses: [0.8, 1, 1.6, 2, 2.5, 3, 4, 5, 6], note: 'Cracks on tight bends: use 3× t or larger, bend across the grain, or use 5052.' },
  { id: 'copper', name: 'Copper C110 (half hard)', uts: 260, minRadius: 0.5, airRadius: 0.13, springback: 1, thicknesses: [0.5, 0.8, 1, 1.5, 2, 3] },
  { id: 'brass', name: 'Brass 260 (half hard)', uts: 430, minRadius: 1, airRadius: 0.15, springback: 2, thicknesses: [0.5, 0.8, 1, 1.5, 2, 3] },
];
export const sheetMaterial = (id: string) => SHEET_MATERIALS.find(m => m.id === id) ?? SHEET_MATERIALS[0];

const rad = (deg: number) => deg * Math.PI / 180;
/** DIN 6935 K-factor (neutral axis position as a fraction of t from the inside). */
export const kFactor = (R: number, t: number) => Math.max(0.25, Math.min(0.5, (0.65 + 0.5 * Math.log10(Math.max(1e-6, R / t))) / 2));
export const bendAllowance = (angle: number, R: number, t: number, K = kFactor(R, t)) => rad(angle) * (R + K * t);
export const outsideSetback = (angle: number, R: number, t: number) => Math.tan(rad(angle) / 2) * (R + t);
export const insideSetback = (angle: number, R: number) => Math.tan(rad(angle) / 2) * R;
export const bendDeduction = (angle: number, R: number, t: number, K = kFactor(R, t)) => 2 * outsideSetback(angle, R, t) - bendAllowance(angle, R, t, K);
export const vDie = (t: number) => (t <= 6 ? 8 : 10) * t;
/** Air-bending force for a bend `length` mm long, kN. */
export const bendForceKN = (uts: number, t: number, V: number, length: number) => 1.42 * uts * t * t / V * length / 1000;

export interface BendRow { angle: number; ba: number; bd: number; ossb: number }
export interface BendTable { material: string; t: number; V: number; R: number; K: number; minFlange: number; forcePerM: number; springback: number; rows: BendRow[] }
/** The bend table for a material and thickness: die, formed radius, K, and BA / BD at the usual angles. */
export function bendTable(materialId: string, t: number, o: { R?: number; K?: number } = {}): BendTable {
  const m = sheetMaterial(materialId); const V = vDie(t); const R = o.R ?? +Math.max(m.airRadius * V, m.minRadius * t).toFixed(2); const K = o.K ?? kFactor(R, t);
  return { material: m.name, t, V, R, K, minFlange: +(0.7 * V).toFixed(1), forcePerM: +(bendForceKN(m.uts, t, V, 1000)).toFixed(1), springback: m.springback,
    rows: [30, 45, 60, 90, 120, 135].map(a => ({ angle: a, ba: bendAllowance(a, R, t, K), bd: bendDeduction(a, R, t, K), ossb: outsideSetback(a, R, t) })) };
}

// ---------------------------------------------------------------- parts
export interface Bend { angle: number; dir: 'up' | 'down'; radius?: number }
export interface SheetHole { /** Segment it sits on, its distance from that segment's start (along the flat), across the width, diameter. */ seg: number; at: number; y: number; dia: number }
export interface ProfilePart { kind: 'profile'; material: string; t: number; width: number; radius?: number; k?: number;
  /** Flange lengths between bends: outside (mold-line), inside, or the flat straight lengths. */ segments: number[]; dims: 'outside' | 'inside' | 'flat'; bends: Bend[]; holes?: SheetHole[] }
export interface TrayPart { kind: 'tray'; material: string; t: number; radius?: number; k?: number;
  /** Outside size of the base and outside flange heights per side (0 = no flange). */ w: number; l: number; flanges: { s: number; e: number; n: number; w: number }; relief?: number }
export type SheetPart = ProfilePart | TrayPart;

export interface FlatBend { a: P2; b: P2; angle: number; dir: 'up' | 'down'; radius: number; ba: number; /** Bend zone edges (tangent lines). */ zone: [P2, P2, P2, P2] }
export interface FlatPattern { outline: Loop; holes: Array<{ c: P2; r: number }>; bends: FlatBend[]; size: [number, number]; segments: number[]; total: number; R: number; K: number; warnings: string[] }

const radiusFor = (p: SheetPart) => p.radius ?? bendTable(p.material, p.t).R;

export function flatPattern(p: SheetPart): FlatPattern { return p.kind === 'tray' ? trayFlat(p) : profileFlat(p); }

function profileFlat(p: ProfilePart): FlatPattern {
  const warnings: string[] = []; const t = p.t; const Rd = radiusFor(p);
  if (p.segments.length !== p.bends.length + 1) throw new Error(`A profile with ${p.bends.length} bends needs ${p.bends.length + 1} flange lengths.`);
  const Rs = p.bends.map(b => b.radius ?? Rd); const Ks = Rs.map(R => p.k ?? kFactor(R, t));
  const set = (i: number) => (p.dims === 'flat' ? 0 : p.dims === 'outside' ? outsideSetback(p.bends[i].angle, Rs[i], t) : insideSetback(p.bends[i].angle, Rs[i]));
  // Straight (flat) length of each segment: its dimension less the setback at each bend it meets.
  const flats = p.segments.map((L, i) => L - (i > 0 ? set(i - 1) : 0) - (i < p.bends.length ? set(i) : 0));
  flats.forEach((f, i) => { if (f < 0) warnings.push(`Flange ${i + 1} is shorter than the bends at its ends (${f.toFixed(2)} mm of flat).`); });
  const bas = p.bends.map((b, i) => bendAllowance(b.angle, Rs[i], t, Ks[i]));
  let x = 0; const bends: FlatBend[] = []; const starts: number[] = [];
  flats.forEach((f, i) => {
    starts.push(x); x += f;
    if (i < p.bends.length) { const ba = bas[i]; const c = x + ba / 2; bends.push({ a: [c, 0], b: [c, p.width], angle: p.bends[i].angle, dir: p.bends[i].dir, radius: Rs[i], ba, zone: [[x, 0], [x, p.width], [x + ba, p.width], [x + ba, 0]] }); x += ba; }
  });
  const holes = (p.holes ?? []).map(h => ({ c: [starts[h.seg] + h.at, h.y] as P2, r: h.dia / 2 }));
  return { outline: [[0, 0], [x, 0], [x, p.width], [0, p.width]], holes, bends, size: [x, p.width], segments: flats, total: x, R: Rd, K: Ks[0] ?? kFactor(Rd, t), warnings };
}

function trayFlat(p: TrayPart): FlatPattern {
  const warnings: string[] = []; const t = p.t; const R = radiusFor(p); const K = p.k ?? kFactor(R, t);
  const ba = bendAllowance(90, R, t, K), os = outsideSetback(90, R, t); const F = p.flanges; const has = { s: F.s > 0, e: F.e > 0, n: F.n > 0, w: F.w > 0 };
  // Base flat, then each flange: bend zone plus its straight length.
  const W = p.w - (has.w ? os : 0) - (has.e ? os : 0), L = p.l - (has.s ? os : 0) - (has.n ? os : 0);
  const ext = { s: has.s ? ba + F.s - os : 0, e: has.e ? ba + F.e - os : 0, n: has.n ? ba + F.n - os : 0, w: has.w ? ba + F.w - os : 0 };
  (['s', 'e', 'n', 'w'] as const).forEach(k => { if (has[k] && F[k] - os < 0) warnings.push(`The ${({ s: 'front', e: 'right', n: 'back', w: 'left' })[k]} flange is shorter than its bend.`); });
  const rr = p.relief ?? Math.max(t, 0.5);
  // Outline: the cross of base and flanges, counter-clockwise. Where two flanges meet, the corner is notched
  // and a round relief (radius rr) is cut through the base corner, where the bend lines meet, so it cannot tear.
  const out: Loop = [];
  const relief = (c: P2, start: number) => { const n = 18; for (let i = 0; i <= n; i++) { const a = rad(start - 270 * i / n); out.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]); } };
  // Front-left (0,0), front-right (W,0), back-right (W,L), back-left (0,L).
  if (has.s && has.w) { out.push([-ext.w, 0]); relief([0, 0], 180); out.push([0, -ext.s]); }
  else if (has.s) out.push([0, -ext.s]); else if (has.w) out.push([-ext.w, 0], [0, 0]); else out.push([0, 0]);
  if (has.s && has.e) { out.push([W, -ext.s]); relief([W, 0], -90); out.push([W + ext.e, 0]); }
  else if (has.s) out.push([W, -ext.s], [W, 0]); else if (has.e) out.push([W, 0], [W + ext.e, 0]); else out.push([W, 0]);
  if (has.n && has.e) { out.push([W + ext.e, L]); relief([W, L], 0); out.push([W, L + ext.n]); }
  else if (has.e) out.push([W + ext.e, L], [W, L]); else if (has.n) out.push([W, L], [W, L + ext.n]); else out.push([W, L]);
  if (has.n && has.w) { out.push([0, L + ext.n]); relief([0, L], 90); out.push([-ext.w, L]); }
  else if (has.n) out.push([0, L + ext.n], [0, L]); else if (has.w) out.push([0, L], [-ext.w, L]); else out.push([0, L]);
  // A side without a flange runs straight past its corners: drop the corner points that are now collinear.
  const outline = out.filter((q, i) => { const r = out[(i + out.length - 1) % out.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-9; });
  const bends: FlatBend[] = [];
  const add = (a: P2, b: P2, z: [P2, P2, P2, P2]) => bends.push({ a, b, angle: 90, dir: 'up', radius: R, ba, zone: z });
  if (has.s) add([0, -ba / 2], [W, -ba / 2], [[0, 0], [W, 0], [W, -ba], [0, -ba]]);
  if (has.e) add([W + ba / 2, 0], [W + ba / 2, L], [[W, 0], [W, L], [W + ba, L], [W + ba, 0]]);
  if (has.n) add([W, L + ba / 2], [0, L + ba / 2], [[W, L], [0, L], [0, L + ba], [W, L + ba]]);
  if (has.w) add([-ba / 2, L], [-ba / 2, 0], [[0, L], [0, 0], [-ba, 0], [-ba, L]]);
  if (rr * 2 > Math.min(...(['s', 'e', 'n', 'w'] as const).filter(k => has[k]).map(k => ext[k]), Infinity)) warnings.push('The corner reliefs are wider than a flange.');
  const xs = outline.map(q => q[0]), ys = outline.map(q => q[1]);
  return { outline, holes: [], bends, size: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], segments: [W, L], total: Math.max(...xs) - Math.min(...xs), R, K, warnings };
}

// ---------------------------------------------------------------- DXF
export function flatToEntities(f: FlatPattern, t: number): CadEntity2D[] {
  const ents: CadEntity2D[] = [{ type: 'polyline', layer: 'CUT', points: f.outline.map(p => [p[0], p[1], 0]), closed: true }];
  for (const h of f.holes) ents.push({ type: 'circle', layer: 'CUT', c: [h.c[0], h.c[1], 0], r: h.r });
  for (const b of f.bends) {
    ents.push({ type: 'line', layer: 'BEND', a: [b.a[0], b.a[1], 0], b: [b.b[0], b.b[1], 0] });
    const mid: P2 = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2]; const rot = Math.atan2(b.b[1] - b.a[1], b.b[0] - b.a[0]) * 180 / Math.PI;
    ents.push({ type: 'text', layer: 'BEND_NOTES', at: [mid[0], mid[1], 0], height: Math.max(2, t * 1.5), rotation: rot, text: `${b.dir.toUpperCase()} ${b.angle}° R${+b.radius.toFixed(2)}`, align: 'center' });
  }
  return ents;
}
export function flatToDxf(f: FlatPattern, t: number, name = 'flat'): string {
  const m: CadModel = emptyModel(`${name}.dxf`, 'dxf', 'plajah-sheet');
  m.is2D = true; m.units = 'mm'; m.entities = flatToEntities(f, t);
  m.layers = [{ name: 'CUT', color: '#ffffff', visible: true }, { name: 'BEND', color: '#facc15', visible: true, lineType: 'DASHED' }, { name: 'BEND_NOTES', color: '#93c5fd', visible: true }];
  return writeDxf(m);
}

// ---------------------------------------------------------------- checks
export interface SheetChecks { findings: DfmFinding[]; hazards: Hazard[]; force: number[] }
/** Design rules for the part and the brake, and the hazards of bending it. `brakeTons` is the brake's rating. */
export function sheetChecks(p: SheetPart, o: { brakeTons?: number; brakeLength?: number } = {}): SheetChecks {
  const f = flatPattern(p); const m = sheetMaterial(p.material); const t = p.t; const tb = bendTable(p.material, t, { R: p.radius });
  const findings: DfmFinding[] = f.warnings.map(w => ({ level: 'error', title: w, detail: 'Lengthen the flange or use a tighter radius.' }));
  const hazards: Hazard[] = []; const add = (h: Omit<Hazard, 'stage'>) => hazards.push({ stage: 'make', ...h });
  const radii = f.bends.map(b => b.radius); const minR = Math.min(...radii, Infinity);
  if (f.bends.length && minR < m.minRadius * t - 1e-9) findings.push({ level: minR < 0.5 * m.minRadius * t ? 'error' : 'warn', title: `R${minR} is tighter than ${m.name} likes (${(m.minRadius * t).toFixed(2)} mm)`, detail: `${m.note ?? 'The outside of the bend can crack.'} Typical minimum inside radius ${m.minRadius}× t.` });
  else if (f.bends.length) findings.push({ level: 'pass', title: 'Bend radii suit the material', detail: `R${minR} ≥ ${(m.minRadius * t).toFixed(2)} mm.` });
  // Each flange must sit across the V die.
  const os = (i: number) => (p.kind === 'profile' && i >= 0 && i < p.bends.length ? outsideSetback(p.bends[i].angle, radii[i], t) : 0);
  // Outside length of every flange (flat plus the setbacks at its bends).
  const flangeLens = p.kind === 'profile' ? f.segments.map((fl, i) => fl + os(i - 1) + os(i)) : (['s', 'e', 'n', 'w'] as const).map(k => p.flanges[k]).filter(v => v > 0);
  const short = flangeLens.filter(v => v < tb.minFlange);
  findings.push(short.length ? { level: 'error', title: `${short.length} flange${short.length > 1 ? 's' : ''} shorter than ${tb.minFlange} mm`, detail: `A ${t} mm sheet bends over a ${tb.V} mm V die; a flange needs about 0.7 × V to rest on both shoulders. Lengthen it or use a smaller die (tighter radius, more force).` } : { level: 'pass', title: 'Flanges span the die', detail: `At least ${tb.minFlange} mm on a ${tb.V} mm V die.` });
  // Holes too near a bend stretch into ovals.
  if (p.kind === 'profile') {
    const near = f.holes.filter(h => f.bends.some(b => { const x0 = b.zone[0][0], x1 = b.zone[2][0]; const d = Math.max(x0 - (h.c[0] + h.r), (h.c[0] - h.r) - x1); return d < 2 * t + b.radius; }));
    if (f.holes.length) findings.push(near.length ? { level: 'warn', title: `${near.length} hole${near.length > 1 ? 's' : ''} too close to a bend`, detail: `Keep hole edges at least 2·t + R (${(2 * t + minR).toFixed(1)} mm) from the bend, or they distort.` } : { level: 'pass', title: 'Holes clear of the bends', detail: '' });
  }
  // Force: every bend along its length.
  const force = f.bends.map(b => bendForceKN(m.uts, t, vDie(t), Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1])));
  const maxF = Math.max(0, ...force); const tons = maxF / 9.80665;
  findings.push({ level: 'info', title: `Up to ${tons.toFixed(1)} t of force per bend`, detail: `Air bending on a ${tb.V} mm V die, ${(tb.forcePerM / 9.80665).toFixed(1)} t per metre. Overbend about ${m.springback}° for springback.` });
  if (o.brakeTons && tons > o.brakeTons) add({ id: 'brake-overload', severity: 'critical', block: true, title: `Needs ${tons.toFixed(1)} t; the brake is rated ${o.brakeTons} t`, why: 'Overloading a press brake can crack the dies or frame and throw fragments.', mitigate: ['Use a wider V die (less force, larger radius), a thinner or softer sheet, or a bigger brake.'], cite: 'ANSI B11.3 (press brakes); 29 CFR 1910.212' });
  const longest = Math.max(0, ...f.bends.map(b => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1])));
  if (o.brakeLength && longest > o.brakeLength) findings.push({ level: 'error', title: `A ${longest.toFixed(0)} mm bend is longer than the ${o.brakeLength} mm brake`, detail: 'Split the part or use a longer brake.' });
  add({ id: 'sheet-edges', severity: 'medium', title: 'Sharp edges and burrs', why: 'Sheared, lasered and punched edges cut hands; a burr on the outside of a bend can start a crack.', mitigate: ['Deburr every cut edge before bending; wear cut-resistant gloves for handling (not at the brake).', 'Call out edge breaks on the drawing.'], cite: 'ISO 13715 (edges of undefined shape)' });
  if (f.bends.some(b => b.radius < t) && /6061|stainless|304/i.test(m.name)) add({ id: 'bend-crack', severity: 'high', title: 'Bend may crack and spring apart', why: `${m.name} at R < t can crack through on the outside of the bend; a cracked load-bearing bracket fails without warning.`, mitigate: ['Open the radius to at least the material minimum, or anneal before bending.'], cite: 'Aluminum Association / ASM Handbook vol. 14B (bend radius guidance)' });
  return { findings, hazards: sortHazards(hazards), force };
}

/** Bounding area of a flat pattern's material, mm² (for nesting and cost). */
export const flatArea = (f: FlatPattern) => Math.abs(area(f.outline)) - f.holes.reduce((s, h) => s + Math.PI * h.r * h.r, 0);
