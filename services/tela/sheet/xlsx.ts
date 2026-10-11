// xlsx — OOXML SpreadsheetML import/export (fflate for the zip container).
//
// Import: every sheet; values and cached results; formulas incl. shared
// formulas (re-anchored per cell), array/dynamic-array anchors (spilled cache
// cells are dropped so our engine re-spills them); styles (numFmts, fonts,
// fills, borders, alignment, protection; theme + indexed colours resolved);
// merges, column widths, row heights, hidden rows/cols, frozen panes, tab
// colour, gridlines, defined names, tables, conditional formats (dxf
// styles), data validation, autofilter, hyperlinks and notes.
//
// Export: a minimal but standards-ordered package — [Content_Types],
// relationships, workbook (+ definedNames, calcPr fullCalcOnLoad), styles,
// sharedStrings, worksheets, tables, and metadata.xml so dynamic-array
// formulas open as spills (not legacy CSE) in Excel 365. Future functions
// are written with their _xlfn. prefix, LET/LAMBDA parameters with _xlpm.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { MAX_COLS, MAX_ROWS, parseA1, parseRange, toA1 } from './address';
import { mapNode, walk, type Node } from './ast';
import type { SheetEngine } from './engine';
import {
  cellEntriesA1, clean, createSheet, getCell, internStyle, newId, type CellGrid,
  type BorderSide, type BorderStyle, type Cell, type CellStyle, type CfValueObject, type ConditionalFormat, type ConditionalRule,
  type DataValidation, type DefinedName, type IconSetName, type Sheet, type Workbook,
} from './model';
import { BUILTIN_FORMATS, isDateFormat } from './numfmt';
import { parseFormula } from './parser';
import { shiftRelative, toFormula } from './serialize';
import { CellError, type Scalar } from './values';
import { allText, child, childrenOf, escapeXml, parseXml, type XNode } from './xml';

// ── Colours ──────────────────────────────────────────────────────────────────

const INDEXED = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080',
  '#9999FF', '#993366', '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF', '#000080', '#FF00FF', '#FFFF00', '#00FFFF', '#800080', '#800000', '#008080', '#0000FF',
  '#00CCFF', '#CCFFFF', '#CCFFCC', '#FFFF99', '#99CCFF', '#FF99CC', '#CC99FF', '#FFCC99', '#3366FF', '#33CCCC', '#99CC00', '#FFCC00', '#FF9900', '#FF6600', '#666699', '#969696',
  '#003366', '#339966', '#003300', '#333300', '#993300', '#993366', '#333399', '#333333', '#000000', '#FFFFFF'];
const DEFAULT_THEME = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#0563C1', '#954F72'];

function applyTint(hexc: string, tint: number): string {
  if (!tint) return hexc;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hexc.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  let rr: number, gg: number, bb: number;
  if (s === 0) rr = gg = bb = l;
  else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; rr = hue(p, q, h + 1 / 3); gg = hue(p, q, h); bb = hue(p, q, h - 1 / 3); }
  return '#' + [rr, gg, bb].map(x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function colorOf(n: XNode | undefined, theme: string[]): string | undefined {
  if (!n) return undefined;
  const a = n.attrs;
  let c: string | undefined;
  if (a.rgb) c = '#' + (a.rgb.length === 8 ? a.rgb.slice(2) : a.rgb).toUpperCase();
  else if (a.theme !== undefined) c = theme[Number(a.theme)];
  else if (a.indexed !== undefined) c = INDEXED[Number(a.indexed)];
  else if (a.auto) return undefined;
  if (c && a.tint) c = applyTint(c, Number(a.tint));
  return c;
}
const rgbAttr = (c: string) => `FF${c.replace('#', '').toUpperCase().padStart(6, '0').slice(-6)}`;

// ── Import ───────────────────────────────────────────────────────────────────

export interface XlsxImportResult { workbook: Workbook; warnings: string[] }

const pxFromChars = (w: number) => Math.round(w * 7 + 5);
const charsFromPx = (px: number) => Math.max(0, Math.round(((px - 5) / 7) * 100) / 100);
const pxFromPt = (pt: number) => Math.round((pt * 4) / 3);
const ptFromPx = (px: number) => Math.round(px * 0.75 * 100) / 100;

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
}
function relsFor(files: Record<string, Uint8Array>, part: string): Map<string, { target: string; type: string; external: boolean }> {
  const dir = part.split('/'); const file = dir.pop()!;
  const relPath = [...dir, '_rels', file + '.rels'].join('/');
  const out = new Map<string, { target: string; type: string; external: boolean }>();
  const f = files[relPath]; if (!f) return out;
  for (const r of parseXml(strFromU8(f)).children) {
    if (r.name !== 'Relationship') continue;
    const ext = r.attrs.TargetMode === 'External';
    out.set(r.attrs.Id, { target: ext ? r.attrs.Target : resolvePath(part, r.attrs.Target), type: r.attrs.Type ?? '', external: ext });
  }
  return out;
}

/** Normalize an OOXML formula: strip _xlfn./_xlws./_xlpm. and turn _xlfn.SINGLE(x) into @x. */
function normalizeImportedFormula(f: string): string {
  const pre = f.replace(/_xlfn\._xlws\.|_xlfn\.|_xlws\.|_xlpm\./gi, '');
  try {
    const ast = mapNode(parseFormula(pre), n => (n.t === 'call' && n.name === 'SINGLE' && n.args.length === 1 ? { t: 'unary', op: '@', a: n.args[0] } : n));
    return toFormula(ast);
  } catch { return pre; }
}

