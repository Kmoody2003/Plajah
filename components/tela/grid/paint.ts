// paint — the Grid's canvas renderer.
//
// One pass per animation frame draws only what is on screen: the four frozen
// quadrants (corner, top, left, main) each clip and paint their visible rows ×
// columns, then headers and overlays. Nothing scales with sheet size — a
// 100k-row sheet paints the same ~800 cells as a 50-row one — and values come
// straight from the engine (`getValue` / `formatValue`), so there is no DOM
// per cell. Excel details: text overflows into empty neighbours (and hides the
// gridlines it covers), numbers that don't fit show ####, merged cells paint
// as one block, wrap / rotation / indent / borders / fills, and conditional
// formats (colour scales, data bars, icon sets, highlight styles).

import { formatValue, getCell, toA1, type CellStyle, type CfVisual, type Formatted, type Scalar, type Sheet, type Workbook, CellError } from '../../../services/tela/sheet';
import type { Axis } from './axis';
import type { Rect, Selection } from './selection';

export const FONT_STACK = '"Inter", "Segoe UI", Roboto, system-ui, sans-serif';

export const THEME = {
  bg: '#FFFFFF',
  grid: '#E3E0EA',
  header: '#F5F3F8',
  headerSel: '#E9DDF3',
  headerAll: '#D8C3EA',
  headerText: '#6E6480',
  headerTextSel: '#5A007F',
  headerLine: '#D9D4E2',
  text: '#1B1523',
  sel: '#7A1FB0',
  selFill: 'rgba(122,31,176,0.09)',
  spill: '#2F6FDB',
  copy: '#7A1FB0',
  frozenLine: '#B9AFC8',
  error: '#C81E3A',
};

export interface CellReader {
  value(row: number, col: number): Scalar;
  /** Number format at a cell (style.numFmt) — reader may apply table/column defaults. */
  numFmt?(row: number, col: number): string | undefined;
}

export interface Overlay {
  refs: { range: Rect; color: string; sheetMatch: boolean }[];
  spill?: Rect | null;
  copy?: Rect | null;
  copyPhase?: number;
  fillPreview?: Rect | null;
  movePreview?: Rect | null;
  traces?: { from: Rect; to: Rect; color: string }[];
  /** Active cell is being edited: don't draw its content. */
  editing?: { row: number; col: number } | null;
  hover?: { row: number; col: number } | null;
  findHits?: Set<string>;
  errors?: boolean;
}

