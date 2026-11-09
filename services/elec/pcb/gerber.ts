// Fabrication and assembly outputs in the formats board houses take: Gerber RS-274X (with X2 file
// and aperture attributes), Excellon drill (plated and non-plated), pick-and-place (CPL) and BOM
// CSVs in the JLCPCB column layout, zipped with fflate. File names follow the KiCad convention that
// JLCPCB, PCBWay, OSH Park and Aisler all recognise (…-F_Cu.gtl, …-Edge_Cuts.gm1, …-PTH.drl).

import { zipSync, strToU8 } from 'fflate';
import { silkscreen, SILK_W } from './silk';
import type { Board, Layer, Pad } from './types';
import { toKicadPcb } from './kicad';

const MASK_EXP = 0.05;
const n6 = (v: number) => String(Math.round(v * 1e6));
const slug = (s: string) => (s || 'board').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'board';

class Gerber {
  private lines: string[] = []; private aps = new Map<string, number>(); private body: string[] = []; private cur = -1; private next = 10;
  constructor(private func: string, private H: number) {}
  private ap(def: string, fn: string): number {
    const k = `${fn}|${def}`; let d = this.aps.get(k); if (d === undefined) { d = this.next++; this.aps.set(k, d); } return d;
  }
  private use(d: number) { if (d !== this.cur) { this.body.push(`D${d}*`); this.cur = d; } }
  private xy(x: number, y: number) { return `X${n6(x)}Y${n6(this.H - y)}`; }
  flash(x: number, y: number, shape: 'circle' | 'rect', w: number, h: number, fn: string) { this.use(this.ap(shape === 'circle' ? `C,${w.toFixed(6)}` : `R,${w.toFixed(6)}X${h.toFixed(6)}`, fn)); this.body.push(`${this.xy(x, y)}D03*`); }
  line(ax: number, ay: number, bx: number, by: number, w: number, fn: string) { this.use(this.ap(`C,${w.toFixed(6)}`, fn)); this.body.push(`${this.xy(ax, ay)}D02*`, `${this.xy(bx, by)}D01*`); }
  text(): string {
    const head = ['G04 Plajah Build PCB export*', '%TF.GenerationSoftware,Plajah,Build,1.0*%', `%TF.FileFunction,${this.func}*%`, '%TF.Part,Single*%', '%FSLAX46Y46*%', '%MOMM*%', '%LPD*%', 'G01*'];
    const defs: string[] = []; for (const [k, d] of this.aps) { const [fn, def] = k.split('|'); if (fn) defs.push(`%TA.AperFunction,${fn}*%`, `%ADD${d}${def}*%`, '%TD*%'); else defs.push(`%ADD${d}${def}*%`); }
    return [...head, ...defs, ...this.body, 'M02*', ''].join('\n');
  }
}

const padFn = (p: Pad) => (p.drill ? 'ComponentPad' : 'SMDPad,CuDef');
function copperLayer(b: Board, layer: Layer): string {
  const g = new Gerber(layer === 'top' ? 'Copper,L1,Top' : 'Copper,L2,Bot', b.H);
  for (const t of b.tracks) if (t.layer === layer) g.line(t.a[0], t.a[1], t.b[0], t.b[1], t.w, 'Conductor');
  for (const p of b.pads) if (p.layers.includes(layer)) g.flash(p.x, p.y, p.shape, p.w, p.h, padFn(p));
  for (const v of b.vias) g.flash(v.x, v.y, 'circle', v.d, v.d, 'ViaPad');
  return g.text();
}
function maskLayer(b: Board, layer: Layer): string {
  const g = new Gerber(layer === 'top' ? 'Soldermask,Top' : 'Soldermask,Bot', b.H);
  for (const p of b.pads) if (p.layers.includes(layer)) g.flash(p.x, p.y, p.shape, p.w + 2 * MASK_EXP, p.h + 2 * MASK_EXP, '');
  return g.text(); // vias are tented (covered by mask)
}
function pasteLayer(b: Board): string {
  const g = new Gerber('Paste,Top', b.H); for (const p of b.pads) if (!p.drill && p.layers.includes('top')) g.flash(p.x, p.y, p.shape, p.w, p.h, ''); return g.text();
}
function silkLayer(b: Board): string {
  const g = new Gerber('Legend,Top', b.H); for (const s of silkscreen(b)) g.line(s[0], s[1], s[2], s[3], SILK_W, ''); return g.text();
}
function edgeLayer(b: Board): string {
  const g = new Gerber('Profile,NP', b.H); const c: Array<[number, number]> = [[0, 0], [b.W, 0], [b.W, b.H], [0, b.H], [0, 0]];
  for (let i = 0; i + 1 < c.length; i++) g.line(c[i][0], c[i][1], c[i + 1][0], c[i + 1][1], 0.1, 'Profile'); return g.text();
}