export function importXlsx(data: ArrayBuffer | Uint8Array): XlsxImportResult {
  const files = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : '');
  const warnings: string[] = [];
  const rootRels = relsFor(files, '');
  let wbPath = 'xl/workbook.xml';
  for (const r of rootRels.values()) if (/officeDocument$/.test(r.type)) wbPath = r.target;
  const wbXml = parseXml(read(wbPath));
  const wbRels = relsFor(files, wbPath);
  const relOfType = (t: string) => [...wbRels.values()].find(r => r.type.endsWith('/' + t))?.target;

  // Theme colours.
  const theme = DEFAULT_THEME.slice();
  const themePath = relOfType('theme');
  if (themePath && files[themePath]) {
    const t = parseXml(read(themePath));
    const scheme = findDeep(t, 'clrScheme');
    if (scheme) {
      const get = (name: string) => { const n = child(scheme, name); const c = n?.children[0]; return c ? '#' + (c.attrs.lastClr ?? c.attrs.val ?? '000000').toUpperCase() : undefined; };
      const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
      order.forEach((nm, i) => { const c = get(nm); if (c) theme[i] = c; });
    }
  }

  // Shared strings.
  const shared: string[] = [];
  const ssPath = relOfType('sharedStrings') ?? 'xl/sharedStrings.xml';
  if (files[ssPath]) for (const si of parseXml(read(ssPath)).children) if (si.name === 'si') shared.push(allText(si));

  // Styles → Workbook.styles; xf index → style id.
  const styles: CellStyle[] = [{}];
  const xfMap: number[] = [];
  const dxfs: CellStyle[] = [];
  const numFmts: Record<number, string> = { ...BUILTIN_FORMATS };
  const stPath = relOfType('styles') ?? 'xl/styles.xml';
  if (files[stPath]) {
    const st = parseXml(read(stPath));
    for (const nf of childrenOf(child(st, 'numFmts'), 'numFmt')) numFmts[Number(nf.attrs.numFmtId)] = nf.attrs.formatCode;
    const fonts = childrenOf(child(st, 'fonts'), 'font').map(f => readFont(f, theme));
    const fills = childrenOf(child(st, 'fills'), 'fill').map(f => readFill(f, theme));
    const borders = childrenOf(child(st, 'borders'), 'border').map(b => readBorder(b, theme));
    const baseFont = fonts[0] ?? {};
    for (const xf of childrenOf(child(st, 'cellXfs'), 'xf')) {
      const s: CellStyle = {};
      const nid = Number(xf.attrs.numFmtId ?? 0);
      if (nid && numFmts[nid] && numFmts[nid] !== 'General') s.numFmt = numFmts[nid];
      const font = fonts[Number(xf.attrs.fontId ?? 0)];
      if (font) { const diff = fontDiff(font, baseFont); if (diff) s.font = diff; }
      const fill = fills[Number(xf.attrs.fillId ?? 0)]; if (fill) s.fill = fill;
      const border = borders[Number(xf.attrs.borderId ?? 0)]; if (border) s.borders = border;
      const al = child(xf, 'alignment');
      if (al) {
        const a: NonNullable<CellStyle['align']> = {};
        if (al.attrs.horizontal) a.h = al.attrs.horizontal as 'left';
        if (al.attrs.vertical) a.v = al.attrs.vertical as 'top';
        if (al.attrs.wrapText === '1' || al.attrs.wrapText === 'true') a.wrap = true;
        if (al.attrs.indent) a.indent = Number(al.attrs.indent);
        if (al.attrs.textRotation) a.rotation = Number(al.attrs.textRotation);
        if (al.attrs.shrinkToFit === '1') a.shrink = true;
        if (Object.keys(a).length) s.align = a;
      }
      const pr = child(xf, 'protection');
      if (pr) { const p: NonNullable<CellStyle['protection']> = {}; if (pr.attrs.locked === '0') p.locked = false; if (pr.attrs.hidden === '1') p.hidden = true; if (Object.keys(p).length) s.protection = p; }
      xfMap.push(internStyle(styles, s));
    }
    for (const d of childrenOf(child(st, 'dxfs'), 'dxf')) {
      const s: CellStyle = {};
      const f = child(d, 'font'); if (f) { const ff = readFont(f, theme); if (Object.keys(ff).length) s.font = ff; }
      const fl = child(d, 'fill'); if (fl) { const pf = child(fl, 'patternFill'); const c = colorOf(child(pf, 'bgColor'), theme) ?? colorOf(child(pf, 'fgColor'), theme); if (c) s.fill = { color: c }; }
      const b = child(d, 'border'); if (b) { const bb = readBorder(b, theme); if (bb) s.borders = bb; }
      const nf = child(d, 'numFmt'); if (nf) s.numFmt = nf.attrs.formatCode;
      dxfs.push(clean(s));
    }
  }

  const date1904 = child(wbXml, 'workbookPr')?.attrs.date1904 === '1' || child(wbXml, 'workbookPr')?.attrs.date1904 === 'true';
  if (date1904) warnings.push('1904 date system converted to 1900 serials.');

  const sheetsX = childrenOf(child(wbXml, 'sheets'), 'sheet');
  const sheets: Sheet[] = [];
  const sheetIdByIndex: string[] = [];
  sheetsX.forEach((sx, si) => {
    const rel = wbRels.get(sx.attrs['r:id']);
    const sh = createSheet(sx.attrs.name, newId('sh'));
    delete sh.rowCount; delete sh.colCount;
    if (sx.attrs.state === 'hidden' || sx.attrs.state === 'veryHidden') sh.hidden = true;
    sheetIdByIndex[si] = sh.id;
    sheets.push(sh);
    if (!rel || !files[rel.target]) { warnings.push(`Sheet ${sx.attrs.name} has no worksheet part (chart sheet?).`); return; }
    readWorksheet(files, rel.target, sh, { shared, xfMap, styles, dxfs, theme, date1904, warnings });
  });

  // Defined names (skip Excel's built-in _xlnm.*).
  const names: DefinedName[] = [];
  for (const dn of childrenOf(child(wbXml, 'definedNames'), 'definedName')) {
    const nm = dn.attrs.name;
    if (!nm || nm.startsWith('_xlnm.')) continue;
    const d: DefinedName = { name: nm, ref: normalizeImportedFormula(dn.text.trim()) };
    if (dn.attrs.localSheetId !== undefined) d.sheetId = sheetIdByIndex[Number(dn.attrs.localSheetId)];
    if (dn.attrs.comment) d.comment = dn.attrs.comment;
    names.push(clean(d));
  }
  const activeTab = Number(child(child(wbXml, 'bookViews'), 'workbookView')?.attrs.activeTab ?? 0);
  const calcPr = child(wbXml, 'calcPr');
  const wb: Workbook = { version: 1, sheets, names, styles, activeSheet: sheets[activeTab]?.id ?? sheets[0]?.id ?? '' };
  if (calcPr?.attrs.iterate === '1' || calcPr?.attrs.iterate === 'true') wb.calc = clean({ iterative: true, maxIterations: calcPr.attrs.iterateCount ? Number(calcPr.attrs.iterateCount) : undefined, maxChange: calcPr.attrs.iterateDelta ? Number(calcPr.attrs.iterateDelta) : undefined });
  if (!sheets.length) { const s = createSheet('Sheet1'); wb.sheets = [s]; wb.activeSheet = s.id; }
  return { workbook: wb, warnings };
}

function findDeep(n: XNode, name: string): XNode | undefined {
  if (n.name === name) return n;
  for (const c of n.children) { const f = findDeep(c, name); if (f) return f; }
  return undefined;
}
function readFont(f: XNode, theme: string[]): NonNullable<CellStyle['font']> {
  const o: NonNullable<CellStyle['font']> = {};
  const on = (n?: XNode) => !!n && n.attrs.val !== '0' && n.attrs.val !== 'false';
  if (on(child(f, 'b'))) o.bold = true;
  if (on(child(f, 'i'))) o.italic = true;
  if (on(child(f, 'strike'))) o.strike = true;
  const u = child(f, 'u'); if (u && u.attrs.val !== 'none') o.underline = u.attrs.val === 'double' ? 'double' : true;
  const sz = child(f, 'sz'); if (sz) o.size = Number(sz.attrs.val);
  const c = colorOf(child(f, 'color'), theme); if (c) o.color = c;
  const nm = child(f, 'name'); if (nm) o.family = nm.attrs.val;
  return o;
}
function fontDiff(f: NonNullable<CellStyle['font']>, base: NonNullable<CellStyle['font']>) {
  const o: NonNullable<CellStyle['font']> = {};
  if (f.bold) o.bold = true; if (f.italic) o.italic = true; if (f.strike) o.strike = true; if (f.underline) o.underline = f.underline;
  if (f.size && f.size !== base.size) o.size = f.size;
  if (f.family && f.family !== base.family) o.family = f.family;
  if (f.color && f.color !== base.color && f.color !== '#000000') o.color = f.color;
  return Object.keys(o).length ? o : undefined;
}
function readFill(f: XNode, theme: string[]): CellStyle['fill'] | undefined {
  const pf = child(f, 'patternFill');
  if (pf && pf.attrs.patternType && pf.attrs.patternType !== 'none' && pf.attrs.patternType !== 'gray125') {
    const c = colorOf(child(pf, 'fgColor'), theme) ?? colorOf(child(pf, 'bgColor'), theme);
    if (c) return { color: c };
  }
  const gf = child(f, 'gradientFill');
  if (gf) { const stop = child(gf, 'stop'); const c = colorOf(child(stop, 'color'), theme); if (c) return { color: c }; }
  return undefined;
}
function readBorder(b: XNode, theme: string[]): CellStyle['borders'] | undefined {
  const o: NonNullable<CellStyle['borders']> = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const n = child(b, side);
    if (n?.attrs.style) { const s: BorderSide = { style: n.attrs.style as BorderStyle }; const c = colorOf(child(n, 'color'), theme); if (c) s.color = c; o[side] = s; }
  }
  return Object.keys(o).length ? o : undefined;
}

