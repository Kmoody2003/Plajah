// Mechanical parts library: parametric generators, our own geometry. Sizes follow published
// standard dimensions (ISO metric fasteners, common ball-bearing series, NEMA 17), which are
// facts, not copied drawings. Everything is in millimetres, Z up, and released as public domain
// (CC0) like the rest of our library content.
// Threads are drawn as plain cylinders (cosmetic), the way most CAD shows them.

import { type CadModel, type CadElement, emptyModel } from '../cad/model';
import { addMesh, finish } from '../cad/mesh';
import { type P2, type Solid, extrude, lathe, helixTube, merge, translate, circlePts, regularPolygon, axesToX } from './geometry';

export type MechParam = { key: string; label: string; kind: 'number' | 'choice'; default: number | string; min?: number; max?: number; choices?: string[]; unit?: string };
export interface MechPart { id: string; name: string; category: 'Fasteners' | 'Bearings' | 'Power transmission' | 'Framing' | 'Brackets & mounts' | 'Springs'; standard?: string; about: string; params: MechParam[]; build: (p: Record<string, number | string>) => Array<{ name: string; solid: Solid; color: string }> }

const num = (p: Record<string, number | string>, k: string) => Number(p[k]);
const SIZES = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'];

// Published dimensions (mm).
const HEX: Record<string, { s: number; k: number; m: number }> = { M3: { s: 5.5, k: 2, m: 2.4 }, M4: { s: 7, k: 2.8, m: 3.2 }, M5: { s: 8, k: 3.5, m: 4.7 }, M6: { s: 10, k: 4, m: 5.2 }, M8: { s: 13, k: 5.3, m: 6.8 }, M10: { s: 16, k: 6.4, m: 8.4 }, M12: { s: 18, k: 7.5, m: 10.8 } };
const WASHER: Record<string, { d1: number; d2: number; h: number }> = { M3: { d1: 3.2, d2: 7, h: 0.5 }, M4: { d1: 4.3, d2: 9, h: 0.8 }, M5: { d1: 5.3, d2: 10, h: 1 }, M6: { d1: 6.4, d2: 12, h: 1.6 }, M8: { d1: 8.4, d2: 16, h: 1.6 }, M10: { d1: 10.5, d2: 20, h: 2 }, M12: { d1: 13, d2: 24, h: 2.5 } };
const SHCS: Record<string, { dk: number; k: number; key: number }> = { M3: { dk: 5.5, k: 3, key: 2.5 }, M4: { dk: 7, k: 4, key: 3 }, M5: { dk: 8.5, k: 5, key: 4 }, M6: { dk: 10, k: 6, key: 5 }, M8: { dk: 13, k: 8, key: 6 }, M10: { dk: 16, k: 10, key: 8 }, M12: { dk: 18, k: 12, key: 10 } };
const BEARINGS: Record<string, { d: number; D: number; B: number }> = { '625': { d: 5, D: 16, B: 5 }, '608': { d: 8, D: 22, B: 7 }, '6000': { d: 10, D: 26, B: 8 }, '6001': { d: 12, D: 28, B: 8 }, '6200': { d: 10, D: 30, B: 9 }, '6201': { d: 12, D: 32, B: 10 }, '6202': { d: 15, D: 35, B: 11 } };
const dia = (size: string) => Number(size.slice(1));

const STEEL = '#b9bec7', ZINC = '#d6dbe0', ALU = '#c9ced6', BLACK = '#3a3d44', BRASS = '#c9a24a';

/** Involute spur gear outline (module m, z teeth, pressure angle alpha), counter-clockwise. */
export function spurGearOutline(m: number, z: number, alphaDeg = 20, clearance = 0.25, samples = 8): P2[] {
  const alpha = alphaDeg * Math.PI / 180; const rp = m * z / 2, rb = rp * Math.cos(alpha), ra = rp + m, rf = Math.max(rp - (1 + clearance) * m, 0.5 * rb);
  const inv = (a: number) => Math.tan(a) - a; const pitchHalf = Math.PI / (2 * z); // half tooth thickness angle at the pitch circle
  const out: P2[] = [];
  for (let k = 0; k < z; k++) {
    const c = k / z * Math.PI * 2;
    const flank = (sign: number) => {
      const pts: P2[] = []; const r0 = Math.max(rb, rf);
      for (let i = 0; i <= samples; i++) {
        const r = r0 + (ra - r0) * i / samples; const ar = Math.acos(Math.min(1, rb / r));
        const th = pitchHalf + inv(alpha) - inv(ar); // half-angle of the tooth at radius r
        pts.push([r * Math.cos(c + sign * th), r * Math.sin(c + sign * th)]);
      }
      return pts;
    };
    const right = flank(-1), left = flank(1).reverse();
    // Root arc to this tooth, then up the right flank, across the tip, down the left flank.
    const rootA = c - pitchHalf - inv(alpha) - (Math.PI / z - 2 * pitchHalf) / 2 - 0.5 * (Math.PI / z);
    out.push([rf * Math.cos(rootA + 0.25 * Math.PI / z), rf * Math.sin(rootA + 0.25 * Math.PI / z)]);
    if (rb > rf) out.push([rf * Math.cos(c - pitchHalf - inv(alpha) - 0.02), rf * Math.sin(c - pitchHalf - inv(alpha) - 0.02)]);
    out.push(...right, ...left);
    if (rb > rf) out.push([rf * Math.cos(c + pitchHalf + inv(alpha) + 0.02), rf * Math.sin(c + pitchHalf + inv(alpha) + 0.02)]);
  }
  return out;
}

