// AAMA / ASTM D6673 pattern exchange: DXF (R12, one BLOCK per piece) and its companion RUL grade
// rule file. Our own writer and reader from the published layer conventions:
//   1 boundary (cut line) · 2 turn (grade) points · 3 curve points · 4 notches · 6 mirror line
//   7 grain line · 8 internal lines · 14 sew line · 15 annotation text
// Piece data rides in TEXT on layer 1 ("Piece Name:", "Size:", "Quantity:", "Material:") and grade
// rule numbers as "# n" text at their boundary points. Fields only we use (per-edge allowance,
// fold, pairs) go on layer 15 as "Plajah ..." text, which other systems ignore. The reader also
// takes multi-size files (one block per piece per size) and derives rules from them.

import { type Pt, dist } from '../geometry';
import type { Pattern, Piece, FabricRole } from '../patterns';
import { type GradedPattern, type GradeTable, type GradePoint, type GradeRule, gradePattern, corners } from './grading';

const f3 = (x: number) => (Math.round(x * 1000) / 1000).toFixed(3);

/** Cut line with exactly one point per seam vertex (mitre, or the bevel midpoint). */
export function cutRing(p: Piece): Pt[] {
  const s = p.seam, n = s.length; const al = typeof p.allowance === 'number' ? s.map(() => p.allowance as number) : [...p.allowance]; if (p.fold != null) al[p.fold] = 0;
  const nrm = (i: number): Pt => { const a = s[(i + n) % n], b = s[(i + 1) % n]; const L = dist(a, b) || 1e-9; return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; };
  return s.map((v, i) => {
    const n0 = nrm(i - 1), n1 = nrm(i), d0 = al[(i - 1 + n) % n], d1 = al[i]; const a0: Pt = [v[0] + n0[0] * d0, v[1] + n0[1] * d0], a1: Pt = [v[0] + n1[0] * d1, v[1] + n1[1] * d1];
    const t0: Pt = [-n0[1], n0[0]], t1: Pt = [-n1[1], n1[0]]; const den = t0[0] * t1[1] - t0[1] * t1[0];
    if (Math.abs(den) < 1e-6) return [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2] as Pt;
    const k = ((a1[0] - a0[0]) * t1[1] - (a1[1] - a0[1]) * t1[0]) / den; const m: Pt = [a0[0] + t0[0] * k, a0[1] + t0[1] * k];
    return dist(m, v) > 3 * Math.max(d0, d1, 1) ? [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2] as Pt : m;
  });
}

/** A seam-line notch carried straight out to the cut line along its edge's normal. */
function notchOnCut(p: Piece, q: Pt): Pt {
  const s = p.seam, n = s.length; const al = typeof p.allowance === 'number' ? s.map(() => p.allowance as number) : p.allowance; let best = 0, bd = Infinity, bp: Pt = q;
  for (let i = 0; i < n; i++) { const a = s[i], b = s[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1e-12))); const c: Pt = [a[0] + dx * t, a[1] + dy * t]; const d = dist(c, q); if (d < bd) { bd = d; best = i; bp = c; } }
  const a = s[best], b = s[(best + 1) % n]; const L = dist(a, b) || 1; const d = best === p.fold ? 0 : (al[best] ?? 0); return [bp[0] + (b[1] - a[1]) / L * d, bp[1] - (b[0] - a[0]) / L * d];
}

export interface AamaOptions { style?: string; author?: string; allSizes?: boolean; date?: Date }