interface SheetCtx { shared: string[]; xfMap: number[]; styles: CellStyle[]; dxfs: CellStyle[]; theme: string[]; date1904: boolean; warnings: string[] }

function readWorksheet(files: Record<string, Uint8Array>, path: string, sh: Sheet, ctx: SheetCtx) {
  const ws = parseXml(strFromU8(files[path]));
  const rels = relsFor(files, path);
  const tab = child(child(ws, 'sheetPr'), 'tabColor'); const tc = colorOf(tab, ctx.theme); if (tc) sh.tabColor = tc;
  const view = child(child(ws, 'sheetViews'), 'sheetView');
  if (view?.attrs.showGridLines === '0' || view?.attrs.showGridLines === 'false') sh.showGridLines = false;
  const pane = child(view, 'pane');
  if (pane && (pane.attrs.state === 'frozen' || pane.attrs.state === 'frozenSplit')) sh.freeze = { rows: Number(pane.attrs.ySplit ?? 0), cols: Number(pane.attrs.xSplit ?? 0) };
  const fmt = child(ws, 'sheetFormatPr');
  if (fmt?.attrs.defaultColWidth) sh.defaultColWidth = pxFromChars(Number(fmt.attrs.defaultColWidth));
  else if (fmt?.attrs.baseColWidth) sh.defaultColWidth = pxFromChars(Number(fmt.attrs.baseColWidth) + 0.71);
  if (fmt?.attrs.defaultRowHeight) sh.defaultRowHeight = pxFromPt(Number(fmt.attrs.defaultRowHeight));
  const colWidths: Record<string, number> = {}; const hiddenCols: number[] = []; const colStyle: Record<number, number> = {};
  for (const c of childrenOf(child(ws, 'cols'), 'col')) {
    const min = Number(c.attrs.min) - 1, max = Math.min(Number(c.attrs.max) - 1, MAX_COLS - 1, min + 2000);
    for (let i = min; i <= max; i++) {
      const defChars = Number(fmt?.attrs.defaultColWidth ?? 8.43);
      if (c.attrs.width && (c.attrs.customWidth === '1' || c.attrs.customWidth === 'true' || Math.abs(Number(c.attrs.width) - defChars) > 0.02)) colWidths[i] = pxFromChars(Number(c.attrs.width));
      if (c.attrs.hidden === '1' || c.attrs.hidden === 'true') hiddenCols.push(i);
      if (c.attrs.style) colStyle[i] = Number(c.attrs.style);
    }
  }
  if (Object.keys(colWidths).length) sh.colWidths = colWidths;
  if (hiddenCols.length) sh.hiddenCols = hiddenCols;
  const rowHeights: Record<string, number> = {}; const hiddenRows: number[] = [];
  const cells: CellGrid = {};
  const sharedMasters = new Map<string, { f: string; row: number; col: number }>();
  const arrayAreas: { r1: number; c1: number; r2: number; c2: number; row: number; col: number }[] = [];
  const isDateStyle = (sid: number | undefined) => sid !== undefined && isDateFormat(ctx.styles[sid]?.numFmt);
  let autoRow = 0;
  for (const rowX of childrenOf(child(ws, 'sheetData'), 'row')) {
    const r = rowX.attrs.r ? Number(rowX.attrs.r) - 1 : autoRow;
    autoRow = r + 1;
    if (rowX.attrs.ht && (rowX.attrs.customHeight === '1' || rowX.attrs.customHeight === 'true')) rowHeights[r] = pxFromPt(Number(rowX.attrs.ht));
    if (rowX.attrs.hidden === '1' || rowX.attrs.hidden === 'true') hiddenRows.push(r);
    let autoCol = 0;
    for (const cX of rowX.children) {
      if (cX.name !== 'c') continue;
      const addr = cX.attrs.r ? parseA1(cX.attrs.r) : { row: r, col: autoCol };
      if (!addr) continue;
      autoCol = addr.col + 1;
      const a1 = toA1(addr.row, addr.col);
      const cell: Cell = {};
      const sAttr = cX.attrs.s !== undefined ? ctx.xfMap[Number(cX.attrs.s)] : colStyle[addr.col] !== undefined ? ctx.xfMap[colStyle[addr.col]] : undefined;
      if (sAttr) cell.s = sAttr;
      const t = cX.attrs.t ?? 'n';
      const vX = child(cX, 'v');
      const fX = child(cX, 'f');
      let value: Scalar | undefined;
      if (t === 's') value = vX ? ctx.shared[Number(vX.text)] ?? '' : undefined;
      else if (t === 'inlineStr') { const is = child(cX, 'is'); value = is ? allText(is) : ''; }
      else if (t === 'str') value = vX ? vX.text : '';
      else if (t === 'b') value = vX ? vX.text === '1' || vX.text === 'true' : undefined;
      else if (t === 'e') value = vX ? vX.text : undefined;
      else if (t === 'd') { const d = vX ? Date.parse(vX.text) : NaN; value = Number.isNaN(d) ? undefined : d / 86400000 + 25569; }
      else if (vX && vX.text !== '') { value = Number(vX.text); if (ctx.date1904 && isDateStyle(sAttr)) value += 1462; }
      let formula: string | undefined;
      if (fX) {
        const ft = fX.attrs.t;
        const text = fX.text;
        if (ft === 'shared') {
          const si = fX.attrs.si ?? '';
          if (text.trim()) { sharedMasters.set(si, { f: text, row: addr.row, col: addr.col }); formula = text; }
          else {
            const m = sharedMasters.get(si);
            if (m) { try { formula = toFormula(shiftRelative(parseFormula(m.f.replace(/_xlfn\._xlws\.|_xlfn\.|_xlws\.|_xlpm\./gi, '')), addr.row - m.row, addr.col - m.col)); } catch { formula = m.f; } }
          }
        } else if (text.trim()) {
          formula = text;
          if (ft === 'array' && fX.attrs.ref) { const ar = parseRange(fX.attrs.ref); if (ar && (ar.r1 !== ar.r2 || ar.c1 !== ar.c2)) arrayAreas.push({ ...ar, row: addr.row, col: addr.col }); }
        }
      }
      if (formula !== undefined) {
        cell.f = normalizeImportedFormula(formula);
        if (value !== undefined) cell.c = t === 'e' ? { e: String(value) } : (value as string | number | boolean);
      } else if (value !== undefined) {
        if (t === 'e') cell.f = String(value);
        else cell.v = value as string | number | boolean;
      }
      if (Object.keys(cell).length) (cells[addr.row] ??= {})[addr.col] = cell;
    }
  }
  // Cached results inside array-formula areas belong to the spill, not the grid.
  for (const ar of arrayAreas) for (let row = ar.r1; row <= ar.r2; row++) for (let col = ar.c1; col <= ar.c2; col++) {
    if (row === ar.row && col === ar.col) continue;
    const c = cells[row]?.[col];
    if (c && c.f === undefined) { if (c.s !== undefined) cells[row][col] = { s: c.s }; else delete cells[row][col]; }
  }
  sh.cells = cells;
  if (Object.keys(rowHeights).length) sh.rowHeights = rowHeights;
  if (hiddenRows.length) sh.hiddenRows = hiddenRows;
  const merges = childrenOf(child(ws, 'mergeCells'), 'mergeCell').map(m => m.attrs.ref).filter(Boolean);
  if (merges.length) sh.merges = merges;
  // Conditional formats.
  const cfs: ConditionalFormat[] = [];
  for (const cfX of childrenOf(ws, 'conditionalFormatting')) {
    for (const rule of childrenOf(cfX, 'cfRule')) {
      const r = readCfRule(rule, ctx);
      if (!r) { ctx.warnings.push(`Unsupported conditional format type ${rule.attrs.type}.`); continue; }
      const cf: ConditionalFormat = { id: newId('cf'), ranges: cfX.attrs.sqref, rule: r };
      if (rule.attrs.priority) cf.priority = Number(rule.attrs.priority);
      if (rule.attrs.stopIfTrue === '1') cf.stopIfTrue = true;
      cfs.push(cf);
    }
  }
  if (cfs.length) sh.conditionalFormats = cfs;
  // Data validation.
  const dvs: DataValidation[] = [];
  for (const d of childrenOf(child(ws, 'dataValidations'), 'dataValidation')) {
    const type = (d.attrs.type ?? 'any') as DataValidation['type'];
    const dv: DataValidation = { id: newId('dv'), ranges: d.attrs.sqref, type };
    if (d.attrs.operator) dv.operator = d.attrs.operator as DataValidation['operator'];
    const f1 = child(d, 'formula1')?.text, f2 = child(d, 'formula2')?.text;
    if (type === 'list' && f1 && /^".*"$/.test(f1.trim())) dv.list = f1.trim().slice(1, -1).split(',');
    else if (f1) dv.formula1 = normalizeImportedFormula(f1);
    if (f2) dv.formula2 = normalizeImportedFormula(f2);
    dv.allowBlank = d.attrs.allowBlank === '1' || d.attrs.allowBlank === 'true';
    // OOXML's showDropDown="1" means HIDE the in-cell dropdown.
    if (type === 'list') dv.showDropdown = !(d.attrs.showDropDown === '1' || d.attrs.showDropDown === 'true');
    if (d.attrs.errorStyle) dv.errorStyle = d.attrs.errorStyle as DataValidation['errorStyle'];
    if (d.attrs.errorTitle) dv.errorTitle = d.attrs.errorTitle;
    if (d.attrs.error) dv.error = d.attrs.error;
    if (d.attrs.promptTitle) dv.promptTitle = d.attrs.promptTitle;
    if (d.attrs.prompt) dv.prompt = d.attrs.prompt;
    dvs.push(clean(dv));
  }
  if (dvs.length) sh.dataValidations = dvs;
  // AutoFilter (value lists).
  const af = child(ws, 'autoFilter');
  if (af?.attrs.ref) {
    const rr = parseRange(af.attrs.ref)!;
    sh.filter = { range: af.attrs.ref, columns: childrenOf(af, 'filterColumn').map(fc => ({ col: rr.c1 + Number(fc.attrs.colId), values: childrenOf(child(fc, 'filters'), 'filter').map(x => x.attrs.val) })).filter(c => c.values.length) };
    const hid = hiddenRows.filter(r => r > rr.r1 && r <= rr.r2);
    if (hid.length && sh.filter.columns.length) { sh.filteredRows = hid; sh.hiddenRows = hiddenRows.filter(r => !hid.includes(r)); if (!sh.hiddenRows.length) delete sh.hiddenRows; }
  }
  // Hyperlinks.
  for (const h of childrenOf(child(ws, 'hyperlinks'), 'hyperlink')) {
    const target = h.attrs['r:id'] ? rels.get(h.attrs['r:id'])?.target : h.attrs.location ? '#' + h.attrs.location : undefined;
    const p = parseA1((h.attrs.ref ?? '').split(':')[0]);
    if (target && p) { const row = (sh.cells[p.row] ??= {}); row[p.col] = { ...(row[p.col] ?? {}), link: target }; }
  }
  // Tables and notes through the sheet's relationships.
  for (const tp of childrenOf(child(ws, 'tableParts'), 'tablePart')) {
    const rel = rels.get(tp.attrs['r:id']); if (!rel || !files[rel.target]) continue;
    const t = parseXml(strFromU8(files[rel.target]));
    (sh.tables ??= []).push(clean({ id: newId('tb'), name: t.attrs.displayName ?? t.attrs.name, range: t.attrs.ref, headerRow: t.attrs.headerRowCount !== '0', totalsRow: Number(t.attrs.totalsRowCount ?? 0) > 0 || undefined, style: child(t, 'tableStyleInfo')?.attrs.name }));
  }
  for (const rel of rels.values()) {
    if (!rel.type.endsWith('/comments') || !files[rel.target]) continue;
    const cm = parseXml(strFromU8(files[rel.target]));
    for (const c of childrenOf(child(cm, 'commentList'), 'comment')) {
      const p = parseA1(c.attrs.ref ?? ''); if (!p) continue;
      const row = (sh.cells[p.row] ??= {});
      row[p.col] = { ...(row[p.col] ?? {}), note: allText(child(c, 'text') ?? c) };
    }
  }
}

