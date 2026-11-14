// paint — gradients, patterns, freeform gradients and mesh gradients → SVG.
//
// Linear / radial: multi-stop with per-stop opacity, absolute (userSpaceOnUse) geometry,
// gradientTransform and spread — what Illustrator's gradient annotator edits.
// Pattern: a tile of path pieces repeated with a transform.
// Freeform ("points" mode): a base colour plus soft radial blooms per colour point,
// clipped to the shape — reads like Illustrator's freeform with far less maths.
// MESH (decision): a Coons-style grid of colour nodes is TESSELLATED IN VECTOR — each
// cell is interpolated bicubically (Catmull–Rom across the grid, so cells meet smoothly)
// and subdivided until the colour step between neighbouring micro-quads is ≤ tolerance;
// each micro-quad is a flat polygon with a hairline of its own colour to hide AA seams.
// Why vector, not raster: it stays resolution-independent, renders identically in
// browser / puppeteer / PDF, and needs no canvas in node. Cost grows with colour range
// (typ. 200–2000 quads); beyond MESH_QUAD_LIMIT we coarsen, never rasterise silently.
import type { Vec } from './vec';
import type { LinearPaint, RadialPaint, MeshPaint, PatternPaint, FreeformPaint, PaintStop, Paint } from './model';
import { parseColor, toHex } from './color';
import { matrixToString } from './transform';
import { fmt } from './vec';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stopsSvg = (stops: PaintStop[]) => stops.slice().sort((a, b) => a.offset - b.offset).map(s => `<stop offset="${fmt(Math.max(0, Math.min(1, s.offset)), 4)}" stop-color="${esc(s.color)}"${s.opacity !== undefined && s.opacity !== 1 ? ` stop-opacity="${fmt(s.opacity, 3)}"` : ''}/>`).join('');

// ── Constructors ────────────────────────────────────────────────────────────────────

export const linear = (x1: number, y1: number, x2: number, y2: number, stops: Array<PaintStop | [number, string, number?]>): LinearPaint => ({ type: 'linear', x1, y1, x2, y2, stops: stops.map(toStop) });
export const radial = (cx: number, cy: number, r: number, stops: Array<PaintStop | [number, string, number?]>, focal?: Vec): RadialPaint => ({ type: 'radial', cx, cy, r, fx: focal?.x, fy: focal?.y, stops: stops.map(toStop) });
const toStop = (s: PaintStop | [number, string, number?]): PaintStop => Array.isArray(s) ? { offset: s[0], color: s[1], opacity: s[2] } : s;
/** Linear gradient across a box at an angle (deg, 0 = left→right, 90 = top→bottom). */
export function linearAcross(box: { x: number; y: number; w: number; h: number }, angleDeg: number, stops: Array<PaintStop | [number, string, number?]>): LinearPaint {
  const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const half = (Math.abs(c) * box.w + Math.abs(s) * box.h) / 2;
  return linear(cx - c * half, cy - s * half, cx + c * half, cy + s * half, stops);
}

// ── SVG defs ────────────────────────────────────────────────────────────────────────

/** A <defs> entry for a paint server (linear / radial / pattern). Others return null. */
export function paintServer(id: string, p: Paint): string | null {
  if (typeof p === 'string') return null;
  if (p.type === 'linear') return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(p.x1)}" y1="${fmt(p.y1)}" x2="${fmt(p.x2)}" y2="${fmt(p.y2)}"${p.transform ? ` gradientTransform="${matrixToString(p.transform)}"` : ''}${p.spread && p.spread !== 'pad' ? ` spreadMethod="${p.spread}"` : ''}>${stopsSvg(p.stops)}</linearGradient>`;
  if (p.type === 'radial') return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fmt(p.cx)}" cy="${fmt(p.cy)}" r="${fmt(p.r)}"${p.fx !== undefined ? ` fx="${fmt(p.fx)}"` : ''}${p.fy !== undefined ? ` fy="${fmt(p.fy)}"` : ''}${p.fr ? ` fr="${fmt(p.fr)}"` : ''}${p.transform ? ` gradientTransform="${matrixToString(p.transform)}"` : ''}${p.spread && p.spread !== 'pad' ? ` spreadMethod="${p.spread}"` : ''}>${stopsSvg(p.stops)}</radialGradient>`;
  if (p.type === 'pattern') return patternDef(id, p);
  return null;
}
function patternDef(id: string, p: PatternPaint): string {
  const tiles = p.tiles.map(t => `<path d="${t.d}" fill="${esc(t.fill ?? 'none')}"${t.stroke ? ` stroke="${esc(t.stroke)}" stroke-width="${fmt(t.strokeWidth ?? 1)}"` : ''}${t.opacity !== undefined && t.opacity !== 1 ? ` opacity="${fmt(t.opacity)}"` : ''}/>`).join('');
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${fmt(p.w)}" height="${fmt(p.h)}"${p.transform ? ` patternTransform="${matrixToString(p.transform)}"` : ''}>${p.background ? `<rect width="${fmt(p.w)}" height="${fmt(p.h)}" fill="${esc(p.background)}"/>` : ''}${p.image ? `<image href="${esc(p.image)}" width="${fmt(p.w)}" height="${fmt(p.h)}" preserveAspectRatio="none"/>` : ''}${tiles}</pattern>`;
}

/**
 * Painted layers for paints that are not a single paint server (freeform, mesh), to be
 * drawn INSIDE a clip of the shape. Returns { defs, body }.
 */
