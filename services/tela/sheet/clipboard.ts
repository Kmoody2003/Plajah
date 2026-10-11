// clipboard — copy as TSV + HTML (what Excel / Google Sheets / Docs paste),
// and paste from TSV or HTML tables (Excel's x:num / x:fmla attributes and
// <style> classes, Google Sheets' data-sheets-value / data-sheets-formula in
// R1C1). Internal copies carry the source cells so formulas re-anchor exactly.

import { parseRange, toA1, type RangeAddr } from './address';
import type { SheetEngine } from './engine';
import { clean, getCell, internStyle, mergeStyle, type Cell, type CellStyle, type Workbook } from './model';
import { guessInput } from './numfmt';
import { copyRange, writeCells, type OpResult, type PasteMode } from './ops';
import { r1c1ToA1, shiftRelative, transformFormula } from './serialize';
import { CellError } from './values';
import { parseDelimited } from './csv';

export interface ClipCell {
  /** Text as it should be interpreted (like typing). */
  text: string;
  /** Exact value when the source said so (x:num, data-sheets-value). */
  value?: number | string | boolean;
  /** Formula text without '=' (already converted to A1 relative to the paste target). */
  formula?: string;
  style?: CellStyle;
  colspan?: number;
  rowspan?: number;
}
export interface ParsedClip {
  rows: ClipCell[][];
  /** A1 ranges relative to the paste origin (0,0) for colspan/rowspan merges. */
  merges: RangeAddr[];
  /** Present when the payload came from this engine (exact formula re-anchoring). */
  internal?: InternalClip;
}
export interface InternalClip { sheetId: string; range: RangeAddr; workbookTag?: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function styleCss(st: CellStyle): string {
  const css: string[] = [];
  if (st.font?.bold) css.push('font-weight:700');
  if (st.font?.italic) css.push('font-style:italic');
  if (st.font?.underline) css.push('text-decoration:underline');
  if (st.font?.strike) css.push('text-decoration:line-through');
  if (st.font?.color) css.push(`color:${st.font.color}`);
  if (st.font?.size) css.push(`font-size:${st.font.size}pt`);
  if (st.font?.family) css.push(`font-family:${st.font.family}`);
  if (st.fill?.color) css.push(`background-color:${st.fill.color}`);
  if (st.align?.h && st.align.h !== 'general') css.push(`text-align:${st.align.h === 'centerContinuous' ? 'center' : st.align.h}`);
  if (st.align?.v) css.push(`vertical-align:${st.align.v === 'center' ? 'middle' : st.align.v}`);
  if (st.align?.wrap) css.push('white-space:normal');
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const b = st.borders?.[side];
    if (b) css.push(`border-${side}:${b.style === 'thick' ? '2px' : b.style === 'medium' ? '1.5px' : '1px'} ${b.style === 'dashed' || b.style === 'dotted' || b.style === 'double' ? b.style : 'solid'} ${b.color ?? '#000000'}`);
  }
  if (st.numFmt) css.push(`mso-number-format:"${st.numFmt.replace(/"/g, '\\"')}"`);
  return css.join(';');
}