function readCfvo(n: XNode): CfValueObject {
  const t = n.attrs.type as CfValueObject['type'];
  const o: CfValueObject = { type: t === ('number' as string) ? 'num' : t };
  if (n.attrs.val !== undefined) o.value = n.attrs.val;
  return o;
}
function readCfRule(r: XNode, ctx: SheetCtx): ConditionalRule | null {
  const style = r.attrs.dxfId !== undefined ? ctx.dxfs[Number(r.attrs.dxfId)] ?? {} : {};
  const formulas = childrenOf(r, 'formula').map(f => normalizeImportedFormula(f.text));
  switch (r.attrs.type) {
    case 'cellIs': return { type: 'cellIs', operator: (r.attrs.operator ?? 'equal') as 'equal', formulas, style };
    case 'expression': return { type: 'expression', formula: formulas[0] ?? 'FALSE', style };
    case 'containsText': case 'notContainsText': case 'beginsWith': case 'endsWith': return { type: r.attrs.type, text: r.attrs.text ?? '', style };
    case 'containsBlanks': case 'notContainsBlanks': case 'containsErrors': case 'notContainsErrors': case 'duplicateValues': case 'uniqueValues': return { type: r.attrs.type, style };
    case 'top10': return clean({ type: 'top10', rank: Number(r.attrs.rank ?? 10), bottom: r.attrs.bottom === '1' || undefined, percent: r.attrs.percent === '1' || undefined, style });
    case 'aboveAverage': return clean({ type: 'aboveAverage', below: r.attrs.aboveAverage === '0' || undefined, equalAverage: r.attrs.equalAverage === '1' || undefined, stdDev: r.attrs.stdDev ? Number(r.attrs.stdDev) : undefined, style });
    case 'colorScale': { const cs = child(r, 'colorScale'); return { type: 'colorScale', cfvo: childrenOf(cs, 'cfvo').map(readCfvo), colors: childrenOf(cs, 'color').map(c => colorOf(c, ctx.theme) ?? '#FFFFFF') }; }
    case 'dataBar': { const db = child(r, 'dataBar'); return clean({ type: 'dataBar', cfvo: childrenOf(db, 'cfvo').map(readCfvo), color: colorOf(child(db, 'color'), ctx.theme) ?? '#638EC6', showValue: db?.attrs.showValue === '0' ? false : undefined }); }
    case 'iconSet': { const is = child(r, 'iconSet'); return clean({ type: 'iconSet', iconSet: (is?.attrs.iconSet ?? '3TrafficLights1') as IconSetName, cfvo: childrenOf(is, 'cfvo').map(readCfvo), reverse: is?.attrs.reverse === '1' || undefined, showValue: is?.attrs.showValue === '0' ? false : undefined }); }
    default: return null;
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

/** Functions that must carry the `_xlfn.` prefix in OOXML (Excel 2010+). */
const FUTURE = new Set(('AGGREGATE ACOT ACOTH ARABIC BASE BETA.DIST BETA.INV BINOM.DIST BINOM.DIST.RANGE BINOM.INV BITAND BITLSHIFT BITOR BITRSHIFT BITXOR BYCOL BYROW CEILING.MATH CEILING.PRECISE CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CHISQ.TEST CHOOSECOLS CHOOSEROWS COMBINA CONCAT CONFIDENCE.NORM CONFIDENCE.T COT COTH COVARIANCE.P COVARIANCE.S CSC CSCH DAYS DECIMAL DROP ERF.PRECISE ERFC.PRECISE EXPAND EXPON.DIST F.DIST F.DIST.RT F.INV F.INV.RT F.TEST FILTER FLOOR.MATH FLOOR.PRECISE FORECAST.LINEAR FORMULATEXT GAMMA GAMMA.DIST GAMMA.INV GAMMALN.PRECISE GAUSS HSTACK HYPGEOM.DIST IFNA IFS ISFORMULA ISOMITTED ISOWEEKNUM LAMBDA LET LOGNORM.DIST LOGNORM.INV MAKEARRAY MAP MAXIFS MINIFS MODE.MULT MODE.SNGL MUNIT NEGBINOM.DIST NETWORKDAYS.INTL NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV NUMBERVALUE PDURATION PERCENTILE.EXC PERCENTILE.INC PERCENTRANK.EXC PERCENTRANK.INC PERMUTATIONA PHI POISSON.DIST QUARTILE.EXC QUARTILE.INC RANDARRAY RANK.AVG RANK.EQ REDUCE REGEXEXTRACT REGEXREPLACE REGEXTEST RRI SCAN SEC SECH SEQUENCE SHEET SHEETS SINGLE SKEW.P SORT SORTBY STDEV.P STDEV.S SWITCH T.DIST T.DIST.2T T.DIST.RT T.INV T.INV.2T T.TEST TAKE TEXTAFTER TEXTBEFORE TEXTJOIN TEXTSPLIT TOCOL TOROW UNICHAR UNICODE UNIQUE VALUETOTEXT ARRAYTOTEXT VAR.P VAR.S VSTACK WEIBULL.DIST WORKDAY.INTL WRAPCOLS WRAPROWS XLOOKUP XMATCH XOR Z.TEST').split(' '));
const WORKSHEET_FN = new Set(['FILTER', 'SORT']); // the only two written as _xlfn._xlws.

/** Formula text as OOXML wants it. */
export function exportFormula(f: string): string {
  let ast: Node;
  try { ast = parseFormula(f); } catch { return f; }
  const params = new Set<string>();
  walk(ast, n => {
    if (n.t === 'call' && (n.name === 'LET' || n.name === 'LAMBDA')) {
      const list = n.name === 'LET' ? n.args.filter((_, i) => i % 2 === 0 && i < n.args.length - 1) : n.args.slice(0, -1);
      for (const a of list) if (a.t === 'name') params.add(a.name.toLowerCase());
    }
  });
  const tx = mapNode(ast, n => {
    if (n.t === 'unary' && n.op === '@') return { t: 'call', name: 'SINGLE', args: [n.a] };
    if (n.t === 'name' && params.has(n.name.toLowerCase())) return { ...n, name: '_xlpm.' + n.name };
    return n;
  });
  return toFormula(tx, { xlfn: name => (FUTURE.has(name) ? (WORKSHEET_FN.has(name) ? '_xlfn._xlws.' : '_xlfn.') + name : name) });
}

const ct = {
  wb: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  ws: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
  styles: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
  ss: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml',
  meta: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml',
  table: 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
};
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export interface XlsxExportOptions {
  /** Engine for cached values and spill extents (strongly recommended). */
  engine?: SheetEngine;
  creator?: string;
}

const BORDER_ORDER = ['left', 'right', 'top', 'bottom'] as const;

/** Serialize a workbook as .xlsx bytes. */
export function exportXlsx(wb: Workbook, opts: XlsxExportOptions = {}): Uint8Array {
  const engine = opts.engine;
  const out: Record<string, Uint8Array> = {};
  const put = (p: string, s: string) => { out[p] = strToU8(s); };

  // ── styles.xml ──
  const numFmtIds = new Map<string, number>();
  for (const [id, code] of Object.entries(BUILTIN_FORMATS)) if (!numFmtIds.has(code)) numFmtIds.set(code, Number(id));
  const customFmts: [number, string][] = [];
  const fmtId = (code?: string) => {
    if (!code || code === 'General') return 0;
    let id = numFmtIds.get(code);
    if (id === undefined) { id = 164 + customFmts.length; customFmts.push([id, code]); numFmtIds.set(code, id); }
    return id;
  };
  const fonts: string[] = ['<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'];
  const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  const intern = (list: string[], xml: string) => { const i = list.indexOf(xml); if (i >= 0) return i; list.push(xml); return list.length - 1; };
  const fontXml = (f: NonNullable<CellStyle['font']>) =>
    `<font>${f.bold ? '<b/>' : ''}${f.italic ? '<i/>' : ''}${f.strike ? '<strike/>' : ''}${f.underline ? (f.underline === 'double' ? '<u val="double"/>' : '<u/>') : ''}<sz val="${f.size ?? 11}"/>${f.color ? `<color rgb="${rgbAttr(f.color)}"/>` : '<color theme="1"/>'}<name val="${escapeXml(f.family ?? 'Calibri')}"/><family val="2"/>${f.family ? '' : '<scheme val="minor"/>'}</font>`;
  const borderXml = (b: NonNullable<CellStyle['borders']>) =>
    '<border>' + BORDER_ORDER.map(s => { const x = b[s]; return x ? `<${s} style="${x.style}"><color rgb="${rgbAttr(x.color ?? '#000000')}"/></${s}>` : `<${s}/>`; }).join('') + '<diagonal/></border>';
  const xfs: string[] = [];
  wb.styles.forEach((st, i) => {
    if (i === 0) { xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'); return; }
    const nid = fmtId(st.numFmt);
    const fid = st.font ? intern(fonts, fontXml(st.font)) : 0;
    const flid = st.fill ? intern(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${rgbAttr(st.fill.color)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const bid = st.borders ? intern(borders, borderXml(st.borders)) : 0;
    const a = st.align;
    const alignXml = a ? `<alignment${a.h && a.h !== 'general' ? ` horizontal="${a.h}"` : ''}${a.v ? ` vertical="${a.v}"` : ''}${a.wrap ? ' wrapText="1"' : ''}${a.indent ? ` indent="${a.indent}"` : ''}${a.rotation ? ` textRotation="${a.rotation}"` : ''}${a.shrink ? ' shrinkToFit="1"' : ''}/>` : '';
    const p = st.protection;
    const protXml = p && (p.locked === false || p.hidden) ? `<protection${p.locked === false ? ' locked="0"' : ''}${p.hidden ? ' hidden="1"' : ''}/>` : '';
    const attrs = `numFmtId="${nid}" fontId="${fid}" fillId="${flid}" borderId="${bid}" xfId="0"${nid ? ' applyNumberFormat="1"' : ''}${fid ? ' applyFont="1"' : ''}${flid ? ' applyFill="1"' : ''}${bid ? ' applyBorder="1"' : ''}${alignXml ? ' applyAlignment="1"' : ''}${protXml ? ' applyProtection="1"' : ''}`;
    xfs.push(alignXml || protXml ? `<xf ${attrs}>${alignXml}${protXml}</xf>` : `<xf ${attrs}/>`);
  });
  // Differential formats for conditional formatting.
  const dxfs: string[] = [];
  const dxfId = (st: CellStyle) => {
    let x = '<dxf>';
    if (st.font) x += `<font>${st.font.bold ? '<b/>' : ''}${st.font.italic ? '<i/>' : ''}${st.font.strike ? '<strike/>' : ''}${st.font.underline ? '<u/>' : ''}${st.font.color ? `<color rgb="${rgbAttr(st.font.color)}"/>` : ''}</font>`;
    if (st.numFmt) x += `<numFmt numFmtId="${fmtId(st.numFmt)}" formatCode="${escapeXml(st.numFmt)}"/>`;
    if (st.fill) x += `<fill><patternFill><bgColor rgb="${rgbAttr(st.fill.color)}"/></patternFill></fill>`;
    if (st.borders) x += borderXml(st.borders);
    x += '</dxf>';
    return intern(dxfs, x);
  };

  // ── shared strings ──
  const sst: string[] = [];
  const sstIndex = new Map<string, number>();
  let sstCount = 0;
  const sIdx = (s: string) => { sstCount++; let i = sstIndex.get(s); if (i === undefined) { i = sst.length; sst.push(s); sstIndex.set(s, i); } return i; };
  const tAttr = (s: string) => (/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : '');

  // ── worksheets ──
  let anyDynamic = false;
  const sheetRels: string[][] = [];
  let tableCount = 0;
  const tableParts: string[] = [];
  wb.sheets.forEach((sh, si) => {
    const rels: string[] = [];
    const rows = new Map<number, Map<number, string>>();
    let maxR = 0, maxC = 0;
    const spills = engine ? engine.getSpills(sh.id) : [];
    const spillAt = new Map<string, { r2: number; c2: number }>();
    for (const sp of spills) spillAt.set(toA1(sp.row, sp.col), sp.area);
    const valueXml = (v: Scalar): { t: string; v: string } | null => {
      if (v === null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? { t: '', v: String(v) } : { t: 'e', v: '#NUM!' };
      if (typeof v === 'boolean') return { t: 'b', v: v ? '1' : '0' };
      if (v instanceof CellError) return { t: 'e', v: v.code };
      return { t: 'str', v: v };
    };
    const putCell = (row: number, col: number, xml: string) => {
      let r = rows.get(row); if (!r) { r = new Map(); rows.set(row, r); }
      r.set(col, xml);
      maxR = Math.max(maxR, row); maxC = Math.max(maxC, col);
    };
    for (const [a1, cell] of cellEntriesA1(sh.cells)) {
      const p = parseA1(a1)!;
      const s = cell.s ? ` s="${cell.s}"` : '';
      if (cell.f !== undefined) {
        const cached: Scalar = engine ? engine.getValue(sh.id, p.row, p.col) : cell.c === undefined ? null : typeof cell.c === 'object' && cell.c !== null ? new CellError((cell.c as { e: string }).e as never) : cell.c;
        const area = spillAt.get(a1);
        const fx = escapeXml(exportFormula(cell.f));
        const vx = valueXml(cached);
        const t = vx ? (vx.t ? ` t="${vx.t}"` : '') : '';
        const v = vx ? `<v>${escapeXml(vx.v)}</v>` : '';
        if (area) {
          anyDynamic = true;
          putCell(p.row, p.col, `<c r="${a1}"${s}${t} cm="1"><f t="array" ref="${a1}:${toA1(area.r2, area.c2)}">${fx}</f>${v}</c>`);
          for (let r = p.row; r <= area.r2; r++) for (let c = p.col; c <= area.c2; c++) {
            if (r === p.row && c === p.col) continue;
            const sv = valueXml(engine!.getValue(sh.id, r, c));
            const cs = getCell(sh.cells, r, c)?.s;
            if (!sv) continue;
            putCell(r, c, sv.t === 'str' ? `<c r="${toA1(r, c)}"${cs ? ` s="${cs}"` : ''} t="s"><v>${sIdx(sv.v)}</v></c>` : `<c r="${toA1(r, c)}"${cs ? ` s="${cs}"` : ''}${sv.t ? ` t="${sv.t}"` : ''}><v>${escapeXml(sv.v)}</v></c>`);
          }
        } else putCell(p.row, p.col, `<c r="${a1}"${s}${t}><f>${fx}</f>${v}</c>`);
      } else if (cell.v !== undefined) {
        if (typeof cell.v === 'string') putCell(p.row, p.col, `<c r="${a1}"${s} t="s"><v>${sIdx(cell.v)}</v></c>`);
        else if (typeof cell.v === 'boolean') putCell(p.row, p.col, `<c r="${a1}"${s} t="b"><v>${cell.v ? 1 : 0}</v></c>`);
        else putCell(p.row, p.col, `<c r="${a1}"${s}><v>${Number.isFinite(cell.v) ? cell.v : 0}</v></c>`);
      } else if (cell.s) putCell(p.row, p.col, `<c r="${a1}"${s}/>`);
    }
    for (const k of Object.keys(sh.rowHeights ?? {})) maxR = Math.max(maxR, Number(k));
    const hiddenR = new Set([...(sh.hiddenRows ?? []), ...(sh.filteredRows ?? [])]);
    for (const r of hiddenR) if (!rows.has(r)) rows.set(r, new Map());
    for (const k of Object.keys(sh.rowHeights ?? {})) if (!rows.has(Number(k))) rows.set(Number(k), new Map());
    let x = XML_HEAD + `<worksheet xmlns="${NS_MAIN}" xmlns:r="${REL}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac" mc:Ignorable="x14ac">`;
    if (sh.tabColor || sh.filter) x += `<sheetPr${sh.filter ? ' filterMode="' + (sh.filteredRows?.length ? '1' : '0') + '"' : ''}>${sh.tabColor ? `<tabColor rgb="${rgbAttr(sh.tabColor)}"/>` : ''}</sheetPr>`;
    x += `<dimension ref="A1${maxR || maxC ? ':' + toA1(maxR, maxC) : ''}"/>`;
    x += `<sheetViews><sheetView${sh.showGridLines === false ? ' showGridLines="0"' : ''}${wb.activeSheet === sh.id ? ' tabSelected="1"' : ''} workbookViewId="0">`;
    if (sh.freeze && (sh.freeze.rows || sh.freeze.cols)) {
      const { rows: fr, cols: fc } = sh.freeze;
      const pane = fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight';
      x += `<pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${toA1(fr, fc)}" activePane="${pane}" state="frozen"/><selection pane="${pane}"/>`;
    }
    x += '</sheetView></sheetViews>';
    x += `<sheetFormatPr${sh.defaultColWidth ? ` defaultColWidth="${charsFromPx(sh.defaultColWidth)}"` : ''} defaultRowHeight="${sh.defaultRowHeight ? ptFromPx(sh.defaultRowHeight) : 15}"/>`;
    const colKeys = new Set<number>([...Object.keys(sh.colWidths ?? {}).map(Number), ...(sh.hiddenCols ?? [])]);
    if (colKeys.size) {
      x += '<cols>' + [...colKeys].sort((a, b) => a - b).map(c => {
        const w = sh.colWidths?.[c];
        const width = w !== undefined ? charsFromPx(w) : sh.defaultColWidth ? charsFromPx(sh.defaultColWidth) : 8.43;
        return `<col min="${c + 1}" max="${c + 1}" width="${width}"${w !== undefined ? ' customWidth="1"' : ''}${sh.hiddenCols?.includes(c) ? ' hidden="1"' : ''}/>`;
      }).join('') + '</cols>';
    }
    x += '<sheetData>';
    for (const r of [...rows.keys()].sort((a, b) => a - b)) {
      const cellsXml = rows.get(r)!;
      const ht = sh.rowHeights?.[r];
      x += `<row r="${r + 1}"${ht !== undefined ? ` ht="${ptFromPx(ht)}" customHeight="1"` : ''}${hiddenR.has(r) ? ' hidden="1"' : ''}>`;
      for (const c of [...cellsXml.keys()].sort((a, b) => a - b)) x += cellsXml.get(c);
      x += '</row>';
    }
    x += '</sheetData>';
    if (sh.filter) {
      const fr = parseRange(sh.filter.range)!;
      x += `<autoFilter ref="${sh.filter.range}">` + sh.filter.columns.filter(c => c.values?.length).map(c => `<filterColumn colId="${c.col - fr.c1}"><filters>${c.values!.filter(v => v !== '').map(v => `<filter val="${escapeXml(v)}"/>`).join('')}</filters></filterColumn>`).join('') + '</autoFilter>';
    }
    if (sh.merges?.length) x += `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
    for (const cf of sh.conditionalFormats ?? []) x += cfXml(cf, dxfId);
    if (sh.dataValidations?.length) {
      x += `<dataValidations count="${sh.dataValidations.length}">` + sh.dataValidations.map(dv => {
        const a = [`type="${dv.type === 'any' ? 'none' : dv.type}"`];
        if (dv.errorStyle && dv.errorStyle !== 'stop') a.push(`errorStyle="${dv.errorStyle}"`);
        if (dv.operator && dv.type !== 'list' && dv.type !== 'custom') a.push(`operator="${dv.operator}"`);
        if (dv.allowBlank) a.push('allowBlank="1"');
        if (dv.type === 'list' && dv.showDropdown === false) a.push('showDropDown="1"');
        a.push('showInputMessage="1"', 'showErrorMessage="1"');
        if (dv.errorTitle) a.push(`errorTitle="${escapeXml(dv.errorTitle)}"`);
        if (dv.error) a.push(`error="${escapeXml(dv.error)}"`);
        if (dv.promptTitle) a.push(`promptTitle="${escapeXml(dv.promptTitle)}"`);
        if (dv.prompt) a.push(`prompt="${escapeXml(dv.prompt)}"`);
        a.push(`sqref="${dv.ranges}"`);
        const f1 = dv.list ? `"${dv.list.join(',')}"` : dv.formula1 ? exportFormula(dv.formula1) : undefined;
        return `<dataValidation ${a.join(' ')}>${f1 !== undefined ? `<formula1>${escapeXml(f1)}</formula1>` : ''}${dv.formula2 ? `<formula2>${escapeXml(exportFormula(dv.formula2))}</formula2>` : ''}</dataValidation>`;
      }).join('') + '</dataValidations>';
    }
    const links = cellEntriesA1(sh.cells).filter(([, c]) => c.link);
    if (links.length) {
      x += '<hyperlinks>' + links.map(([a1, c]) => {
        if (c.link!.startsWith('#')) return `<hyperlink ref="${a1}" location="${escapeXml(c.link!.slice(1))}"/>`;
        rels.push(`<Relationship Id="rId${rels.length + 1}" Type="${REL}/hyperlink" Target="${escapeXml(c.link!)}" TargetMode="External"/>`);
        return `<hyperlink ref="${a1}" r:id="rId${rels.length}"/>`;
      }).join('') + '</hyperlinks>';
    }
    x += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
    if (sh.tables?.length) {
      const ids: string[] = [];
      for (const t of sh.tables) {
        tableCount++;
        const tr = parseRange(t.range)!;
        const cols: string[] = [];
        for (let c = tr.c1; c <= tr.c2; c++) {
          const hv = getCell(sh.cells, tr.r1, c)?.v;
          let nm = hv !== undefined && t.headerRow !== false ? String(hv) : `Column${c - tr.c1 + 1}`;
          while (cols.includes(nm)) nm += '2';
          cols.push(nm);
        }
        put(`xl/tables/table${tableCount}.xml`, XML_HEAD + `<table xmlns="${NS_MAIN}" id="${tableCount}" name="${escapeXml(t.name)}" displayName="${escapeXml(t.name)}" ref="${t.range}"${t.headerRow === false ? ' headerRowCount="0"' : ''}${t.totalsRow ? ' totalsRowCount="1"' : ''}>${t.headerRow !== false ? `<autoFilter ref="${t.range}"/>` : ''}<tableColumns count="${cols.length}">${cols.map((c, i) => `<tableColumn id="${i + 1}" name="${escapeXml(c)}"/>`).join('')}</tableColumns><tableStyleInfo name="${escapeXml(t.style ?? 'TableStyleMedium2')}" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`);
        tableParts.push(`/xl/tables/table${tableCount}.xml`);
        rels.push(`<Relationship Id="rId${rels.length + 1}" Type="${REL}/table" Target="../tables/table${tableCount}.xml"/>`);
        ids.push(`rId${rels.length}`);
      }
      x += `<tableParts count="${ids.length}">${ids.map(i => `<tablePart r:id="${i}"/>`).join('')}</tableParts>`;
    }
    x += '</worksheet>';
    put(`xl/worksheets/sheet${si + 1}.xml`, x);
    sheetRels.push(rels);
    if (rels.length) put(`xl/worksheets/_rels/sheet${si + 1}.xml.rels`, XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  });

  put('xl/sharedStrings.xml', XML_HEAD + `<sst xmlns="${NS_MAIN}" count="${sstCount}" uniqueCount="${sst.length}">${sst.map(s => `<si><t${tAttr(s)}>${escapeXml(s)}</t></si>`).join('')}</sst>`);
  put('xl/styles.xml', XML_HEAD + `<styleSheet xmlns="${NS_MAIN}">`
    + (customFmts.length ? `<numFmts count="${customFmts.length}">${customFmts.map(([id, c]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(c)}"/>`).join('')}</numFmts>` : '')
    + `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
    + `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`);

  // ── workbook ──
  const active = Math.max(0, wb.sheets.findIndex(s => s.id === wb.activeSheet));
  let w = XML_HEAD + `<workbook xmlns="${NS_MAIN}" xmlns:r="${REL}"><workbookPr/>`;
  w += `<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="${active}"/></bookViews><sheets>`;
  wb.sheets.forEach((s, i) => { w += `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`; });
  w += '</sheets>';
  const dn: string[] = [];
  for (const n of wb.names) {
    const li = n.sheetId ? wb.sheets.findIndex(s => s.id === n.sheetId) : -1;
    dn.push(`<definedName name="${escapeXml(n.name)}"${li >= 0 ? ` localSheetId="${li}"` : ''}${n.comment ? ` comment="${escapeXml(n.comment)}"` : ''}>${escapeXml(exportFormula(n.ref))}</definedName>`);
  }
  wb.sheets.forEach((s, i) => { if (s.filter) dn.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(`${quoteName(s.name)}!${absRange(s.filter.range)}`)}</definedName>`); });
  if (dn.length) w += `<definedNames>${dn.join('')}</definedNames>`;
  const calc = wb.calc;
  w += `<calcPr calcId="191029" fullCalcOnLoad="1"${calc?.iterative ? ` iterate="1"${calc.maxIterations ? ` iterateCount="${calc.maxIterations}"` : ''}${calc.maxChange ? ` iterateDelta="${calc.maxChange}"` : ''}` : ''}${calc?.manual ? ' calcMode="manual"' : ''}/></workbook>`;
  put('xl/workbook.xml', w);
  const wbRels = wb.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
  const n = wb.sheets.length;
  wbRels.push(`<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/>`);
  wbRels.push(`<Relationship Id="rId${n + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>`);
  if (anyDynamic) {
    wbRels.push(`<Relationship Id="rId${n + 3}" Type="${REL}/sheetMetadata" Target="metadata.xml"/>`);
    put('xl/metadata.xml', XML_HEAD + `<metadata xmlns="${NS_MAIN}" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray"><metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes><futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata><cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>`);
  }
  put('xl/_rels/workbook.xml.rels', XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`);
  put('_rels/.rels', XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  put('docProps/core.xml', XML_HEAD + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${escapeXml(opts.creator ?? 'Tela')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  put('docProps/app.xml', XML_HEAD + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Plajah Tela</Application></Properties>`);
  let types = XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
  types += `<Override PartName="/xl/workbook.xml" ContentType="${ct.wb}"/>`;
  wb.sheets.forEach((_, i) => { types += `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${ct.ws}"/>`; });
  types += `<Override PartName="/xl/styles.xml" ContentType="${ct.styles}"/><Override PartName="/xl/sharedStrings.xml" ContentType="${ct.ss}"/>`;
  if (anyDynamic) types += `<Override PartName="/xl/metadata.xml" ContentType="${ct.meta}"/>`;
  for (const t of tableParts) types += `<Override PartName="${t}" ContentType="${ct.table}"/>`;
  types += `<Override PartName="/docProps/core.xml" ContentType="${ct.core}"/><Override PartName="/docProps/app.xml" ContentType="${ct.app}"/></Types>`;
  put('[Content_Types].xml', types);
  void sheetRels;
  return zipSync(out, { level: 6 });
}

const quoteName = (n: string) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);
const absRange = (r: string) => r.split(':').map(p => p.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2')).join(':');

function cfvoXml(c: CfValueObject) { return `<cfvo type="${c.type === 'num' ? 'num' : c.type}"${c.value !== undefined ? ` val="${escapeXml(c.value)}"` : ''}/>`; }
function cfXml(cf: ConditionalFormat, dxfId: (s: CellStyle) => number): string {
  const r = cf.rule;
  const pr = ` priority="${cf.priority ?? 1}"${cf.stopIfTrue ? ' stopIfTrue="1"' : ''}`;
  let rule = '';
  const first = cf.ranges.split(/\s+/)[0].split(':')[0];
  switch (r.type) {
    case 'cellIs': rule = `<cfRule type="cellIs" dxfId="${dxfId(r.style)}"${pr} operator="${r.operator}">${r.formulas.map(f => `<formula>${escapeXml(exportFormula(f))}</formula>`).join('')}</cfRule>`; break;
    case 'expression': rule = `<cfRule type="expression" dxfId="${dxfId(r.style)}"${pr}><formula>${escapeXml(exportFormula(r.formula))}</formula></cfRule>`; break;
    case 'containsText': case 'notContainsText': case 'beginsWith': case 'endsWith': {
      const t = r.text.replace(/"/g, '""');
      const f = r.type === 'containsText' ? `NOT(ISERROR(SEARCH("${t}",${first})))` : r.type === 'notContainsText' ? `ISERROR(SEARCH("${t}",${first}))` : r.type === 'beginsWith' ? `LEFT(${first},LEN("${t}"))="${t}"` : `RIGHT(${first},LEN("${t}"))="${t}"`;
      const op = r.type === 'containsText' ? 'containsText' : r.type === 'notContainsText' ? 'notContains' : r.type;
      rule = `<cfRule type="${r.type}" dxfId="${dxfId(r.style)}"${pr} operator="${op}" text="${escapeXml(r.text)}"><formula>${escapeXml(f)}</formula></cfRule>`;
      break;
    }
    case 'containsBlanks': rule = `<cfRule type="containsBlanks" dxfId="${dxfId(r.style)}"${pr}><formula>LEN(TRIM(${first}))=0</formula></cfRule>`; break;
    case 'notContainsBlanks': rule = `<cfRule type="notContainsBlanks" dxfId="${dxfId(r.style)}"${pr}><formula>LEN(TRIM(${first}))&gt;0</formula></cfRule>`; break;
    case 'containsErrors': rule = `<cfRule type="containsErrors" dxfId="${dxfId(r.style)}"${pr}><formula>ISERROR(${first})</formula></cfRule>`; break;
    case 'notContainsErrors': rule = `<cfRule type="notContainsErrors" dxfId="${dxfId(r.style)}"${pr}><formula>NOT(ISERROR(${first}))</formula></cfRule>`; break;
    case 'duplicateValues': case 'uniqueValues': rule = `<cfRule type="${r.type}" dxfId="${dxfId(r.style)}"${pr}/>`; break;
    case 'top10': rule = `<cfRule type="top10" dxfId="${dxfId(r.style)}"${pr}${r.percent ? ' percent="1"' : ''}${r.bottom ? ' bottom="1"' : ''} rank="${r.rank}"/>`; break;
    case 'aboveAverage': rule = `<cfRule type="aboveAverage" dxfId="${dxfId(r.style)}"${pr}${r.below ? ' aboveAverage="0"' : ''}${r.equalAverage ? ' equalAverage="1"' : ''}${r.stdDev ? ` stdDev="${r.stdDev}"` : ''}/>`; break;
    case 'colorScale': rule = `<cfRule type="colorScale"${pr}><colorScale>${r.cfvo.map(cfvoXml).join('')}${r.colors.map(c => `<color rgb="${rgbAttr(c)}"/>`).join('')}</colorScale></cfRule>`; break;
    case 'dataBar': rule = `<cfRule type="dataBar"${pr}><dataBar${r.showValue === false ? ' showValue="0"' : ''}>${(r.cfvo.length ? r.cfvo : [{ type: 'min' as const }, { type: 'max' as const }]).map(cfvoXml).join('')}<color rgb="${rgbAttr(r.color)}"/></dataBar></cfRule>`; break;
    case 'iconSet': rule = `<cfRule type="iconSet"${pr}><iconSet iconSet="${r.iconSet}"${r.reverse ? ' reverse="1"' : ''}${r.showValue === false ? ' showValue="0"' : ''}>${(r.cfvo.length ? r.cfvo : Array.from({ length: Number(r.iconSet[0]) }, (_, i) => ({ type: 'percent' as const, value: String(Math.round((i * 100) / Number(r.iconSet[0]))) }))).map(cfvoXml).join('')}</iconSet></cfRule>`; break;
  }
  return `<conditionalFormatting sqref="${cf.ranges}">${rule}</conditionalFormatting>`;
}

export { MAX_ROWS };
