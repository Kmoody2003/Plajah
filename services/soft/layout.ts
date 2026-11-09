// Laying patterns out: the cutting marker (every copy on a single layer of fabric, grain parallel
// to the selvedge, packed along the length so we know the yardage), the print sheet (pieces as
// drafted, halves on the fold) and the drawings both become: DXF for drag-knife and laser cutters,
// SVG for vinyl-cutter software and the preview.

import type { CadEntity2D, CadModel, Vec3 } from '../cad/model';
import { emptyModel, emptyBounds, growBounds } from '../cad/model';
import { type Pt, area, bbox } from './geometry';
import { type Pattern, type Piece, type FabricRole, cutInstances, cutLine, unfold } from './patterns';
import { type GradeSet, sizeStyle, sizeRangeLabel } from './grading';

export interface Placed { piece: Piece; copy: number; mirrored: boolean; cut: Pt[]; seam: Pt[]; notches: Pt[]; grain: [Pt, Pt]; lines: Pt[][]; at: Pt; w: number; h: number; label: string }
export interface Marker { role: FabricRole; width: number; length: number; placed: Placed[]; efficiency: number; tooWide: string[] }

const rot = (p: Pt, a: number): Pt => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const flipX = (p: Pt): Pt => [-p[0], p[1]];

/** Bottom-left skyline packing of boxes into a strip of fixed height (the fabric width). */
function pack(boxes: Array<{ w: number; h: number }>, stripH: number, gap: number, step = 5) {
  const cells = Math.max(1, Math.ceil(stripH / step)); const sky = new Float64Array(cells);
  return boxes.map(b => {
    const span = Math.min(cells, Math.ceil((b.h + gap) / step)); let bestY = 0, bestX = Infinity;
    for (let y = 0; y + span <= cells || (y === 0 && span >= cells); y++) {
      let x = 0; for (let k = y; k < Math.min(cells, y + span); k++) if (sky[k] > x) x = sky[k];
      if (x < bestX - 1e-6) { bestX = x; bestY = y; } if (y + span >= cells) break;
    }
    for (let k = bestY; k < Math.min(cells, bestY + span); k++) sky[k] = bestX + b.w + gap;
    return { x: bestX, y: bestY * step };
  });
}

/** Cutting marker for one fabric: every copy, grain along the fabric length (x), packed across the width (y). */
export function marker(pattern: Pattern, role: FabricRole, width = pattern.fabricWidth, gap = 6): Marker {
  const insts = cutInstances(pattern).filter(i => i.piece.fabric === role);
  const shapes = insts.map(inst => {
    const p = inst.piece; const g = inst.mirrored ? [flipX(p.grain[0]), flipX(p.grain[1])] as [Pt, Pt] : p.grain;
    const a = -Math.atan2(g[1][1] - g[0][1], g[1][0] - g[0][0]); const T = (q: Pt) => rot(inst.mirrored ? flipX(q) : q, a);
    const cut = inst.outline.map(q => rot(q, a)); const seam = p.seam.map(T); const notches = (p.notches ?? []).map(T); const grain = [T(p.grain[0]), T(p.grain[1])] as [Pt, Pt]; const lines = (p.lines ?? []).map(l => l.pts.map(T));
    const b = bbox(cut); const sh = (q: Pt): Pt => [q[0] - b.x0, q[1] - b.y0];
    return { inst, cut: cut.map(sh), seam: seam.map(sh), notches: notches.map(sh), grain: grain.map(sh) as [Pt, Pt], lines: lines.map(l => l.map(sh)), w: b.w, h: b.h, area: Math.abs(area(cut)) };
  });
  const order = shapes.map((_, i) => i).sort((x, y) => shapes[y].h * shapes[y].w - shapes[x].h * shapes[x].w);
  const spots = pack(order.map(i => shapes[i]), width, gap);
  const placed: Placed[] = []; let length = 0; const tooWide: string[] = [];
  order.forEach((i, k) => { const s = shapes[i], { x, y } = spots[k]; const mv = (q: Pt): Pt => [q[0] + x, q[1] + y];
    if (s.h > width + 0.5 && !tooWide.includes(s.inst.piece.name)) tooWide.push(s.inst.piece.name);
    placed.push({ piece: s.inst.piece, copy: s.inst.copy, mirrored: s.inst.mirrored, cut: s.cut.map(mv), seam: s.seam.map(mv), notches: s.notches.map(mv), grain: s.grain.map(mv) as [Pt, Pt], lines: s.lines.map(l => l.map(mv)), at: [x, y], w: s.w, h: s.h, label: `${s.inst.piece.name}${s.inst.piece.cut > 1 ? ` ${s.inst.copy + 1}/${s.inst.piece.cut}` : ''}${s.inst.mirrored ? ' (reversed)' : ''}` });
    length = Math.max(length, x + s.w); });
  const used = shapes.reduce((t, s) => t + s.area, 0);
  return { role, width, length, placed, efficiency: length ? used / (length * width) : 0, tooWide };
}