/** Copy a range: TSV (display text, like Excel), HTML table with styles, and an internal payload. */
export function copyToClipboard(engine: SheetEngine, wb: Workbook, sheetId: string, range: RangeAddr | string): { tsv: string; html: string; internal: InternalClip } {
  const r = typeof range === 'string' ? parseRange(range)! : range;
  const sh = wb.sheets.find(s => s.id === sheetId)!;
  const tsvRows: string[] = [];
  const htmlRows: string[] = [];
  const covered = new Set<string>();
  for (let row = r.r1; row <= r.r2; row++) {
    const t: string[] = [], h: string[] = [];
    for (let col = r.c1; col <= r.c2; col++) {
      const disp = engine.getDisplay(sheetId, row, col, 255).text;
      t.push(/[\t\n"]/.test(disp) ? `"${disp.replace(/"/g, '""')}"` : disp);
      const a1 = toA1(row, col);
      if (covered.has(a1)) continue;
      const cell = getCell(sh.cells, row, col);
      const st = cell?.s !== undefined ? wb.styles[cell.s] ?? {} : {};
      const v = engine.getValue(sheetId, row, col);
      const attrs: string[] = [];
      const css = styleCss(st); if (css) attrs.push(`style="${esc(css)}"`);
      if (typeof v === 'number') attrs.push(`x:num="${v}"`);
      if (typeof v === 'boolean') attrs.push(`x:bool="${v ? 'TRUE' : 'FALSE'}"`);
      if (cell?.f !== undefined) attrs.push(`x:fmla="${esc('=' + cell.f)}"`);
      const merge = (sh.merges ?? []).map(m => parseRange(m)!).find(m => m.r1 === row && m.c1 === col);
      if (merge) {
        const rs = Math.min(merge.r2, r.r2) - row + 1, cs = Math.min(merge.c2, r.c2) - col + 1;
        if (rs > 1) attrs.push(`rowspan="${rs}"`);
        if (cs > 1) attrs.push(`colspan="${cs}"`);
        for (let i = row; i < row + rs; i++) for (let j = col; j < col + cs; j++) if (i !== row || j !== col) covered.add(toA1(i, j));
      }
      h.push(`<td${attrs.length ? ' ' + attrs.join(' ') : ''}>${esc(disp)}</td>`);
    }
    tsvRows.push(t.join('\t'));
    htmlRows.push(`<tr>${h.join('')}</tr>`);
  }
  const internal: InternalClip = { sheetId, range: r };
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table data-tela-sheet="${esc(sheetId)}" data-tela-range="${toA1(r.r1, r.c1)}:${toA1(r.r2, r.c2)}" style="border-collapse:collapse">${htmlRows.join('')}</table></body></html>`;
  return { tsv: tsvRows.join('\r\n') + '\r\n', html, internal };
}

// ── HTML parsing (no DOM: works in workers and tests) ────────────────────────

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENT[e.toLowerCase()] ?? m;
  });
}
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  const body = tag.replace(/^<\s*[a-zA-Z0-9]+/, '').replace(/\/?>$/, '');
  while ((m = re.exec(body))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}
function cssToStyle(css: string): CellStyle {
  const st: CellStyle = {};
  const decl = new Map<string, string>();
  for (const part of css.split(';')) { const i = part.indexOf(':'); if (i > 0) decl.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim()); }
  const font: NonNullable<CellStyle['font']> = {};
  const fw = decl.get('font-weight'); if (fw && (fw === 'bold' || Number(fw) >= 600)) font.bold = true;
  if (decl.get('font-style') === 'italic') font.italic = true;
  const td = decl.get('text-decoration') ?? decl.get('text-decoration-line') ?? '';
  if (/underline/.test(td)) font.underline = true;
  if (/line-through/.test(td)) font.strike = true;
  const color = decl.get('color'); if (color) font.color = cssColor(color);
  const size = decl.get('font-size'); if (size) { const n = parseFloat(size); if (n) font.size = /px/.test(size) ? Math.round(n * 0.75) : n; }
  const fam = decl.get('font-family'); if (fam) font.family = fam.replace(/["']/g, '').split(',')[0].trim();
  if (Object.keys(font).length) st.font = font;
  const bg = decl.get('background-color') ?? decl.get('background');
  if (bg && !/transparent|none|inherit/.test(bg)) { const c = cssColor(bg); if (c && c !== '#FFFFFF') st.fill = { color: c }; }
  const ta = decl.get('text-align');
  const align: NonNullable<CellStyle['align']> = {};
  if (ta && ['left', 'center', 'right', 'justify'].includes(ta)) align.h = ta as 'left';
  const va = decl.get('vertical-align'); if (va) align.v = va === 'middle' ? 'center' : va === 'top' ? 'top' : 'bottom';
  if (decl.get('white-space') === 'normal' || decl.get('white-space') === 'pre-wrap') align.wrap = true;
  if (Object.keys(align).length) st.align = align;
  const nf = decl.get('mso-number-format');
  if (nf) st.numFmt = nf.replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\\(.)/g, '$1');
  return clean(st);
}
function cssColor(c: string): string | undefined {
  c = c.trim().toLowerCase();
  const named: Record<string, string> = { black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', gray: '#808080', grey: '#808080' };
  if (named[c]) return named[c];
  let m = /^#([0-9a-f]{6})$/.exec(c); if (m) return '#' + m[1].toUpperCase();
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c); if (m) return ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
  m = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c); if (m) return '#' + [m[1], m[2], m[3]].map(x => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}

/** Parse clipboard data (HTML table preferred, TSV fallback). Formulas are resolved for `target` (needed for R1C1 sources). */
export function parseClipboard(data: { html?: string; text?: string }, target = { row: 0, col: 0 }): ParsedClip {
  const html = data.html ?? '';
  const tableM = /<table[\s\S]*?<\/table>/i.exec(html);
  if (tableM) return parseHtmlTable(html, tableM[0], target);
  const text = (data.text ?? '').replace(/\r?\n$/, '');
  const rows = text === '' ? [] : parseDelimited(text, '\t');
  return { rows: rows.map(r => r.map(t => ({ text: t }))), merges: [] };
}

function parseHtmlTable(html: string, table: string, target: { row: number; col: number }): ParsedClip {
  // Class styles from <style> blocks (Excel puts most formatting there).
  const classes = new Map<string, string>();
  for (const sm of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of sm[1].replace(/<!--|-->/g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      for (const sel of rule[1].split(',')) { const cm = /\.([A-Za-z0-9_-]+)\s*$/.exec(sel.trim()); if (cm) classes.set(cm[1], (classes.get(cm[1]) ?? '') + ';' + rule[2]); }
    }
  }
  const tableTag = /<table[^>]*>/i.exec(table)![0];
  const ta = attrsOf(tableTag);
  const internal = ta['data-tela-sheet'] && ta['data-tela-range'] ? { sheetId: ta['data-tela-sheet'], range: parseRange(ta['data-tela-range'])! } : undefined;
  const rows: ClipCell[][] = [];
  const merges: RangeAddr[] = [];
  const occupied = new Set<string>();
  let r = 0;
  for (const tr of table.matchAll(/<tr[^>]*>([\s\S]*?)(?=<tr[\s>]|<\/table>|$)/gi)) {
    const row: ClipCell[] = rows[r] ?? [];
    let c = 0;
    for (const td of tr[1].matchAll(/<t([dh])([^>]*)>([\s\S]*?)(?=<t[dh][\s>]|<\/tr>|$)/gi)) {
      while (occupied.has(`${r},${c}`)) { if (!row[c]) row[c] = { text: '' }; c++; }
      const a = attrsOf(`<td${td[2]}>`);
      const inner = td[3].replace(/<\/t[dh]>\s*$/i, '');
      const text = decodeEntities(inner.replace(/\s+/g, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/ /g, ' ').replace(/ *\n */g, '\n').trim();
      const css = (a.class ? a.class.split(/\s+/).map(k => classes.get(k) ?? '').join(';') : '') + ';' + (a.style ?? '');
      const st = cssToStyle(css);
      // Inline markup in the cell content (<b>, <i>, <u>).
      if (/<(b|strong)[\s>]/i.test(inner)) st.font = { ...(st.font ?? {}), bold: true };
      if (/<(i|em)[\s>]/i.test(inner)) st.font = { ...(st.font ?? {}), italic: true };
      if (/<u[\s>]/i.test(inner)) st.font = { ...(st.font ?? {}), underline: true };
      if (td[1].toLowerCase() === 'h') st.font = { ...(st.font ?? {}), bold: true };
      const cell: ClipCell = { text };
      if (Object.keys(st).length) cell.style = st;
      if (a['x:num'] !== undefined) { const n = Number(a['x:num'] || text.replace(/[^0-9.eE+-]/g, '')); if (Number.isFinite(n)) cell.value = n; }
      if (a['x:bool'] !== undefined) cell.value = a['x:bool'].toUpperCase() === 'TRUE';
      if (a['x:fmla']) cell.formula = a['x:fmla'].replace(/^=/, '');
      if (a['data-sheets-value']) {
        try {
          const j = JSON.parse(a['data-sheets-value']) as Record<string, unknown>;
          if (j['3'] !== undefined) cell.value = Number(j['3']);
          else if (j['2'] !== undefined) cell.value = String(j['2']);
          else if (j['4'] !== undefined) cell.value = !!j['4'];
        } catch { /* ignore malformed */ }
      }
      if (a['data-sheets-formula']) cell.formula = r1c1ToA1(a['data-sheets-formula'].replace(/^=/, ''), target.row + r, target.col + c);
      if (a['data-sheets-numberformat']) {
        try { const j = JSON.parse(a['data-sheets-numberformat']) as Record<string, unknown>; if (typeof j['2'] === 'string') cell.style = { ...(cell.style ?? {}), numFmt: j['2'] as string }; } catch { /* ignore */ }
      }
      const cs = Math.max(1, Number(a.colspan) || 1), rs = Math.max(1, Number(a.rowspan) || 1);
      if (cs > 1) cell.colspan = cs;
      if (rs > 1) cell.rowspan = rs;
      row[c] = cell;
      if (cs > 1 || rs > 1) {
        merges.push({ r1: r, c1: c, r2: r + rs - 1, c2: c + cs - 1 });
        for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) if (i !== r || j !== c) occupied.add(`${i},${j}`);
      }
      c += 1;
    }
    for (let k = 0; k < row.length; k++) if (!row[k]) row[k] = { text: '' };
    rows[r] = row;
    r++;
  }
  return { rows, merges, internal };
}

/**
 * Paste parsed clipboard data at (row, col). Internal payloads from the same
 * workbook go through copyRange (exact formula shifting, styles by id);
 * external ones are interpreted like typing, keeping basic formats.
 */
export function pasteClipboard(wb: Workbook, sheetId: string, at: { row: number; col: number }, clip: ParsedClip, mode: PasteMode = 'all'): OpResult {
  if (clip.internal && wb.sheets.some(s => s.id === clip.internal!.sheetId)) {
    return copyRange(wb, clip.internal.sheetId, clip.internal.range, sheetId, at, { mode });
  }
  const sh = wb.sheets.find(s => s.id === sheetId)!;
  const styles = wb.styles.slice();
  const changes: [string, Cell | undefined][] = [];
  clip.rows.forEach((row, i) => row.forEach((cc, j) => {
    const a1 = toA1(at.row + i, at.col + j);
    const cur = getCell(sh.cells, at.row + i, at.col + j);
    const next: Cell = {};
    if (mode === 'formats' || mode === 'all') {
      if (cc.style) { const s = internStyle(styles, mergeStyle(cur?.s !== undefined ? styles[cur.s] ?? {} : {}, cc.style as Record<string, unknown>)); if (s) next.s = s; }
      else if (cur?.s !== undefined && mode === 'formats') next.s = cur.s;
    } else if (cur?.s !== undefined) next.s = cur.s;
    if (mode !== 'formats') {
      if (cc.formula !== undefined && mode !== 'values') next.f = cc.formula;
      else if (cc.value !== undefined) next.v = cc.value;
      else {
        const g = guessInput(cc.text, next.s !== undefined ? styles[next.s]?.numFmt : undefined);
        if (g.kind === 'number') {
          next.v = g.value;
          if (g.numFmt && !(next.s !== undefined && styles[next.s]?.numFmt)) { const s = internStyle(styles, mergeStyle(next.s !== undefined ? styles[next.s] : {}, { numFmt: g.numFmt })); if (s) next.s = s; }
        } else if (g.kind === 'text') next.v = g.value;
        else if (g.kind === 'bool') next.v = g.value;
        else if (g.kind === 'formula') next.f = g.formula;
        else if (g.kind === 'error') next.f = g.code;
      }
    } else if (cur) { if (cur.v !== undefined) next.v = cur.v; if (cur.f !== undefined) next.f = cur.f; }
    changes.push([a1, Object.keys(next).length ? next : undefined]);
  }));
  const res = writeCells(wb, sheetId, changes, mode === 'all' ? 'Paste' : `Paste ${mode}`, styles);
  if (clip.merges.length && mode !== 'values') {
    const i = res.workbook.sheets.findIndex(s => s.id === sheetId);
    const s2 = res.workbook.sheets[i];
    const merges = [...(s2.merges ?? []), ...clip.merges.map(m => `${toA1(at.row + m.r1, at.col + m.c1)}:${toA1(at.row + m.r2, at.col + m.c2)}`)];
    const sheets = res.workbook.sheets.slice(); sheets[i] = { ...s2, merges };
    return { workbook: { ...res.workbook, sheets }, patch: { label: res.patch.label, sheets: [{ id: sh.id, before: sh, after: sheets[i] }] } };
  }
  return res;
}

export { shiftRelative, transformFormula, CellError };