export function paintLayers(id: string, p: FreeformPaint | MeshPaint): { defs: string; body: string } {
  if (p.type === 'freeform') {
    const defs: string[] = []; const body: string[] = [];
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const q of p.points) { minx = Math.min(minx, q.x - q.radius); miny = Math.min(miny, q.y - q.radius); maxx = Math.max(maxx, q.x + q.radius); maxy = Math.max(maxy, q.y + q.radius); }
    body.push(`<rect x="${fmt(minx - 4000)}" y="${fmt(miny - 4000)}" width="${fmt(maxx - minx + 8000)}" height="${fmt(maxy - miny + 8000)}" fill="${esc(p.base)}"/>`);
    p.points.forEach((q, i) => {
      const gid = `${id}_ff${i}`; const op = q.opacity ?? 1;
      defs.push(`<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${fmt(q.x)}" cy="${fmt(q.y)}" r="${fmt(q.radius)}"><stop offset="0" stop-color="${esc(q.color)}" stop-opacity="${fmt(op)}"/><stop offset=".35" stop-color="${esc(q.color)}" stop-opacity="${fmt(op * .78)}"/><stop offset=".7" stop-color="${esc(q.color)}" stop-opacity="${fmt(op * .28)}"/><stop offset="1" stop-color="${esc(q.color)}" stop-opacity="0"/></radialGradient>`);
      body.push(`<circle cx="${fmt(q.x)}" cy="${fmt(q.y)}" r="${fmt(q.radius)}" fill="url(#${gid})"/>`);
    });
    return { defs: defs.join(''), body: body.join('') };
  }
  const quads = tessellateMesh(p);
  return { defs: '', body: quads.map(q => `<path d="M${q.pts.map(v => `${fmt(v.x, 2)} ${fmt(v.y, 2)}`).join('L')}Z" fill="${q.color}" stroke="${q.color}" stroke-width=".6" stroke-linejoin="round"/>`).join('') };
}

// ── Mesh tessellation ───────────────────────────────────────────────────────────────

export const MESH_QUAD_LIMIT = 6000;
export interface MeshQuad { pts: Vec[]; color: string }

/** Build a mesh paint from a grid of colours over a box (convenience for designers). */
export function meshGrid(box: { x: number; y: number; w: number; h: number }, colors: string[][], warp?: (p: Vec, r: number, c: number) => Vec): MeshPaint {
  const rows = colors.length - 1, cols = colors[0].length - 1; const nodes: MeshPaint['nodes'] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) { let p = { x: box.x + box.w * c / cols, y: box.y + box.h * r / rows }; if (warp) p = warp(p, r, c); nodes.push({ x: p.x, y: p.y, color: colors[r][c] }); }
  return { type: 'mesh', rows, cols, nodes };
}

export function tessellateMesh(m: MeshPaint): MeshQuad[] {
  const tol = m.tolerance ?? 6; const R = m.rows, C = m.cols;
  const node = (r: number, c: number) => m.nodes[Math.max(0, Math.min(R, r)) * (C + 1) + Math.max(0, Math.min(C, c))];
  const rgb = m.nodes.map(n => parseColor(n.color));
  const col = (r: number, c: number) => rgb[Math.max(0, Math.min(R, r)) * (C + 1) + Math.max(0, Math.min(C, c))];
  // Catmull–Rom with clamped (reflected) borders
  const cr = (a: number, b: number, c: number, d: number, t: number) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const ext = (r: number, c: number, k: 'x' | 'y') => { const rr = Math.max(0, Math.min(R, r)), cc = Math.max(0, Math.min(C, c)); const base = node(rr, cc)[k]; if (rr === r && cc === c) return base; const ir = rr - (r - rr), ic = cc - (c - cc); return 2 * base - node(Math.max(0, Math.min(R, ir)), Math.max(0, Math.min(C, ic)))[k]; };
  const pos = (r: number, c: number, u: number, v: number): Vec => {
    const k = (axis: 'x' | 'y') => { const rows: number[] = []; for (let i = -1; i <= 2; i++) rows.push(cr(ext(r + i, c - 1, axis), ext(r + i, c, axis), ext(r + i, c + 1, axis), ext(r + i, c + 2, axis), u)); return cr(rows[0], rows[1], rows[2], rows[3], v); };
    return { x: k('x'), y: k('y') };
  };
  const colAt = (r: number, c: number, u: number, v: number) => {
    const out = { r: 0, g: 0, b: 0, a: 0 };
    for (const ch of ['r', 'g', 'b', 'a'] as const) { const rows: number[] = []; for (let i = -1; i <= 2; i++) rows.push(cr(col(r + i, c - 1)[ch], col(r + i, c)[ch], col(r + i, c + 1)[ch], col(r + i, c + 2)[ch], u)); out[ch] = cr(rows[0], rows[1], rows[2], rows[3], v); }
    return out;
  };
  let quads: MeshQuad[] = [];
  const budget = Math.max(1, Math.floor(MESH_QUAD_LIMIT / Math.max(1, R * C)));
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const corners = [col(r, c), col(r, c + 1), col(r + 1, c), col(r + 1, c + 1)];
    let range = 0; for (const ch of ['r', 'g', 'b'] as const) { const vs = corners.map(x => x[ch]); range = Math.max(range, Math.max(...vs) - Math.min(...vs)); }
    let k = Math.max(2, Math.min(32, Math.ceil(range / tol)));
    while (k * k > budget && k > 2) k--;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const u0 = j / k, u1 = (j + 1) / k, v0 = i / k, v1 = (i + 1) / k;
      const cc = colAt(r, c, (u0 + u1) / 2, (v0 + v1) / 2);
      quads.push({ pts: [pos(r, c, u0, v0), pos(r, c, u1, v0), pos(r, c, u1, v1), pos(r, c, u0, v1)], color: toHex(cc) });
    }
  }
  if (quads.length > MESH_QUAD_LIMIT) quads = quads.slice(0, MESH_QUAD_LIMIT);
  return quads;
}