export interface PaintParams {
  ctx: CanvasRenderingContext2D;
  width: number; height: number;
  wb: Workbook; sheet: Sheet;
  reader: CellReader;
  rows: Axis; cols: Axis;
  headerW: number; headerH: number;
  zoom: number;
  scrollX: number; scrollY: number;
  frozenRows: number; frozenCols: number;
  selection: Selection;
  cf: Map<string, CfVisual>;
  merges: Rect[];
  showGrid: boolean;
  overlay: Overlay;
  /** Filter header buttons: header row + column range, and which columns are filtered. */
  filter?: { row: number; c1: number; c2: number; active: Set<number> } | null;
  /** Table banding: [range, header?] */
  tables?: { range: Rect; header: boolean; style?: string }[];
  /** Notes indicator. */
  readOnly?: boolean;
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export interface Geometry {
  rowY(r: number): number;
  colX(c: number): number;
  FH: number; FW: number;
  visRows: number[]; visCols: number[];
  frozenRowList: number[]; frozenColList: number[];
}

export function geometry(p: Pick<PaintParams, 'rows' | 'cols' | 'headerW' | 'headerH' | 'scrollX' | 'scrollY' | 'frozenRows' | 'frozenCols' | 'width' | 'height'>): Geometry {
  const { rows, cols, headerW, headerH, scrollX, scrollY } = p;
  const fr = Math.min(p.frozenRows, rows.count), fc = Math.min(p.frozenCols, cols.count);
  const FH = rows.offsetOf(fr), FW = cols.offsetOf(fc);
  const r0 = rows.offsetOf(fr), c0 = cols.offsetOf(fc);
  const rowY = (r: number) => (r < fr ? headerH + rows.offsetOf(r) : headerH + FH + rows.offsetOf(r) - r0 - scrollY);
  const colX = (c: number) => (c < fc ? headerW + cols.offsetOf(c) : headerW + FW + cols.offsetOf(c) - c0 - scrollX);
  const visRows = rows.range(r0 + scrollY, r0 + scrollY + Math.max(0, p.height - headerH - FH)).filter(r => r >= fr);
  const visCols = cols.range(c0 + scrollX, c0 + scrollX + Math.max(0, p.width - headerW - FW)).filter(c => c >= fc);
  const frozenRowList = fr ? rows.range(0, FH) : [];
  const frozenColList = fc ? cols.range(0, FW) : [];
  return { rowY, colX, FH, FW, visRows, visCols, frozenRowList, frozenColList };
}

/** Screen rect of a cell range (may extend off-screen). */
export function rangeRect(g: Geometry, rows: Axis, cols: Axis, r: Rect): { x: number; y: number; w: number; h: number } {
  const x = g.colX(r.c1), y = g.rowY(r.r1);
  const x2 = g.colX(r.c2) + cols.sizeOf(r.c2), y2 = g.rowY(r.r2) + rows.sizeOf(r.r2);
  return { x, y, w: x2 - x, h: y2 - y };
}

// ── Fonts / styles ───────────────────────────────────────────────────────────

const fontCache = new Map<string, string>();
export function fontOf(st: CellStyle | undefined, zoom: number, cfStyle?: CellStyle): string {
  const f = { ...(st?.font ?? {}), ...(cfStyle?.font ?? {}) };
  const key = `${f.bold ? 1 : 0}${f.italic ? 1 : 0}${f.size ?? 11}|${f.family ?? ''}|${zoom}`;
  let s = fontCache.get(key);
  if (!s) {
    const px = Math.round((f.size ?? 11) * 1.22 * zoom * 10) / 10;
    const fam = f.family ? `"${f.family.replace(/"/g, '')}", ${FONT_STACK}` : FONT_STACK;
    s = `${f.italic ? 'italic ' : ''}${f.bold ? '700' : '400'} ${px}px ${fam}`;
    fontCache.set(key, s);
  }
  return s;
}

const ICON_GLYPHS: Record<string, { shapes: string[]; colors: string[] }> = {
  arrows: { shapes: ['down', 'side', 'up', 'up', 'up'], colors: ['#D13438', '#E8A33D', '#2E9E5B'] },
  lights: { shapes: ['dot', 'dot', 'dot', 'dot'], colors: ['#D13438', '#E8A33D', '#2E9E5B', '#1B1523'] },
  flags: { shapes: ['flag', 'flag', 'flag'], colors: ['#D13438', '#E8A33D', '#2E9E5B'] },
  stars: { shapes: ['star', 'star', 'star'], colors: ['#C8C2D0', '#E8A33D', '#E8A33D'] },
  ratings: { shapes: ['bars', 'bars', 'bars', 'bars', 'bars'], colors: ['#5A4F6B', '#5A4F6B', '#5A4F6B', '#5A4F6B', '#5A4F6B'] },
  symbols: { shapes: ['x', 'bang', 'check'], colors: ['#D13438', '#E8A33D', '#2E9E5B'] },
  triangles: { shapes: ['down', 'side', 'up'], colors: ['#D13438', '#E8A33D', '#2E9E5B'] },
};
function iconFamily(set: string): keyof typeof ICON_GLYPHS {
  if (/Arrows/.test(set)) return 'arrows';
  if (/Traffic|Signs|RedToBlack/.test(set)) return 'lights';
  if (/Flags/.test(set)) return 'flags';
  if (/Stars/.test(set)) return 'stars';
  if (/Rating|Quarters|Boxes/.test(set)) return 'ratings';
  if (/Symbols/.test(set)) return 'symbols';
  return 'triangles';
}

export function drawIcon(ctx: CanvasRenderingContext2D, set: string, index: number, count: number, x: number, cy: number, size: number) {
  const fam = ICON_GLYPHS[iconFamily(set)];
  const t = count <= 1 ? 1 : index / (count - 1);
  const ci = Math.min(fam.colors.length - 1, Math.round(t * (fam.colors.length - 1)));
  const color = fam.colors[ci];
  const s = size, h = s / 2;
  ctx.save();
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, s / 7);
  const shape = iconFamily(set) === 'arrows' || iconFamily(set) === 'triangles' ? (t < 0.34 ? 'down' : t > 0.66 ? 'up' : 'side') : fam.shapes[Math.min(fam.shapes.length - 1, ci)];
  const cx = x + h;
  ctx.beginPath();
  switch (shape) {
    case 'up': ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h, cy + h * 0.2); ctx.lineTo(cx + h * 0.35, cy + h * 0.2); ctx.lineTo(cx + h * 0.35, cy + h); ctx.lineTo(cx - h * 0.35, cy + h); ctx.lineTo(cx - h * 0.35, cy + h * 0.2); ctx.lineTo(cx - h, cy + h * 0.2); ctx.closePath(); ctx.fill(); break;
    case 'down': ctx.moveTo(cx, cy + h); ctx.lineTo(cx + h, cy - h * 0.2); ctx.lineTo(cx + h * 0.35, cy - h * 0.2); ctx.lineTo(cx + h * 0.35, cy - h); ctx.lineTo(cx - h * 0.35, cy - h); ctx.lineTo(cx - h * 0.35, cy - h * 0.2); ctx.lineTo(cx - h, cy - h * 0.2); ctx.closePath(); ctx.fill(); break;
    case 'side': ctx.moveTo(cx + h, cy); ctx.lineTo(cx - h * 0.2, cy - h); ctx.lineTo(cx - h * 0.2, cy - h * 0.35); ctx.lineTo(cx - h, cy - h * 0.35); ctx.lineTo(cx - h, cy + h * 0.35); ctx.lineTo(cx - h * 0.2, cy + h * 0.35); ctx.lineTo(cx - h * 0.2, cy + h); ctx.closePath(); ctx.fill(); break;
    case 'dot': ctx.arc(cx, cy, h * 0.85, 0, Math.PI * 2); ctx.fill(); break;
    case 'flag': ctx.moveTo(cx - h * 0.6, cy + h); ctx.lineTo(cx - h * 0.6, cy - h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - h * 0.6, cy - h); ctx.lineTo(cx + h, cy - h * 0.45); ctx.lineTo(cx - h * 0.6, cy + h * 0.1); ctx.closePath(); ctx.fill(); break;
    case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? h * 0.45 : h; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); break;
    case 'bars': { const bars = Math.max(1, Math.round(t * 4)); for (let i = 0; i < 4; i++) { ctx.globalAlpha = i < bars ? 1 : 0.22; const bh = (s * (i + 1)) / 4; ctx.fillRect(x + i * (s / 4) + 0.5, cy + h - bh, s / 4 - 1.2, bh); } ctx.globalAlpha = 1; break; }
    case 'x': ctx.arc(cx, cy, h * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - h * 0.4, cy - h * 0.4); ctx.lineTo(cx + h * 0.4, cy + h * 0.4); ctx.moveTo(cx + h * 0.4, cy - h * 0.4); ctx.lineTo(cx - h * 0.4, cy + h * 0.4); ctx.stroke(); break;
    case 'bang': ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h, cy + h * 0.85); ctx.lineTo(cx - h, cy + h * 0.85); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(cx - 0.8, cy - h * 0.35, 1.6, h * 0.65); break;
    case 'check': ctx.arc(cx, cy, h * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - h * 0.45, cy); ctx.lineTo(cx - h * 0.1, cy + h * 0.35); ctx.lineTo(cx + h * 0.5, cy - h * 0.35); ctx.stroke(); break;
  }
  ctx.restore();
}