export const MECH_PARTS: MechPart[] = [
  { id: 'hex-bolt', name: 'Hex bolt', category: 'Fasteners', standard: 'ISO 4014 / 4017 dimensions', about: 'Hex head bolt; thread shown as a plain shank.',
    params: [{ key: 'size', label: 'Size', kind: 'choice', default: 'M6', choices: SIZES }, { key: 'length', label: 'Length', kind: 'number', default: 30, min: 4, max: 300, unit: 'mm' }],
    build: p => { const sz = String(p.size); const { s, k } = HEX[sz]; const d = dia(sz); const L = num(p, 'length');
      return [{ name: `Hex bolt ${sz}x${L}`, color: ZINC, solid: merge(extrude(regularPolygon(s / Math.sqrt(3), 6, Math.PI / 6), [], L, L + k), lathe([[0, 0], [d / 2 - 0.15 * d, 0], [d / 2, 0.15 * d], [d / 2, L + k / 2], [0, L + k / 2]], 40)) }]; } },
  { id: 'socket-screw', name: 'Socket head cap screw', category: 'Fasteners', standard: 'ISO 4762 dimensions', about: 'Cylindrical head with a hex key socket.',
    params: [{ key: 'size', label: 'Size', kind: 'choice', default: 'M5', choices: SIZES }, { key: 'length', label: 'Length', kind: 'number', default: 20, min: 4, max: 300, unit: 'mm' }],
    build: p => { const sz = String(p.size); const { dk, k, key } = SHCS[sz]; const d = dia(sz); const L = num(p, 'length');
      return [{ name: `SHCS ${sz}x${L}`, color: BLACK, solid: merge(extrude(circlePts(dk / 2, 48), [regularPolygon(key / Math.sqrt(3), 6)], L, L + k), lathe([[0, 0], [d / 2 - 0.15 * d, 0], [d / 2, 0.15 * d], [d / 2, L + 0.1], [0, L + 0.1]], 40)) }]; } },
  { id: 'hex-nut', name: 'Hex nut', category: 'Fasteners', standard: 'ISO 4032 dimensions', about: 'Regular hex nut.',
    params: [{ key: 'size', label: 'Size', kind: 'choice', default: 'M6', choices: SIZES }],
    build: p => { const sz = String(p.size); const { s, m } = HEX[sz]; const d = dia(sz);
      return [{ name: `Hex nut ${sz}`, color: ZINC, solid: extrude(regularPolygon(s / Math.sqrt(3), 6, Math.PI / 6), [circlePts(d / 2, 40)], 0, m) }]; } },
  { id: 'washer', name: 'Flat washer', category: 'Fasteners', standard: 'ISO 7089 dimensions', about: 'Plain washer.',
    params: [{ key: 'size', label: 'Size', kind: 'choice', default: 'M6', choices: SIZES }],
    build: p => { const sz = String(p.size); const { d1, d2, h } = WASHER[sz];
      return [{ name: `Washer ${sz}`, color: ZINC, solid: lathe([[d1 / 2, 0], [d2 / 2, 0], [d2 / 2, h], [d1 / 2, h]], 64) }]; } },
  { id: 'ball-bearing', name: 'Deep-groove ball bearing', category: 'Bearings', standard: 'Common 6xx / 60xx / 62xx sizes', about: 'Inner and outer rings with a visible ball set.',
    params: [{ key: 'series', label: 'Bearing', kind: 'choice', default: '608', choices: Object.keys(BEARINGS) }],
    build: p => { const { d, D, B } = BEARINGS[String(p.series)]; const t = (D - d) / 2; const ri = d / 2 + t * 0.32, ro = D / 2 - t * 0.32;
      const inner = lathe([[d / 2, 0], [ri, 0], [ri, B], [d / 2, B]], 64), outer = lathe([[ro, 0], [D / 2, 0], [D / 2, B], [ro, B]], 64);
      const br = (ro - ri) / 2 * 0.9, pc = (ro + ri) / 2; const n = Math.max(6, Math.floor(Math.PI * 2 * pc / (2.2 * br)));
      const ball = lathe(Array.from({ length: 17 }, (_, i) => { const a = -Math.PI / 2 + i / 16 * Math.PI; return [i === 0 || i === 16 ? 0 : br * Math.cos(a), br * Math.sin(a)] as P2; }), 16);
      const balls = merge(...Array.from({ length: n }, (_, i) => translate(ball, pc * Math.cos(i / n * Math.PI * 2), pc * Math.sin(i / n * Math.PI * 2), B / 2)));
      return [{ name: 'Inner ring', solid: inner, color: STEEL }, { name: 'Outer ring', solid: outer, color: STEEL }, { name: 'Balls', solid: balls, color: '#e6e9ee' }]; } },
  { id: 'spur-gear', name: 'Spur gear (involute)', category: 'Power transmission', standard: 'Involute profile, 20° pressure angle', about: 'True involute teeth from module and tooth count; pitch diameter = module x teeth.',
    params: [{ key: 'module', label: 'Module', kind: 'number', default: 1, min: 0.3, max: 10, unit: 'mm' }, { key: 'teeth', label: 'Teeth', kind: 'number', default: 24, min: 8, max: 200 }, { key: 'width', label: 'Face width', kind: 'number', default: 6, min: 1, max: 200, unit: 'mm' }, { key: 'bore', label: 'Bore', kind: 'number', default: 5, min: 0, max: 200, unit: 'mm' }, { key: 'pressure', label: 'Pressure angle', kind: 'choice', default: '20', choices: ['14.5', '20', '25'] }],
    build: p => { const m = num(p, 'module'), z = Math.round(num(p, 'teeth')), w = num(p, 'width'), bore = num(p, 'bore');
      const outline = spurGearOutline(m, z, Number(p.pressure)); const holes = bore > 0 && bore < m * (z - 2.5) ? [circlePts(bore / 2, 40)] : [];
      return [{ name: `Spur gear m${m} z${z}`, color: BRASS, solid: extrude(outline, holes, 0, w) }]; } },
  { id: 'extrusion-2020', name: 'T-slot extrusion, 20 series', category: 'Framing', standard: '20 x 20 mm, 6 mm slot (generic profile)', about: 'Aluminium framing profile with four T-slots and a centre bore.',
    params: [{ key: 'length', label: 'Length', kind: 'number', default: 200, min: 10, max: 3000, unit: 'mm' }, { key: 'size', label: 'Profile', kind: 'choice', default: '2020', choices: ['2020', '3030', '4040'] }],
    build: p => { const S = Number(String(p.size).slice(0, 2)); const L = num(p, 'length'); const h = S / 2, slot = S * 0.31, depth = S * 0.3, lip = S * 0.09;
      // One quarter-turned edge pattern repeated on four sides: lips around a slot opening.
      const side = (rot: number): P2[] => { const pts: P2[] = [[-h, -h], [-slot / 2, -h], [-slot / 2, -h + lip], [-slot / 2 - S * 0.08, -h + lip], [-slot * 0.35, -h + depth], [slot * 0.35, -h + depth], [slot / 2 + S * 0.08, -h + lip], [slot / 2, -h + lip], [slot / 2, -h]]; const c = Math.cos(rot), s = Math.sin(rot); return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]); };
      const outline = [...side(0), ...side(Math.PI / 2), ...side(Math.PI), ...side(Math.PI * 1.5)];
      return [{ name: `Extrusion ${p.size} x ${L}`, color: ALU, solid: extrude(outline, [circlePts(S * 0.21 / 2 + 0.5, 32)], 0, L) }]; } },
  { id: 'nema17-plate', name: 'NEMA 17 motor plate', category: 'Brackets & mounts', standard: 'NEMA 17 pattern: 31 mm M3 holes, 22 mm pilot', about: 'Flat mounting plate for a NEMA 17 stepper.',
    params: [{ key: 'thickness', label: 'Thickness', kind: 'number', default: 4, min: 1, max: 20, unit: 'mm' }, { key: 'margin', label: 'Extra width', kind: 'number', default: 8, min: 0, max: 60, unit: 'mm' }],
    build: p => { const t = num(p, 'thickness'), w = 42.3 + num(p, 'margin') * 2; const h = w / 2;
      const holes = [circlePts(11.2, 48), ...[[15.5, 15.5], [-15.5, 15.5], [-15.5, -15.5], [15.5, -15.5]].map(([x, y]) => circlePts(1.7, 20, x, y))];
      return [{ name: 'NEMA 17 plate', color: ALU, solid: extrude([[-h, -h], [h, -h], [h, h], [-h, h]], holes, 0, t) }]; } },
  { id: 'l-bracket', name: 'L-bracket', category: 'Brackets & mounts', about: 'Right-angle bracket with a hole in each leg.',
    params: [{ key: 'leg', label: 'Leg length', kind: 'number', default: 30, min: 8, max: 300, unit: 'mm' }, { key: 'width', label: 'Width', kind: 'number', default: 20, min: 5, max: 300, unit: 'mm' }, { key: 'thickness', label: 'Thickness', kind: 'number', default: 3, min: 1, max: 30, unit: 'mm' }, { key: 'hole', label: 'Hole diameter', kind: 'number', default: 5.5, min: 0, max: 50, unit: 'mm' }],
    build: p => { const l = num(p, 'leg'), w = num(p, 'width'), t = num(p, 'thickness'), hd = num(p, 'hole');
      const hole = (cx: number) => hd > 0 && hd < Math.min(w, l - t) * 0.8 ? [circlePts(hd / 2, 28, cx, w / 2)] : [];
      const base = extrude([[0, 0], [l, 0], [l, w], [0, w]], hole(t + (l - t) / 2), 0, t);
      // Upright leg: drawn in (y, z) and extruded along x through the thickness; it starts inside the base so the two overlap rather than touch.
      const uHole = hd > 0 && hd < Math.min(w, l - t) * 0.8 ? [circlePts(hd / 2, 28, w / 2, t + (l - t) / 2)] : [];
      const upright = axesToX(extrude([[0, t / 2], [w, t / 2], [w, l], [0, l]], uHole, 0, t));
      return [{ name: 'L-bracket', color: ALU, solid: merge(base, upright) }]; } },
  { id: 'spacer', name: 'Round spacer / standoff', category: 'Brackets & mounts', about: 'Tube spacer.',
    params: [{ key: 'od', label: 'Outer diameter', kind: 'number', default: 8, min: 2, max: 200, unit: 'mm' }, { key: 'id', label: 'Inner diameter', kind: 'number', default: 3.2, min: 0.5, max: 190, unit: 'mm' }, { key: 'length', label: 'Length', kind: 'number', default: 10, min: 0.5, max: 500, unit: 'mm' }],
    build: p => { const od = num(p, 'od'), idd = Math.min(num(p, 'id'), od - 0.4), L = num(p, 'length'); return [{ name: `Spacer ${od}x${idd}x${L}`, color: BRASS, solid: lathe([[idd / 2, 0], [od / 2, 0], [od / 2, L], [idd / 2, L]], 48) }]; } },
  { id: 'compression-spring', name: 'Compression spring', category: 'Springs', about: 'Helical spring from wire and coil diameters.',
    params: [{ key: 'od', label: 'Outer diameter', kind: 'number', default: 12, min: 2, max: 200, unit: 'mm' }, { key: 'wire', label: 'Wire diameter', kind: 'number', default: 1.2, min: 0.2, max: 20, unit: 'mm' }, { key: 'length', label: 'Free length', kind: 'number', default: 30, min: 3, max: 1000, unit: 'mm' }, { key: 'coils', label: 'Active coils', kind: 'number', default: 8, min: 1, max: 200 }],
    build: p => { const od = num(p, 'od'), wd = num(p, 'wire'), L = num(p, 'length'), n = Math.max(1, num(p, 'coils')); const R = (od - wd) / 2; const pitch = Math.max(wd * 1.05, (L - wd) / n);
      return [{ name: `Spring ${od}x${wd}x${L}`, color: STEEL, solid: translate(helixTube(R, wd / 2, pitch, n), 0, 0, wd / 2) }]; } },
];