export const FABRIC_LABEL: Record<FabricRole, string> = { main: 'Main fabric', contrast: 'Contrast fabric', lining: 'Lining', rib: 'Rib knit', fur: 'Fur / minky', interfacing: 'Interfacing' };
export const rolesOf = (p: Pattern) => [...new Set(p.pieces.map(x => x.fabric))];

/** Fabric to buy: marker length + 10% for shrinkage and straightening, in metres (0.1) and yards (⅛). */
export function yardage(m: Marker) {
  const L = m.length * 1.1 + 100; const metres = Math.ceil(L / 100) / 10; const yards = Math.ceil(L / 914.4 * 8) / 8;
  return { mm: L, metres, yards, text: `${metres.toFixed(1)} m (${yards} yd) of ${Math.round(m.width / 10)} cm / ${Math.round(m.width / 25.4)}″ wide` };
}

/** Plain rectangles are cut by measurement rather than printed. */
export const isRect = (p: Piece) => p.seam.length === 4 && p.seam.every((q, i) => { const r = p.seam[(i + 1) % 4]; return Math.abs(q[0] - r[0]) < 1e-6 || Math.abs(q[1] - r[1]) < 1e-6; });
export function cutChart(pattern: Pattern, unit: 'cm' | 'in' = 'cm'): string[][] {
  const f = (mm: number) => (unit === 'in' ? `${(mm / 25.4).toFixed(2)}″` : `${(mm / 10).toFixed(1)} cm`);
  return [['Piece', 'Fabric', 'Cut', 'Size to cut (incl. allowance)'], ...pattern.pieces.map(p => { const b = bbox(cutLine(unfold(p))); return [p.name, FABRIC_LABEL[p.fabric], `${p.cut}${p.pair ? ' (pairs)' : ''}${p.fold != null ? ' on fold' : ''}`, isRect(p) ? `${f(b.w)} × ${f(b.h)}` : `pattern piece (${f(b.w)} × ${f(b.h)} box)`]; })];
}

export interface NestLine { size: string; i: number; cut: Pt[]; seam: Pt[] }
export interface SheetItem { piece: Piece; cut: Pt[]; seam: Pt[]; notches: Pt[]; grain: [Pt, Pt]; fold?: [Pt, Pt]; marks: Array<{ at: Pt; label: string; r?: number }>; lines: Array<{ pts: Pt[]; label?: string }>; at: Pt; w: number; h: number;
  /** Graded: one cutting line per size, stacked on the piece's zero point (the largest size carries the labels). */ nest?: NestLine[] }
/**
 * Print sheet: shaped pieces as drafted (fold pieces as halves), grain vertical, packed into a
 * page-friendly width. With a grade set the pattern is its largest size and every size's cutting
 * line is nested on the piece's zero point: the fold at the hem, else the bottom centre.
 */