// ── Painting ─────────────────────────────────────────────────────────────────

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const t = line + w;
      if (ctx.measureText(t).width <= maxW || !line) { line = t; continue; }
      out.push(line.trimEnd()); line = w.trimStart();
      // Break very long words.
      while (ctx.measureText(line).width > maxW && line.length > 1) {
        let k = line.length - 1; while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--;
        out.push(line.slice(0, k)); line = line.slice(k);
      }
    }
    out.push(line);
  }
  return out;
}

const BORDER_W: Record<string, number> = { thin: 1, hair: 1, dotted: 1, dashed: 1, medium: 2, mediumDashed: 2, dashDot: 1, mediumDashDot: 2, dashDotDot: 1, mediumDashDotDot: 2, slantDashDot: 2, thick: 3, double: 3 };
function dashOf(style: string, z: number): number[] {
  if (style === 'dotted' || style === 'hair') return [1 * z, 2 * z];
  if (style.includes('DashDotDot')) return [6 * z, 2 * z, 2 * z, 2 * z, 2 * z, 2 * z];
  if (style.includes('DashDot')) return [6 * z, 2 * z, 2 * z, 2 * z];
  if (style.includes('ashed')) return [4 * z, 2 * z];
  return [];
}

function isError(v: Scalar) { return v instanceof CellError; }

/** Paint everything. Returns nothing; pure drawing on `ctx`. */
export function paintGrid(p: PaintParams): Geometry {
  const { ctx, width: W, height: H, rows, cols, headerW, headerH, zoom, sheet, wb, reader, cf } = p;
  const g = geometry(p);
  ctx.save();
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  const regions: { x0: number; y0: number; x1: number; y1: number; rs: number[]; cs: number[] }[] = [
    { x0: headerW + g.FW, y0: headerH + g.FH, x1: W, y1: H, rs: g.visRows, cs: g.visCols },
    { x0: headerW + g.FW, y0: headerH, x1: W, y1: headerH + g.FH, rs: g.frozenRowList, cs: g.visCols },
    { x0: headerW, y0: headerH + g.FH, x1: headerW + g.FW, y1: H, rs: g.visRows, cs: g.frozenColList },
    { x0: headerW, y0: headerH, x1: headerW + g.FW, y1: headerH + g.FH, rs: g.frozenRowList, cs: g.frozenColList },
  ];
  for (const reg of regions) {
    if (!reg.rs.length || !reg.cs.length || reg.x1 <= reg.x0 || reg.y1 <= reg.y0) continue;
    ctx.save();
    ctx.beginPath(); ctx.rect(reg.x0, reg.y0, reg.x1 - reg.x0, reg.y1 - reg.y0); ctx.clip();
    paintCells(p, g, reg.rs, reg.cs, reg.x0, reg.x1);
    paintOverlays(p, g, reg);
    ctx.restore();
  }

  // Frozen separators.
  ctx.strokeStyle = THEME.frozenLine; ctx.lineWidth = 1.5;
  if (p.frozenRows > 0) { ctx.beginPath(); ctx.moveTo(0, headerH + g.FH + 0.5); ctx.lineTo(W, headerH + g.FH + 0.5); ctx.stroke(); }
  if (p.frozenCols > 0) { ctx.beginPath(); ctx.moveTo(headerW + g.FW + 0.5, 0); ctx.lineTo(headerW + g.FW + 0.5, H); ctx.stroke(); }

  paintHeaders(p, g);
  ctx.restore();
  void wb; void sheet; void reader; void cf; void zoom; void cols; void rows;
  return g;
}

function cellStyle(wb: Workbook, sheet: Sheet, r: number, c: number): CellStyle | undefined {
  const cell = getCell(sheet.cells, r, c);
  return cell?.s ? wb.styles[cell.s] : undefined;
}

function mergeLookup(merges: Rect[]) {
  if (!merges.length) return null;
  return (r: number, c: number) => merges.find(m => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) ?? null;
}