/** Excellon drill file (metric, decimal coordinates, y up). */
export function excellon(b: Board, plated: boolean): string {
  const holes = plated ? [...b.pads.filter(p => p.drill).map(p => ({ x: p.x, y: p.y, d: p.drill! })), ...b.vias.map(v => ({ x: v.x, y: v.y, d: v.drill }))] : b.holes.map(h => ({ x: h.x, y: h.y, d: h.d }));
  const sizes = [...new Set(holes.map(h => h.d.toFixed(3)))].sort((a, c) => +a - +c);
  const out = ['M48', `; Plajah Build ${plated ? 'plated' : 'non-plated'} holes`, `; #@! TF.FileFunction,${plated ? 'Plated,1,2,PTH' : 'NonPlated,1,2,NPTH'}`, 'FMAT,2', 'METRIC', ...sizes.map((s, i) => `T${i + 1}C${s}`), '%', 'G90', 'G05'];
  sizes.forEach((s, i) => { out.push(`T${i + 1}`); for (const h of holes) if (h.d.toFixed(3) === s) out.push(`X${h.x.toFixed(3)}Y${(b.H - h.y).toFixed(3)}`); });
  out.push('T0', 'M30', ''); return out.join('\n');
}

const csv = (rows: Array<Array<string | number>>) => rows.map(r => r.map(v => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n') + '\n';

/** Pick-and-place (JLCPCB CPL columns). Rotation counter-clockwise in degrees, origin bottom-left. */
export function placementCsv(b: Board): string {
  return csv([['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'], ...b.parts.map(p => [p.ref, `${p.x.toFixed(3)}mm`, `${(b.H - p.y).toFixed(3)}mm`, 'Top', (360 - p.rot * 90) % 360])]);
}
/** Bill of materials grouped by value and footprint (JLCPCB BOM columns; add LCSC numbers for assembly). */
export function bomCsv(b: Board): string {
  const groups = new Map<string, { value: string; fp: string; refs: string[] }>();
  for (const p of b.parts) { const k = `${p.value}|${p.fp.id}`; const g = groups.get(k) ?? { value: p.value, fp: p.fp.id, refs: [] }; g.refs.push(p.ref); groups.set(k, g); }
  const sort = (a: string, c: string) => a.localeCompare(c, undefined, { numeric: true });
  return csv([['Comment', 'Designator', 'Footprint', 'Quantity', 'LCSC Part #'], ...[...groups.values()].sort((a, c) => sort(a.refs[0], c.refs[0])).map(g => [g.value, g.refs.sort(sort).join(','), g.fp, g.refs.length, ''])]);
}

/** Every Gerber and drill file by name. */
export function gerberFiles(b: Board): Record<string, string> {
  const s = slug(b.name); const f: Record<string, string> = {
    [`${s}-F_Cu.gtl`]: copperLayer(b, 'top'), [`${s}-B_Cu.gbl`]: copperLayer(b, 'bottom'),
    [`${s}-F_Mask.gts`]: maskLayer(b, 'top'), [`${s}-B_Mask.gbs`]: maskLayer(b, 'bottom'),
    [`${s}-F_Silkscreen.gto`]: silkLayer(b), [`${s}-Edge_Cuts.gm1`]: edgeLayer(b),
    [`${s}-PTH.drl`]: excellon(b, true),
  };
  if (b.pads.some(p => !p.drill)) f[`${s}-F_Paste.gtp`] = pasteLayer(b);
  if (b.holes.length) f[`${s}-NPTH.drl`] = excellon(b, false);
  return f;
}

/** The zip a board house wants: Gerbers + drills only. */
export function gerberZip(b: Board): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(gerberFiles(b)).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
}
/** Everything: fab zip contents, assembly CSVs, a KiCad board and a read-me. */
export function packageZip(b: Board, readme: string): Uint8Array {
  const s = slug(b.name); const files: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(gerberFiles(b))) files[`gerbers/${k}`] = strToU8(v);
  files[`assembly/${s}-bom.csv`] = strToU8(bomCsv(b)); files[`assembly/${s}-cpl.csv`] = strToU8(placementCsv(b));
  files[`${s}.kicad_pcb`] = strToU8(toKicadPcb(b)); files['README.txt'] = strToU8(readme);
  return zipSync(files, { level: 6 });
}
export const boardSlug = (b: Board) => slug(b.name);