export function writeAama(g: GradedPattern, o: AamaOptions = {}): { dxf: string; rul: string } {
  const L: string[] = []; const w = (code: number, v: string | number) => L.push(String(code), typeof v === 'number' ? f3(v) : v);
  const text = (layer: string, at: Pt, s: string, h = 4) => { w(0, 'TEXT'); w(8, layer); w(10, at[0]); w(20, at[1]); w(30, 0); w(40, h); w(1, s); };
  const poly = (layer: string, pts: Pt[], closed = true) => { w(0, 'POLYLINE'); w(8, layer); w(66, '1'); w(70, closed ? '1' : '0'); for (const q of pts) { w(0, 'VERTEX'); w(8, layer); w(10, q[0]); w(20, q[1]); w(30, 0); } w(0, 'SEQEND'); w(8, layer); };
  const line = (layer: string, a: Pt, b: Pt) => { w(0, 'LINE'); w(8, layer); w(10, a[0]); w(20, a[1]); w(30, 0); w(11, b[0]); w(21, b[1]); w(31, 0); };
  const point = (layer: string, a: Pt) => { w(0, 'POINT'); w(8, layer); w(10, a[0]); w(20, a[1]); w(30, 0); };
  const sizes = o.allSizes ? g.table.sizes : [g.table.base]; const blocks: Array<{ name: string; w: number; h: number }> = [];
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSUNITS'); w(70, '4'); w(9, '$MEASUREMENT'); w(70, '1'); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, '9');
  for (const [ln, c] of [['1', 7], ['2', 3], ['3', 4], ['4', 1], ['6', 5], ['7', 2], ['8', 6], ['14', 8], ['15', 9]] as Array<[string, number]>) { w(0, 'LAYER'); w(2, ln); w(70, '0'); w(62, String(c)); w(6, 'CONTINUOUS'); }
  w(0, 'ENDTAB'); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'BLOCKS');
  for (const size of sizes) {
    const pat = size === g.table.base ? g.pattern : gradePattern(g, size);
    for (const p of pat.pieces) {
      const name = `${p.name.replace(/[^A-Za-z0-9 _-]/g, '').trim() || p.id}${o.allSizes ? `-${size}` : ''}`.replace(/\s+/g, '_');
      const cut = cutRing(p); const xs = cut.map(q => q[0]), ys = cut.map(q => q[1]); blocks.push({ name, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
      w(0, 'BLOCK'); w(8, '1'); w(2, name); w(70, '0'); w(10, 0); w(20, 0); w(30, 0); w(3, name);
      poly('1', cut);
      const gps = size === g.table.base ? (g.points[p.id] ?? []) : (g.points[p.id] ?? []);
      for (const gp of gps) { point('2', cut[gp.index]); text('1', cut[gp.index], `# ${gp.rule}`, 2); }
      for (const i of corners(p.seam)) if (!gps.some(x => x.index === i)) point('2', cut[i]);
      poly('14', p.seam);
      line('7', p.grain[0], p.grain[1]);
      if (p.fold != null) line('6', p.seam[p.fold], p.seam[(p.fold + 1) % p.seam.length]);
      for (const nq of p.notches ?? []) point('4', notchOnCut(p, nq));
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      text('1', [cx, cy], `Piece Name: ${p.name}`); text('1', [cx, cy - 8], `Size: ${size}`); text('1', [cx, cy - 16], `Quantity: ${p.cut}`); text('1', [cx, cy - 24], `Material: ${p.fabric}`);
      text('15', [cx, cy - 32], `Plajah Id: ${p.id}`, 2);
      text('15', [cx, cy - 36], `Plajah Allowance: ${typeof p.allowance === 'number' ? f3(p.allowance) : p.allowance.map(f3).join(',')}`, 2);
      if (p.fold != null) text('15', [cx, cy - 40], `Plajah Fold: ${p.fold}`, 2);
      if (p.pair) text('15', [cx, cy - 44], 'Plajah Pair: 1', 2);
      if (p.note) text('15', [cx, cy - 48], `Plajah Note: ${p.note.replace(/[\r\n]+/g, ' ')}`, 2);
      w(0, 'ENDBLK'); w(8, '1');
    }
  }
  w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'ENTITIES');
  const date = o.date ?? new Date(); const top = 40;
  text('1', [0, top + 50], `Style Name: ${o.style ?? g.pattern.name}`); text('1', [0, top + 42], `Creation Date: ${date.toISOString().slice(0, 10)}`); text('1', [0, top + 34], `Author: ${o.author ?? 'Plajah Build'}`);
  text('1', [0, top + 26], `Sample Size: ${g.table.base}`); text('1', [0, top + 18], `Grading Rule Table: ${g.table.name}`); text('1', [0, top + 10], 'Units: METRIC');
  text('15', [0, top + 2], `Plajah Pattern: ${g.pattern.template}|${g.pattern.kind}|${g.pattern.fabricWidth}`, 2);
  let x = 0; for (const b of blocks) { w(0, 'INSERT'); w(8, '1'); w(2, b.name); w(10, x); w(20, 0); w(30, 0); x += b.w + 80; }
  w(0, 'ENDSEC'); w(0, 'EOF');
  return { dxf: L.join('\r\n') + '\r\n', rul: writeRul(g.table, date) };
}