function paintCells(p: PaintParams, g: Geometry, rs: number[], cs: number[], clipX0: number, clipX1: number) {
  const { ctx, wb, sheet, reader, rows, cols, zoom, cf } = p;
  const mergeAt = mergeLookup(p.merges);
  const pad = 4 * zoom;
  const tableBand = (r: number, c: number): string | null => {
    for (const t of p.tables ?? []) {
      if (r < t.range.r1 || r > t.range.r2 || c < t.range.c1 || c > t.range.c2) continue;
      if (t.header && r === t.range.r1) return '#5A1F86';
      const k = r - t.range.r1 - (t.header ? 1 : 0);
      return k % 2 === 0 ? '#F1E8F8' : '#FFFFFF';
    }
    return null;
  };

  // 1) Fills + data bars.
  for (const r of rs) {
    const y = g.rowY(r), h = rows.sizeOf(r);
    for (const c of cs) {
      if (mergeAt?.(r, c)) continue;
      const x = g.colX(c), w = cols.sizeOf(c);
      const st = cellStyle(wb, sheet, r, c);
      const vis = cf.get(toA1(r, c));
      const fill = vis?.style?.fill?.color ?? vis?.scaleColor ?? st?.fill?.color ?? tableBand(r, c);
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
      if (vis?.dataBar) {
        const db = vis.dataBar; const bw = Math.max(0, (w - 4 * zoom) * Math.min(1, Math.abs(db.fraction)));
        if (db.gradient) {
          const gr = ctx.createLinearGradient(x + 2, 0, x + 2 + bw, 0);
          gr.addColorStop(0, db.negative ? '#E25454' : db.color); gr.addColorStop(1, 'rgba(255,255,255,0.25)');
          ctx.fillStyle = gr;
        } else ctx.fillStyle = db.negative ? '#E25454' : db.color;
        ctx.globalAlpha = 0.85; ctx.fillRect(x + 2 * zoom, y + 3 * zoom, bw, h - 6 * zoom); ctx.globalAlpha = 1;
        ctx.strokeStyle = db.negative ? '#C03030' : db.color; ctx.lineWidth = 1;
        ctx.strokeRect(x + 2 * zoom + 0.5, y + 3 * zoom + 0.5, Math.max(0, bw - 1), h - 6 * zoom - 1);
      }
    }
  }

  // 2) Gridlines.
  if (p.showGrid) {
    ctx.strokeStyle = THEME.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    const yTop = g.rowY(rs[0]), yBot = g.rowY(rs[rs.length - 1]) + rows.sizeOf(rs[rs.length - 1]);
    const xL = g.colX(cs[0]), xR = g.colX(cs[cs.length - 1]) + cols.sizeOf(cs[cs.length - 1]);
    for (const r of rs) { const y = Math.round(g.rowY(r) + rows.sizeOf(r)) - 0.5; ctx.moveTo(xL, y); ctx.lineTo(xR, y); }
    for (const c of cs) { const x = Math.round(g.colX(c) + cols.sizeOf(c)) - 0.5; ctx.moveTo(x, yTop); ctx.lineTo(x, yBot); }
    ctx.stroke();
  }

  // 3) Merged blocks: one background over their interior.
  const drawnMerges: Rect[] = [];
  if (mergeAt) {
    const rset = new Set(rs), cset = new Set(cs);
    for (const m of p.merges) {
      let hitR = false, hitC = false;
      for (let r = m.r1; r <= m.r2 && !hitR; r++) if (rset.has(r)) hitR = true;
      for (let c = m.c1; c <= m.c2 && !hitC; c++) if (cset.has(c)) hitC = true;
      if (!hitR || !hitC) continue;
      const rr = rangeRect(g, rows, cols, m);
      const st = cellStyle(wb, sheet, m.r1, m.c1);
      const vis = cf.get(toA1(m.r1, m.c1));
      ctx.fillStyle = vis?.style?.fill?.color ?? vis?.scaleColor ?? st?.fill?.color ?? THEME.bg;
      ctx.fillRect(rr.x, rr.y, rr.w - 1, rr.h - 1);
      if (p.showGrid) { ctx.strokeStyle = THEME.grid; ctx.strokeRect(rr.x - 0.5, rr.y - 0.5, rr.w, rr.h); }
      drawnMerges.push(m);
    }
  }

  // 4) Text, with Excel's horizontal overflow into empty neighbours.
  const editing = p.overlay.editing;
  const isEmptyAt = (r: number, c: number) => {
    if (mergeAt?.(r, c)) return false;
    const cell = getCell(sheet.cells, r, c);
    if (cell && (cell.v !== undefined || cell.f !== undefined)) return false;
    return reader.value(r, c) === null;
  };
  const lastCol = cs[cs.length - 1];
  for (const r of rs) {
    const y = g.rowY(r), h = rows.sizeOf(r);
    if (h <= 0) continue;
    // Start a few columns to the left so long text from off-screen cells still shows.
    const firstC = cs[0];
    const startC = Math.max(firstC < p.frozenCols ? 0 : p.frozenCols, firstC - 12);
    for (let c = startC; c <= lastCol; c++) {
      if (cols.sizeOf(c) === 0) continue;
      if (mergeAt?.(r, c)) continue;
      if (editing && editing.row === r && editing.col === c) continue;
      const v = reader.value(r, c);
      if (v === null || v === '') continue;
      drawCellText(p, g, r, c, v, g.colX(c), y, cols.sizeOf(c), h, { isEmptyAt, clipX0, clipX1, lastCol, firstVisible: firstC, pad });
    }
  }
  for (const m of drawnMerges) {
    if (editing && editing.row === m.r1 && editing.col === m.c1) continue;
    const v = reader.value(m.r1, m.c1);
    if (v === null || v === '') continue;
    const rr = rangeRect(g, rows, cols, m);
    drawCellText(p, g, m.r1, m.c1, v, rr.x, rr.y, rr.w, rr.h, { pad, merged: true });
  }

  // 5) Borders.
  for (const r of rs) for (const c of cs) {
    const st = cellStyle(wb, sheet, r, c);
    const vis = cf.get(toA1(r, c));
    const b = vis?.style?.borders ?? st?.borders;
    if (!b) continue;
    const m = mergeAt?.(r, c);
    const rr = m ? rangeRect(g, rows, cols, m) : { x: g.colX(c), y: g.rowY(r), w: cols.sizeOf(c), h: rows.sizeOf(r) };
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const bs = b[side]; if (!bs) continue;
      if (m && ((side === 'top' && r !== m.r1) || (side === 'bottom' && r !== m.r2) || (side === 'left' && c !== m.c1) || (side === 'right' && c !== m.c2))) continue;
      const lw = (BORDER_W[bs.style] ?? 1) * Math.max(1, zoom * 0.9);
      ctx.strokeStyle = bs.color ?? '#000000'; ctx.lineWidth = bs.style === 'double' ? 1 : lw;
      ctx.setLineDash(dashOf(bs.style, zoom));
      const draw = (off: number) => {
        ctx.beginPath();
        const o = (lw % 2 ? 0.5 : 0);
        if (side === 'top') { ctx.moveTo(rr.x - 1, rr.y - 0.5 + off + o); ctx.lineTo(rr.x + rr.w, rr.y - 0.5 + off + o); }
        if (side === 'bottom') { ctx.moveTo(rr.x - 1, rr.y + rr.h - 0.5 - off - o + (lw > 1 ? 0 : 0)); ctx.lineTo(rr.x + rr.w, rr.y + rr.h - 0.5 - off); }
        if (side === 'left') { ctx.moveTo(rr.x - 0.5 + off + o, rr.y - 1); ctx.lineTo(rr.x - 0.5 + off + o, rr.y + rr.h); }
        if (side === 'right') { ctx.moveTo(rr.x + rr.w - 0.5 - off, rr.y - 1); ctx.lineTo(rr.x + rr.w - 0.5 - off, rr.y + rr.h); }
        ctx.stroke();
      };
      if (bs.style === 'double') { draw(-1); draw(1.5); } else draw(0);
      ctx.setLineDash([]);
    }
  }

  // 6) Notes: little red corner triangles.
  for (const r of rs) for (const c of cs) {
    const cell = getCell(sheet.cells, r, c);
    if (!cell?.note) continue;
    const x = g.colX(c) + cols.sizeOf(c), y = g.rowY(r);
    ctx.fillStyle = '#D40055'; ctx.beginPath(); ctx.moveTo(x - 6 * zoom, y); ctx.lineTo(x - 1, y); ctx.lineTo(x - 1, y + 5 * zoom); ctx.closePath(); ctx.fill();
  }
}