export const mechById = (id: string) => MECH_PARTS.find(p => p.id === id);
export const mechDefaults = (part: MechPart) => Object.fromEntries(part.params.map(p => [p.key, p.default])) as Record<string, number | string>;

/** A part as a 3D CadModel (mm, Z up), ready for the 3D view, STL export and Tela. */
export function mechModel(part: MechPart, params: Record<string, number | string>): CadModel {
  const p = { ...mechDefaults(part), ...params };
  const m = emptyModel(`${part.name}.stl`, 'stl', 'plajah-mech'); m.units = 'mm'; m.meta.upAxis = 'Z'; if (part.standard) m.meta.standard = part.standard;
  const el: CadElement = { id: 'part', cls: 'Part', name: part.name, meshIds: [], props: { Parameters: Object.fromEntries(part.params.map(d => [d.label, `${p[d.key]}${d.unit ? ' ' + d.unit : ''}`])), ...(part.standard ? { Standard: { Dimensions: part.standard } } : {}) } };
  m.elements.push(el);
  for (const b of part.build(p)) { const mesh = addMesh(m, { name: b.name, positions: new Float32Array(b.solid.positions), indices: new Uint32Array(b.solid.indices), color: b.color, elementId: el.id }); el.meshIds.push(mesh.id); }
  return finish(m);
}