/** ASTM D6673 companion grade rule file: incremental ("DELTA") rules, one size break per line. */
export function writeRul(t: GradeTable, date = new Date()): string {
  const out = ['ASTM/D13Proposal 1 Version: D 6673-04', `CREATION DATE: ${date.toISOString().slice(0, 10)}`, `CREATION TIME: ${date.toISOString().slice(11, 16)}`, 'AUTHOR: Plajah Build', 'PRODUCT TYPE: APPAREL', 'UNITS: METRIC', `GRADE RULE TABLE: ${t.name}`, `NUMBER OF SIZES: ${t.sizes.length}`, `SIZE LIST: ${t.sizes.join(' ')}`, `SAMPLE SIZE: ${t.base}`];
  for (const r of t.rules) { out.push(`RULE: DELTA ${r.id}`); for (const d of r.deltas) out.push(`${f3(d[0]).padStart(10)},${f3(d[1]).padStart(10)}`); }
  out.push('END'); return out.join('\r\n') + '\r\n';
}

export function readRul(text: string): GradeTable {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean); const t: GradeTable = { name: 'Grade rules', sizes: [], base: '', units: 'mm', rules: [] };
  let cur: GradeRule | null = null; let scale = 1;
  for (const l of lines) {
    const kv = l.match(/^([A-Z ]+):\s*(.*)$/);
    if (kv && !/^RULE/.test(kv[1])) { const k = kv[1].trim(), v = kv[2].trim(); if (k === 'GRADE RULE TABLE') t.name = v; else if (k === 'SIZE LIST') t.sizes = v.split(/\s+/); else if (k === 'SAMPLE SIZE') t.base = v; else if (k === 'UNITS') scale = /ENGLISH|INCH/i.test(v) ? 25.4 : 1; continue; }
    const rm = l.match(/^RULE:\s*DELTA\s+(\d+)/i); if (rm) { cur = { id: Number(rm[1]), deltas: [] }; t.rules.push(cur); continue; }
    if (/^END$/i.test(l)) break;
    const nums = l.split(/[\s,]+/).filter(Boolean).map(Number); if (cur && nums.length >= 2 && nums.every(Number.isFinite)) for (let i = 0; i + 1 < nums.length; i += 2) cur.deltas.push([nums[i] * scale, nums[i + 1] * scale]);
  }
  if (!t.base) t.base = t.sizes[0] ?? 'BASE'; return t;
}

type Ent = { type: string; layer: string; pts: Pt[]; text?: string; closed?: boolean; block?: string };
/** Minimal R12/R2000 group-code reader for pattern DXFs (blocks, polylines, lines, points, text). */
function entities(dxf: string): { blocks: Map<string, Ent[]>; top: Ent[]; units: number } {
  const raw = dxf.split(/\r?\n/); const pairs: Array<[number, string]> = []; for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([parseInt(raw[i].trim(), 10), raw[i + 1].trim()]);
  const blocks = new Map<string, Ent[]>(); const top: Ent[] = []; let section = ''; let block: string | null = null; let units = 1; let cur: Ent | null = null; let poly: Ent | null = null; let vx: Pt | null = null;
  const flush = () => { if (cur && cur.type !== 'VERTEX' && cur.type !== 'SEQEND' && cur.type !== 'POLYLINE') (block ? blocks.get(block)! : top).push(cur); cur = null; };
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 9 && v === '$INSUNITS') { const u = Number(pairs[i + 1]?.[1]); units = u === 1 ? 25.4 : u === 5 ? 10 : u === 6 ? 1000 : 1; }
    if (c === 0) {
      if (vx && poly) { poly.pts.push(vx); vx = null; }
      flush();
      if (v === 'SECTION') { section = pairs[i + 1]?.[1] ?? ''; continue; } if (v === 'ENDSEC') { section = ''; continue; }
      if (section === 'BLOCKS' && v === 'BLOCK') { block = null; cur = { type: 'BLOCK', layer: '', pts: [] }; continue; }
      if (v === 'ENDBLK') { block = null; continue; }
      if (v === 'POLYLINE') { poly = { type: 'POLYLINE', layer: '', pts: [] }; cur = poly; continue; }
      if (v === 'VERTEX') { vx = [0, 0]; cur = { type: 'VERTEX', layer: '', pts: [] }; continue; }
      if (v === 'SEQEND') { if (poly) (block ? blocks.get(block)! : top).push(poly); poly = null; cur = { type: 'SEQEND', layer: '', pts: [] }; continue; }
      cur = { type: v, layer: '', pts: [] }; continue;
    }
    if (!cur) continue;
    if (cur.type === 'BLOCK') { if (c === 2) { block = v; if (!blocks.has(v)) blocks.set(v, []); cur = null; } continue; }
    if (cur.type === 'VERTEX' && vx) { if (c === 10) vx[0] = Number(v); if (c === 20) vx[1] = Number(v); continue; }
    if (c === 8) { cur.layer = v; if (cur === poly) poly.layer = v; continue; }
    if (cur.type === 'POLYLINE' && c === 70) { cur.closed = (Number(v) & 1) === 1; continue; }
    if (cur.type === 'LWPOLYLINE') { if (c === 70) cur.closed = (Number(v) & 1) === 1; if (c === 10) cur.pts.push([Number(v), 0]); if (c === 20 && cur.pts.length) cur.pts[cur.pts.length - 1][1] = Number(v); continue; }
    if (c === 10) cur.pts[0] = [Number(v), cur.pts[0]?.[1] ?? 0]; else if (c === 20) cur.pts[0] = [cur.pts[0]?.[0] ?? 0, Number(v)];
    else if (c === 11) cur.pts[1] = [Number(v), cur.pts[1]?.[1] ?? 0]; else if (c === 21) cur.pts[1] = [cur.pts[1]?.[0] ?? 0, Number(v)];
    else if (c === 1) cur.text = v; else if (c === 2 && cur.type === 'INSERT') cur.block = v;
  }
  flush(); return { blocks, top, units };
}