interface TextOpts {
  isEmptyAt?: (r: number, c: number) => boolean;
  clipX0?: number; clipX1?: number; lastCol?: number; firstVisible?: number;
  pad: number; merged?: boolean;
}

function drawCellText(p: PaintParams, g: Geometry, r: number, c: number, v: Scalar, x: number, y: number, w: number, h: number, o: TextOpts) {
  const { ctx, wb, sheet, reader, cols, zoom, cf } = p;
  const st = cellStyle(wb, sheet, r, c);
  const vis = cf.get(toA1(r, c));
  const fmt = reader.numFmt?.(r, c) ?? st?.numFmt;
  const chars = Math.max(1, Math.floor((w - 2 * o.pad) / (7 * zoom)));
  const f: Formatted = formatValue(v, fmt, Math.max(chars, 2));
  if (vis?.dataBar && !vis.dataBar.showValue) return;
  if (vis?.icon && !vis.icon.showValue) {
    drawIcon(ctx, vis.icon.set, vis.icon.index, vis.icon.count, x + o.pad, y + h / 2, Math.min(14 * zoom, h - 6));
    return;
  }
  let text = f.text;
  if (!text) return;
  ctx.font = fontOf(st, zoom, vis?.style);
  const al = st?.align;
  const wrap = !!al?.wrap;
  const isNum = typeof v === 'number';
  let hAlign: 'left' | 'right' | 'center' = (al?.h === 'left' || al?.h === 'right' || al?.h === 'center') ? al.h : al?.h === 'centerContinuous' || al?.h === 'distributed' ? 'center' : f.align;
  if (typeof v === 'boolean' || isError(v)) hAlign = al?.h && al.h !== 'general' ? hAlign : 'center';
  const indent = (al?.indent ?? 0) * 9 * zoom;
  const iconW = vis?.icon ? 16 * zoom : 0;
  if (vis?.icon) drawIcon(ctx, vis.icon.set, vis.icon.index, vis.icon.count, x + o.pad, y + h / 2, Math.min(13 * zoom, h - 6));
  const avail = w - 2 * o.pad - indent - iconW;
  const color = vis?.style?.font?.color ?? f.color ?? st?.font?.color ?? (isError(v) ? THEME.error : THEME.text);
  ctx.fillStyle = color;

  // Accounting fill (e.g. "$ * #,##0"): pad the repeat char to the column width.
  if (f.fill && !wrap) {
    const ch = f.fill.char;
    const base = ctx.measureText(text).width;
    const cw = Math.max(1, ctx.measureText(ch).width);
    const n = Math.max(0, Math.floor((avail - base) / cw));
    text = text.slice(0, f.fill.index) + ch.repeat(n) + text.slice(f.fill.index);
    hAlign = 'left';
  }

  const fontPx = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '13');
  const vAlign = al?.v ?? 'bottom';
  const rotation = al?.rotation ?? 0;

  if (rotation) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const deg = rotation === 255 ? 90 : rotation > 90 ? -(rotation - 90) : rotation;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((-deg * Math.PI) / 180);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return;
  }

  if (wrap) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const lines = wrapLines(ctx, text, Math.max(4, avail));
    const lh = fontPx * 1.25;
    const total = lines.length * lh;
    let ty = vAlign === 'top' ? y + o.pad + fontPx : vAlign === 'center' ? y + (h - total) / 2 + fontPx : y + h - o.pad - total + fontPx - (lh - fontPx) / 2;
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      const tx = hAlign === 'right' ? x + w - o.pad - lw : hAlign === 'center' ? x + (w - lw) / 2 : x + o.pad + indent + iconW;
      ctx.fillText(line, tx, ty);
      decorate(ctx, st, vis?.style, tx, ty, lw, fontPx);
      ty += lh;
    }
    ctx.restore();
    return;
  }

  let tw = ctx.measureText(text).width;
  if (isNum && tw > avail + 1 && !o.merged) {
    // Excel: numbers never overflow; they become #### when they don't fit.
    const hw = Math.max(1, ctx.measureText('#').width);
    text = '#'.repeat(Math.max(1, Math.floor(avail / hw)));
    tw = ctx.measureText(text).width;
  }
  const ty = vAlign === 'top' ? y + o.pad + fontPx * 0.9 : vAlign === 'center' ? y + h / 2 + fontPx * 0.35 : y + h - Math.max(4 * zoom, (h - fontPx) * 0.32);

  // Overflow span.
  let x0 = x, x1 = x + w;
  if (!isNum && tw > avail && o.isEmptyAt && !o.merged) {
    if (hAlign === 'left' || hAlign === 'center') {
      let cc = c + 1; let need = tw - avail - (hAlign === 'center' ? (tw - avail) / 2 : 0);
      while (need > 0 && cc < cols.count && o.isEmptyAt(r, cc)) { x1 += cols.sizeOf(cc); need -= cols.sizeOf(cc); cc++; if (cc > (o.lastCol ?? cc) + 30) break; }
    }
    if (hAlign === 'right' || hAlign === 'center') {
      let cc = c - 1; let need = hAlign === 'center' ? (tw - avail) / 2 : tw - avail;
      while (need > 0 && cc >= 0 && o.isEmptyAt(r, cc)) { x0 -= cols.sizeOf(cc); need -= cols.sizeOf(cc); cc--; }
    }
  }
  // Skip cells whose (possibly overflowed) text can't reach the visible area.
  if (o.clipX0 !== undefined && x1 < o.clipX0) return;
  if (x1 > x + w || x0 < x) {
    // Hide the gridlines the overflowing text crosses.
    ctx.fillStyle = THEME.bg;
    for (let cc = c + 1, xx = x + w; xx < x1 - 1; cc++) { const fillC = cellStyle(wb, sheet, r, cc)?.fill?.color; ctx.fillStyle = fillC ?? THEME.bg; ctx.fillRect(xx - 1.5, y, 2, h - 1); xx += cols.sizeOf(cc); }
    for (let cc = c - 1, xx = x; xx > x0 + 1; cc--) { const fillC = cellStyle(wb, sheet, r, cc)?.fill?.color; ctx.fillStyle = fillC ?? THEME.bg; ctx.fillRect(xx - 1.5, y, 2, h - 1); xx -= cols.sizeOf(cc); }
    ctx.fillStyle = color;
  }
  const spanW = x1 - x0;
  let tx: number;
  if (hAlign === 'right') tx = x1 - o.pad - tw;
  else if (hAlign === 'center') tx = x0 + (spanW - tw) / 2;
  else tx = x0 + o.pad + indent + iconW;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0 + 1, y, spanW - 2, h); ctx.clip();
  ctx.fillText(text, tx, ty);
  decorate(ctx, st, vis?.style, tx, ty, tw, fontPx);
  ctx.restore();
  void g;
}