export function printSheet(pattern: Pattern, width?: number, gap = 15, grade?: GradeSet | null): { items: SheetItem[]; width: number; height: number; skipped: Piece[]; sizes?: string[] } {
  const shaped = pattern.pieces.filter(p => !isRect(p)); const skipped = pattern.pieces.filter(isRect);
  const shapes = shaped.map(p => {
    const a = Math.PI / 2 - Math.atan2(p.grain[1][1] - p.grain[0][1], p.grain[1][0] - p.grain[0][0]); const T = (q: Pt) => rot(q, a);
    const zero = (q: Piece): Pt => { const s = q.seam.map(T); if (q.fold != null) return s[(q.fold + 1) % s.length]; const b = bbox(s); return [(b.x0 + b.x1) / 2, b.y0]; };
    const z0 = zero(p);
    const nest0: NestLine[] | undefined = grade ? grade.sizes.flatMap((size, i) => {
      const q = grade.patterns[i]?.pieces.find(x => x.id === p.id); if (!q) return [];
      const z = zero(q); const M = (pt: Pt): Pt => { const r = T(pt); return [r[0] + z0[0] - z[0], r[1] + z0[1] - z[1]]; };
      return [{ size, i, cut: cutLine(q).map(M), seam: q.seam.map(M) }];
    }) : undefined;
    const cut = cutLine(p).map(T); const b = bbox([...cut, ...(nest0 ?? []).flatMap(n => n.cut)]);
    const o = (q: Pt): Pt => [q[0] - b.x0, q[1] - b.y0]; const sh = (q: Pt): Pt => o(T(q));
    const fold = p.fold != null ? [sh(p.seam[p.fold]), sh(p.seam[(p.fold + 1) % p.seam.length])] as [Pt, Pt] : undefined;
    return { piece: p, cut: cut.map(o), seam: p.seam.map(sh), notches: (p.notches ?? []).map(sh), grain: [sh(p.grain[0]), sh(p.grain[1])] as [Pt, Pt], fold, marks: (p.marks ?? []).map(m => ({ ...m, at: sh(m.at) })), lines: (p.lines ?? []).map(l => ({ ...l, pts: l.pts.map(sh) })),
      nest: nest0?.map(n => ({ ...n, cut: n.cut.map(o), seam: n.seam.map(o) })), w: b.w, h: b.h };
  });
  const total = shapes.reduce((t, s) => t + s.w * s.h, 0); const W = width ?? Math.max(...shapes.map(s => s.w), Math.sqrt(total * 1.3), 200);
  // Pack with x across the page: reuse the strip packer with axes swapped (strip = page width).
  const order = shapes.map((_, i) => i).sort((x, y) => shapes[y].h - shapes[x].h);
  const spots = pack(order.map(i => ({ w: shapes[i].h, h: shapes[i].w })), W, gap);
  let height = 0; const items: SheetItem[] = [];
  order.forEach((i, k) => { const s = shapes[i]; const x = spots[k].y, y = spots[k].x; const mv = (q: Pt): Pt => [q[0] + x, q[1] + y];
    items.push({ ...s, cut: s.cut.map(mv), seam: s.seam.map(mv), notches: s.notches.map(mv), grain: s.grain.map(mv) as [Pt, Pt], fold: s.fold?.map(mv) as [Pt, Pt] | undefined, marks: s.marks.map(m => ({ ...m, at: mv(m.at) })), lines: s.lines.map(l => ({ ...l, pts: l.pts.map(mv) })),
      nest: s.nest?.map(n => ({ ...n, cut: n.cut.map(mv), seam: n.seam.map(mv) })), at: [x, y] });
    height = Math.max(height, y + s.h); });
  return { items, width: W, height, skipped, ...(grade ? { sizes: grade.sizes } : {}) };
}

export const pieceCaption = (p: Piece, size?: string) => [p.name.toUpperCase(), `CUT ${p.cut}${p.pair ? ' (MIRRORED PAIRS)' : ''}${p.fold != null ? ' ON FOLD' : ''}`, size ? `SIZE ${size}` : '', p.fabric !== 'main' ? p.fabric.toUpperCase() : ''].filter(Boolean);