export interface AamaRead { graded: GradedPattern; warnings: string[]; sizes: string[] }

/** Read an AAMA/ASTM DXF (plus optional RUL) into a graded pattern. */
export function readAama(dxf: string, rul?: string): AamaRead {
  const { blocks, top, units } = entities(dxf); const warnings: string[] = []; const S = (p: Pt): Pt => [p[0] * units, p[1] * units];
  const meta = (ents: Ent[], key: string) => ents.find(e => e.type === 'TEXT' && e.text?.startsWith(key + ':'))?.text!.slice(key.length + 1).trim();
  type Raw = { piece: Piece; size: string; rules: GradePoint[]; name: string };
  const raws: Raw[] = [];
  for (const [bname, ents] of blocks) {
    const polys = ents.filter(e => (e.type === 'POLYLINE' || e.type === 'LWPOLYLINE') && e.pts.length > 2);
    const boundary = polys.find(e => e.layer === '1') ?? polys.sort((a, b) => b.pts.length - a.pts.length)[0]; if (!boundary) continue;
    const sew = polys.find(e => e.layer === '14');
    const cut = boundary.pts.map(S); let seam = sew ? sew.pts.map(S) : cut;
    let flip = false; if (signedArea(seam) < 0) { seam = [...seam].reverse(); flip = true; }
    const cutCcw = flip && sew ? [...cut].reverse() : signedArea(cut) < 0 ? [...cut].reverse() : cut;
    const name = meta(ents, 'Piece Name') ?? bname; const size = meta(ents, 'Size') ?? ''; const qty = Number(meta(ents, 'Quantity') ?? 1) || 1;
    const id = meta(ents, 'Plajah Id') ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const alText = meta(ents, 'Plajah Allowance');
    let allowance: number | number[] = alText ? (alText.includes(',') ? alText.split(',').map(Number) : Number(alText)) : sew ? meanGap(cutCcw, seam) : 0;
    if (Array.isArray(allowance) && allowance.length !== seam.length) allowance = allowance[0] ?? 0;
    const foldT = meta(ents, 'Plajah Fold'); const grainE = ents.find(e => e.type === 'LINE' && e.layer === '7');
    const grain: [Pt, Pt] = grainE && grainE.pts[1] ? [S(grainE.pts[0]), S(grainE.pts[1])] : (() => { const ys = seam.map(q => q[1]); const xs = seam.map(q => q[0]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2; return [[cx, Math.min(...ys) + 20], [cx, Math.max(...ys) - 20]] as [Pt, Pt]; })();
    let fold = foldT != null ? Number(foldT) : undefined;
    const mirror = ents.find(e => e.type === 'LINE' && e.layer === '6'); if (fold == null && mirror?.pts[1]) { const a = S(mirror.pts[0]), b = S(mirror.pts[1]); fold = seam.findIndex((q, i) => dist(q, a) < 0.5 && dist(seam[(i + 1) % seam.length], b) < 0.5); if (fold < 0) fold = undefined; }
    const notches = ents.filter(e => e.type === 'POINT' && e.layer === '4').map(e => nearestOnRing(seam, S(e.pts[0])));
    const nearestCut = (q: Pt) => { let bi = 0, bd = Infinity; cutCcw.forEach((c, i) => { const d = dist(c, q); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const rules: GradePoint[] = [];
    for (const e of ents) { const m = e.type === 'TEXT' && e.text?.match(/^#\s*(\d+)/); if (!m) continue; const ci = nearestCut(S(e.pts[0])); const si = cutCcw.length === seam.length ? ci : nearestIdx(seam, cutCcw[ci]); rules.push({ index: si, rule: Number(m[1]) }); }
    const role = (meta(ents, 'Material') ?? 'main') as FabricRole; const note = meta(ents, 'Plajah Note');
    raws.push({ name, size, rules, piece: { id, name, seam, allowance, cut: qty, pair: meta(ents, 'Plajah Pair') === '1' || undefined, fold, fabric: ['main', 'contrast', 'lining', 'rib', 'fur', 'interfacing'].includes(role) ? role : 'main', grain, notches, ...(note ? { note } : {}) } });
  }
  if (!raws.length) warnings.push('No pattern-piece blocks found in this DXF.');
  const sampleSize = meta(top, 'Sample Size'); const tableName = meta(top, 'Grading Rule Table'); const style = meta(top, 'Style Name') ?? 'Imported pattern';
  const pinfo = meta(top, 'Plajah Pattern')?.split('|');
  const sizes = [...new Set(raws.map(r => r.size).filter(Boolean))];
  let table: GradeTable; const points: Record<string, GradePoint[]> = {};
  let baseSize = sampleSize ?? sizes[0] ?? 'BASE';
  if (rul) { table = readRul(rul); baseSize = table.base || baseSize; }
  else table = { name: tableName ?? 'Grade rules', sizes: sizes.length ? sizes : [baseSize], base: baseSize, units: 'mm', rules: [] };
  const baseRaws = raws.filter(r => !r.size || r.size === baseSize); const use = baseRaws.length ? baseRaws : raws;
  for (const r of use) points[r.piece.id] = r.rules;
  // Multi-size files without a RUL: derive rules from the size blocks (same vertex index per size).
  if (!rul && sizes.length > 1) {
    const ordered = sizes; const rules: GradeRule[] = []; const key = new Map<string, number>(); table.sizes = ordered;
    for (const r of use) { const per = ordered.map(s => raws.find(x => x.piece.id === r.piece.id && x.size === s)?.piece.seam);
      const idx = r.rules.length ? r.rules.map(x => x.index) : corners(r.piece.seam);
      points[r.piece.id] = idx.map(i => { const deltas: Pt[] = []; for (let k = 0; k + 1 < ordered.length; k++) { const a = per[k]?.[i], b = per[k + 1]?.[i]; deltas.push(a && b ? [Math.round((b[0] - a[0]) * 1000) / 1000, Math.round((b[1] - a[1]) * 1000) / 1000] : [0, 0]); }
        const sig = deltas.join(';'); let id = key.get(sig); if (id == null) { id = rules.length + 1; key.set(sig, id); rules.push({ id, deltas }); } return { index: i, rule: id }; }); }
    table.rules = rules;
  }
  if (!table.rules.length) { const zero: GradeRule = { id: 0, deltas: table.sizes.slice(1).map(() => [0, 0] as Pt) }; table.rules.push(zero); }
  for (const id of Object.keys(points)) for (const gp of points[id]) if (!table.rules.some(r => r.id === gp.rule)) warnings.push(`Grade rule ${gp.rule} on ${id} is not in the rule table; that point will not move.`);
  const pattern: Pattern = { template: pinfo?.[0] || 'imported', name: style, kind: (pinfo?.[1] as Pattern['kind']) || 'apparel', size: baseSize, pieces: use.map(r => r.piece), notions: [], steps: [], notes: [], features: {}, fabricWidth: Number(pinfo?.[2]) || 1500, finished: [] };
  return { graded: { pattern, table, points }, warnings, sizes: table.sizes };
}

const signedArea = (p: Pt[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const nearestIdx = (ring: Pt[], q: Pt) => { let bi = 0, bd = Infinity; ring.forEach((p, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } }); return bi; };
function nearestOnRing(ring: Pt[], q: Pt): Pt {
  let best: Pt = ring[0], bd = Infinity;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1e-12))); const p: Pt = [a[0] + dx * t, a[1] + dy * t]; const d = dist(p, q); if (d < bd) { bd = d; best = p; } }
  return best;
}
function meanGap(cut: Pt[], seam: Pt[]) { let s = 0; for (const q of seam) s += dist(nearestOnRing(cut, q), q); return Math.round(s / seam.length * 10) / 10; }