function decorate(ctx: CanvasRenderingContext2D, st: CellStyle | undefined, cfSt: CellStyle | undefined, x: number, y: number, w: number, fontPx: number) {
  const f = { ...(st?.font ?? {}), ...(cfSt?.font ?? {}) };
  if (!f.underline && !f.strike) return;
  ctx.save(); ctx.strokeStyle = ctx.fillStyle as string; ctx.lineWidth = Math.max(1, fontPx / 14);
  if (f.underline) { ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + w, y + 2); ctx.stroke(); if (f.underline === 'double') { ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + w, y + 4); ctx.stroke(); } }
  if (f.strike) { ctx.beginPath(); ctx.moveTo(x, y - fontPx * 0.3); ctx.lineTo(x + w, y - fontPx * 0.3); ctx.stroke(); }
  ctx.restore();
}

function strokeRange(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, color: string, lw: number, dash: number[] = [], offset = 0) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.lineDashOffset = offset;
  ctx.strokeRect(r.x - 0.5 + lw / 2 - 1, r.y - 0.5 + lw / 2 - 1, r.w - lw + 2, r.h - lw + 2);
  ctx.restore();
}

function paintOverlays(p: PaintParams, g: Geometry, reg: { x0: number; y0: number; x1: number; y1: number }) {
  const { ctx, rows, cols, selection, overlay, zoom } = p;
  void reg;
  // Find hits.
  if (overlay.findHits?.size) {
    ctx.fillStyle = 'rgba(255,196,0,0.35)';
    for (const a1 of overlay.findHits) {
      const m = a1.match(/^([A-Z]+)(\d+)$/); if (!m) continue;
      let col = 0; for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64; col--;
      const row = +m[2] - 1;
      const rr = rangeRect(g, rows, cols, { r1: row, c1: col, r2: row, c2: col });
      ctx.fillRect(rr.x, rr.y, rr.w - 1, rr.h - 1);
    }
  }
  // Selection tint (excluding the active cell) and borders.
  const act = selection.active;
  const multi = selection.ranges.length > 1;
  for (const r of selection.ranges) {
    const rr = rangeRect(g, rows, cols, r);
    ctx.fillStyle = THEME.selFill;
    ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
  }
  const ar = rangeRect(g, rows, cols, mergeOfActive(p) ?? { r1: act.row, c1: act.col, r2: act.row, c2: act.col });
  // Un-tint the active cell (Excel shows it white).
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  for (const [i, r] of selection.ranges.entries()) {
    const rr = rangeRect(g, rows, cols, r);
    const last = i === selection.ranges.length - 1;
    strokeRange(ctx, rr, THEME.sel, multi && !last ? 1 : 2);
  }
  // Active cell outline.
  strokeRange(ctx, ar, THEME.sel, 2);
  // Fill handle.
  if (!multi && !p.readOnly) {
    const lr = rangeRect(g, rows, cols, selection.ranges[0]);
    const s = 6 * Math.max(1, zoom * 0.9);
    ctx.fillStyle = THEME.sel; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    ctx.fillRect(lr.x + lr.w - s / 2 - 1, lr.y + lr.h - s / 2 - 1, s, s);
    ctx.strokeRect(lr.x + lr.w - s / 2 - 1.5, lr.y + lr.h - s / 2 - 1.5, s + 1, s + 1);
  }
  // Spill outline.
  if (overlay.spill) strokeRange(ctx, rangeRect(g, rows, cols, overlay.spill), THEME.spill, 1, [4, 3]);
  // Formula reference highlights.
  for (const ref of overlay.refs) {
    if (!ref.sheetMatch) continue;
    const rr = rangeRect(g, rows, cols, ref.range);
    ctx.fillStyle = hexA(ref.color, 0.08); ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
    strokeRange(ctx, rr, ref.color, 2);
    const k = 5;
    ctx.fillStyle = ref.color;
    for (const [cx, cy] of [[rr.x, rr.y], [rr.x + rr.w, rr.y], [rr.x, rr.y + rr.h], [rr.x + rr.w, rr.y + rr.h]]) ctx.fillRect(cx - k / 2 - 1, cy - k / 2 - 1, k, k);
  }
  if (overlay.fillPreview) strokeRange(ctx, rangeRect(g, rows, cols, overlay.fillPreview), '#5A4F6B', 1, [3, 2]);
  if (overlay.movePreview) strokeRange(ctx, rangeRect(g, rows, cols, overlay.movePreview), '#5A4F6B', 2, [5, 3]);
  if (overlay.copy) strokeRange(ctx, rangeRect(g, rows, cols, overlay.copy), THEME.copy, 2, [5, 4], -(overlay.copyPhase ?? 0));
  // Trace precedents / dependents arrows.
  for (const t of overlay.traces ?? []) {
    const a = rangeRect(g, rows, cols, t.from), b = rangeRect(g, rows, cols, t.to);
    const ax = a.x + Math.min(a.w, 40) / 2 + 4, ay = a.y + Math.min(a.h, 24) / 2, bx = b.x + 8, by = b.y + b.h / 2;
    ctx.save(); ctx.strokeStyle = t.color; ctx.fillStyle = t.color; ctx.lineWidth = 1.5;
    if (a.w > 40 || a.h > 26) { ctx.globalAlpha = 0.6; ctx.strokeRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2); ctx.globalAlpha = 1; }
    ctx.beginPath(); ctx.arc(ax, ay, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    const ang = Math.atan2(by - ay, bx - ax);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 9 * Math.cos(ang - 0.4), by - 9 * Math.sin(ang - 0.4)); ctx.lineTo(bx - 9 * Math.cos(ang + 0.4), by - 9 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // Filter buttons.
  if (p.filter) {
    const f = p.filter;
    for (let c = f.c1; c <= f.c2; c++) {
      if (cols.sizeOf(c) === 0) continue;
      const rr = rangeRect(g, rows, cols, { r1: f.row, c1: c, r2: f.row, c2: c });
      drawFilterButton(ctx, rr.x + rr.w - 18 * zoom, rr.y + (rr.h - 16 * zoom) / 2, 16 * zoom, f.active.has(c));
    }
  }
}

export function drawFilterButton(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, active: boolean) {
  ctx.save();
  ctx.fillStyle = active ? '#EFE3F8' : '#FFFFFF'; ctx.strokeStyle = active ? '#7A1FB0' : '#B9AFC8'; ctx.lineWidth = 1;
  ctx.fillRect(x, y, s, s); ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  ctx.fillStyle = active ? '#7A1FB0' : '#5A4F6B';
  if (active) { ctx.beginPath(); ctx.moveTo(x + s * 0.22, y + s * 0.28); ctx.lineTo(x + s * 0.78, y + s * 0.28); ctx.lineTo(x + s * 0.56, y + s * 0.52); ctx.lineTo(x + s * 0.56, y + s * 0.78); ctx.lineTo(x + s * 0.44, y + s * 0.72); ctx.lineTo(x + s * 0.44, y + s * 0.52); ctx.closePath(); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(x + s * 0.28, y + s * 0.4); ctx.lineTo(x + s * 0.72, y + s * 0.4); ctx.lineTo(x + s * 0.5, y + s * 0.66); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

function mergeOfActive(p: PaintParams): Rect | null {
  const a = p.selection.active;
  return p.merges.find(m => a.row >= m.r1 && a.row <= m.r2 && a.col >= m.c1 && a.col <= m.c2) ?? null;
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function colName(c: number): string { let s = ''; let n = c; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }

function paintHeaders(p: PaintParams, g: Geometry) {
  const { ctx, width: W, height: H, rows, cols, headerW, headerH, zoom, selection } = p;
  const sel = selection.ranges;
  const maxR = rows.count - 1, maxC = cols.count - 1;
  const colSel = (c: number) => sel.some(r => c >= r.c1 && c <= r.c2);
  const rowSel = (r: number) => sel.some(x => r >= x.r1 && r <= x.r2);
  const colFull = (c: number) => sel.some(r => c >= r.c1 && c <= r.c2 && r.r1 === 0 && r.r2 >= maxR);
  const rowFull = (r: number) => sel.some(x => r >= x.r1 && r <= x.r2 && x.c1 === 0 && x.c2 >= maxC);
  ctx.font = `600 ${Math.round(11 * zoom * 10) / 10}px ${FONT_STACK}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // Column header.
  ctx.fillStyle = THEME.header; ctx.fillRect(0, 0, W, headerH);
  const drawCol = (c: number) => {
    const x = g.colX(c), w = cols.sizeOf(c);
    if (colSel(c)) { ctx.fillStyle = colFull(c) ? THEME.headerAll : THEME.headerSel; ctx.fillRect(x, 0, w, headerH); }
    ctx.fillStyle = colSel(c) ? THEME.headerTextSel : THEME.headerText;
    if (w > 10) ctx.fillText(colName(c), x + w / 2, headerH / 2 + 0.5);
    ctx.fillStyle = THEME.headerLine; ctx.fillRect(Math.round(x + w) - 1, 0, 1, headerH);
    if (colSel(c)) { ctx.fillStyle = THEME.sel; ctx.fillRect(x, headerH - 2, w, 2); }
  };
  ctx.save(); ctx.beginPath(); ctx.rect(headerW + g.FW, 0, W - headerW - g.FW, headerH); ctx.clip();
  for (const c of g.visCols) drawCol(c);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(headerW, 0, g.FW, headerH); ctx.clip();
  for (const c of g.frozenColList) drawCol(c);
  ctx.restore();
  // Hidden-column markers.
  ctx.fillStyle = THEME.sel;
  for (const c of [...g.frozenColList, ...g.visCols]) if (c > 0 && cols.isHidden(c - 1)) { ctx.fillRect(g.colX(c) - 1, 3, 2, headerH - 6); }

  // Row header.
  ctx.fillStyle = THEME.header; ctx.fillRect(0, headerH, headerW, H - headerH);
  const drawRow = (r: number) => {
    const y = g.rowY(r), h = rows.sizeOf(r);
    if (rowSel(r)) { ctx.fillStyle = rowFull(r) ? THEME.headerAll : THEME.headerSel; ctx.fillRect(0, y, headerW, h); }
    ctx.fillStyle = rowSel(r) ? THEME.headerTextSel : THEME.headerText;
    if (h > 8) ctx.fillText(String(r + 1), headerW / 2, y + h / 2 + 0.5);
    ctx.fillStyle = THEME.headerLine; ctx.fillRect(0, Math.round(y + h) - 1, headerW, 1);
    if (rowSel(r)) { ctx.fillStyle = THEME.sel; ctx.fillRect(headerW - 2, y, 2, h); }
  };
  ctx.save(); ctx.beginPath(); ctx.rect(0, headerH + g.FH, headerW, H - headerH - g.FH); ctx.clip();
  for (const r of g.visRows) drawRow(r);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(0, headerH, headerW, g.FH); ctx.clip();
  for (const r of g.frozenRowList) drawRow(r);
  ctx.restore();
  ctx.fillStyle = THEME.sel;
  for (const r of [...g.frozenRowList, ...g.visRows]) if (r > 0 && rows.isHidden(r - 1)) ctx.fillRect(3, g.rowY(r) - 1, headerW - 6, 2);

  // Corner (select all).
  ctx.fillStyle = THEME.header; ctx.fillRect(0, 0, headerW, headerH);
  ctx.fillStyle = '#C9C0D6';
  ctx.beginPath(); ctx.moveTo(headerW - 4, headerH - 4); ctx.lineTo(headerW - 4, headerH - 13 * zoom); ctx.lineTo(headerW - 13 * zoom, headerH - 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = THEME.headerLine;
  ctx.fillRect(0, headerH - 1, W, 1); ctx.fillRect(headerW - 1, 0, 1, H);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

/** Width needed to show a column's content (double-click auto-fit). */
export function measureColumn(ctx: CanvasRenderingContext2D, wb: Workbook, sheet: Sheet, reader: CellReader, col: number, rowsToCheck: number[], zoom = 1): number {
  let best = 0;
  for (const r of rowsToCheck) {
    const v = reader.value(r, col); if (v === null || v === '') continue;
    const st = cellStyle(wb, sheet, r, col);
    if (st?.align?.wrap) continue;
    ctx.font = fontOf(st, zoom);
    const f = formatValue(v, reader.numFmt?.(r, col) ?? st?.numFmt, 255);
    best = Math.max(best, ctx.measureText(f.text).width + 12 * zoom + (st?.align?.indent ?? 0) * 9);
  }
  return best;
}
/** Height needed for a row (wrapped text / large fonts). */
export function measureRow(ctx: CanvasRenderingContext2D, wb: Workbook, sheet: Sheet, reader: CellReader, row: number, colsToCheck: number[], colWidth: (c: number) => number): number {
  let best = 0;
  for (const c of colsToCheck) {
    const v = reader.value(row, c); if (v === null || v === '') continue;
    const st = cellStyle(wb, sheet, row, c);
    ctx.font = fontOf(st, 1);
    const px = (st?.font?.size ?? 11) * 1.22;
    const f = formatValue(v, reader.numFmt?.(row, c) ?? st?.numFmt, 255);
    const lines = st?.align?.wrap ? wrapLines(ctx, f.text, Math.max(4, colWidth(c) - 8)).length : 1;
    best = Math.max(best, lines * px * 1.25 + 8);
  }
  return best;
}