/** A 2D drawing (DXF-ready): the cutting marker for one fabric, or every fabric stacked. */
export function patternModel(pattern: Pattern, opts: { roles?: FabricRole[]; cutOnly?: boolean; widths?: Partial<Record<FabricRole, number>> } = {}): CadModel {
  const m = emptyModel(pattern.name, 'dxf', 'plajah-soft'); m.units = 'mm'; m.is2D = true;
  m.layers = [{ name: 'CUT', color: '#ffffff', visible: true }, { name: 'NOTCH', color: '#ef4444', visible: true }, ...(opts.cutOnly ? [] : [{ name: 'SEW', color: '#60a5fa', visible: true, lineType: 'DASHED' }, { name: 'GRAIN', color: '#22c55e', visible: true }, { name: 'TEXT', color: '#fbbf24', visible: true }, { name: 'FABRIC', color: '#6b7280', visible: true }])];
  const V = (q: Pt, oy: number): Vec3 => [q[0], q[1] + oy, 0]; const E: CadEntity2D[] = []; let oy = 0;
  for (const role of opts.roles ?? rolesOf(pattern)) {
    const mk = marker(pattern, role, opts.widths?.[role] ?? pattern.fabricWidth);
    if (!opts.cutOnly) { E.push({ type: 'polyline', layer: 'FABRIC', closed: true, points: [[0, oy, 0], [mk.length, oy, 0], [mk.length, oy + mk.width, 0], [0, oy + mk.width, 0]] }); E.push({ type: 'text', layer: 'TEXT', at: [0, oy - 30, 0], height: 18, rotation: 0, text: `${FABRIC_LABEL[role]} - ${yardage(mk).text}` }); }
    for (const pl of mk.placed) {
      E.push({ type: 'polyline', layer: 'CUT', closed: true, points: pl.cut.map(q => V(q, oy)) });
      for (const n of pl.notches) { const c = pl.cut.reduce((b, q) => (Math.hypot(q[0] - n[0], q[1] - n[1]) < Math.hypot(b[0] - n[0], b[1] - n[1]) ? q : b), pl.cut[0]); const d = Math.hypot(c[0] - n[0], c[1] - n[1]) || 1; const L = Math.min(4, d); E.push({ type: 'line', layer: 'NOTCH', a: V(c, oy), b: V([c[0] + (n[0] - c[0]) / d * L, c[1] + (n[1] - c[1]) / d * L], oy) }); }
      if (!opts.cutOnly) {
        E.push({ type: 'polyline', layer: 'SEW', closed: true, points: pl.seam.map(q => V(q, oy)) });
        E.push({ type: 'line', layer: 'GRAIN', a: V(pl.grain[0], oy), b: V(pl.grain[1], oy) });
        for (const l of pl.lines) E.push({ type: 'polyline', layer: 'SEW', closed: false, points: l.map(q => V(q, oy)) });
        const c = [(pl.grain[0][0] + pl.grain[1][0]) / 2, (pl.grain[0][1] + pl.grain[1][1]) / 2] as Pt;
        E.push({ type: 'text', layer: 'TEXT', at: V([c[0] + 6, c[1] + 6], oy), height: Math.max(5, Math.min(14, pl.h / 18)), rotation: 0, text: pl.label });
      }
    }
    oy += mk.width + 120;
  }
  m.entities = E; const b = emptyBounds(); for (const e of E) { if (e.type === 'polyline') for (const p of e.points) growBounds(b, p[0], p[1], 0); else if (e.type === 'line') { growBounds(b, e.a[0], e.a[1], 0); growBounds(b, e.b[0], e.b[1], 0); } }
  m.bounds = b; return m;
}

/** SVG (millimetre units) of a marker, for vinyl/drag-knife software (Cricut, Silhouette, LightBurn). */
export function markerSvg(mk: Marker, cutOnly = false): string {
  const W = Math.max(1, mk.length), H = mk.width; const d = (pts: Pt[]) => `M${pts.map(q => `${q[0].toFixed(2)},${(H - q[1]).toFixed(2)}`).join('L')}Z`;
  const body = mk.placed.map(p => `<path d="${d(p.cut)}" fill="none" stroke="#000" stroke-width="0.3"/>${cutOnly ? '' : `<path d="${d(p.seam)}" fill="none" stroke="#2563eb" stroke-width="0.3" stroke-dasharray="3 2"/>${p.lines.map(l => `<path d="M${l.map(q => `${q[0].toFixed(2)},${(H - q[1]).toFixed(2)}`).join('L')}" fill="none" stroke="#2563eb" stroke-width="0.3"/>`).join('')}<line x1="${p.grain[0][0]}" y1="${H - p.grain[0][1]}" x2="${p.grain[1][0]}" y2="${H - p.grain[1][1]}" stroke="#16a34a" stroke-width="0.4"/><text x="${(p.at[0] + 8).toFixed(1)}" y="${(H - p.at[1] - 8).toFixed(1)}" font-size="${Math.max(5, Math.min(14, p.h / 18)).toFixed(1)}" font-family="sans-serif">${p.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`}`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(1)}mm" height="${H.toFixed(1)}mm" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">${cutOnly ? '' : `<rect width="${W.toFixed(1)}" height="${H}" fill="none" stroke="#9ca3af" stroke-width="0.5"/>`}${body}</svg>`;
}

/**
 * Graded nest as a 2D drawing (DXF-ready): each size's cutting line on its own layer (SIZE-M,
 * SIZE-L ...) in the size-key colour, so cutter and CAD software can switch sizes on and off.
 */
export function gradedModel(grade: GradeSet): CadModel {
  const sheet = printSheet(grade.base, undefined, 15, grade); const m = emptyModel(`${grade.base.name} graded ${sizeRangeLabel(grade.sizes)}`, 'dxf', 'plajah-soft'); m.units = 'mm'; m.is2D = true;
  m.layers = [...grade.sizes.map((s, i) => ({ name: `SIZE-${s}`, color: sizeStyle(i).color, visible: true })), { name: 'NOTCH', color: '#ef4444', visible: true }, { name: 'GRAIN', color: '#22c55e', visible: true }, { name: 'MARK', color: '#60a5fa', visible: true }, { name: 'TEXT', color: '#fbbf24', visible: true }];
  const V = (q: Pt): Vec3 => [q[0], q[1], 0]; const E: CadEntity2D[] = [];
  for (const it of sheet.items) {
    for (const n of it.nest ?? []) E.push({ type: 'polyline', layer: `SIZE-${n.size}`, closed: true, points: n.cut.map(V) });
    E.push({ type: 'line', layer: 'GRAIN', a: V(it.grain[0]), b: V(it.grain[1]) });
    for (const l of it.lines) E.push({ type: 'polyline', layer: 'MARK', closed: false, points: l.pts.map(V) });
    for (const nn of it.notches) { const c = it.cut.reduce((b, q) => (Math.hypot(q[0] - nn[0], q[1] - nn[1]) < Math.hypot(b[0] - nn[0], b[1] - nn[1]) ? q : b), it.cut[0]); E.push({ type: 'line', layer: 'NOTCH', a: V(c), b: V(nn) }); }
    const c = [(it.grain[0][0] + it.grain[1][0]) / 2, (it.grain[0][1] + it.grain[1][1]) / 2] as Pt;
    E.push({ type: 'text', layer: 'TEXT', at: V([c[0] + 6, c[1] + 6]), height: Math.max(5, Math.min(14, it.h / 20)), rotation: 0, text: pieceCaption(it.piece, sizeRangeLabel(grade.sizes)).join(' / ') });
  }
  grade.sizes.forEach((s, i) => E.push({ type: 'text', layer: `SIZE-${s}`, at: [0, -30 - i * 16, 0], height: 10, rotation: 0, text: `SIZE ${s}` }));
  m.entities = E; const b = emptyBounds(); for (const e of E) { if (e.type === 'polyline') for (const p of e.points) growBounds(b, p[0], p[1], 0); else if (e.type === 'line') { growBounds(b, e.a[0], e.a[1], 0); growBounds(b, e.b[0], e.b[1], 0); } }
  m.bounds = b; return m;
}
