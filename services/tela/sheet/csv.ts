// csv — CSV/TSV parse and export (RFC 4180 quoting, delimiter sniffing).

import { toA1 } from './address';
import type { SheetEngine } from './engine';
import { createWorkbook, usedRange, type Workbook } from './model';
import { setCellInputs, type OpResult } from './ops';

/** Guess the delimiter from the first lines (tab, comma, semicolon, pipe). */
export function sniffDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts = ['\t', ',', ';', '|'].map(d => [d, sample.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export function parseDelimited(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false, i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
      continue;
    }
    if (ch === '"' && cur === '') q = true;
    else if (ch === d) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const quote = (s: string, d: string) => (s.includes(d) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export interface CsvExportOptions { delimiter?: string; /** Formatted text (default) or raw values. */ display?: boolean; range?: { r1: number; c1: number; r2: number; c2: number } }

export function exportDelimited(engine: SheetEngine, wb: Workbook, sheetId: string, o: CsvExportOptions = {}): string {
  const d = o.delimiter ?? ',';
  const sh = wb.sheets.find(s => s.id === sheetId)!;
  let { r2, c2 } = usedRange(sh);
  for (const sp of engine.getSpills(sheetId)) { r2 = Math.max(r2, sp.area.r2); c2 = Math.max(c2, sp.area.c2); }
  const R = o.range ?? { r1: 0, c1: 0, r2, c2 };
  const lines: string[] = [];
  for (let r = R.r1; r <= R.r2; r++) {
    const cells: string[] = [];
    for (let c = R.c1; c <= R.c2; c++) {
      if (o.display === false) { const v = engine.getValue(sheetId, r, c); cells.push(quote(v === null ? '' : typeof v === 'object' ? v.code : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v), d)); }
      else cells.push(quote(engine.getDisplay(sheetId, r, c, 255).text, d));
    }
    lines.push(cells.join(d));
  }
  return lines.join('\r\n');
}

/** Write parsed rows into a sheet at (row, col), interpreting each cell like typed input. */
export function importDelimitedInto(wb: Workbook, sheetId: string, text: string, at = { row: 0, col: 0 }, delimiter?: string): OpResult {
  const rows = parseDelimited(text, delimiter);
  const inputs: [string, string][] = [];
  rows.forEach((r, i) => r.forEach((v, j) => { if (v !== '') inputs.push([toA1(at.row + i, at.col + j), v]); }));
  return setCellInputs(wb, sheetId, inputs, 'Import CSV');
}

/** A new one-sheet workbook from CSV/TSV text. */
export function workbookFromDelimited(text: string, sheetName = 'Sheet1', delimiter?: string): Workbook {
  const wb = createWorkbook([sheetName]);
  return importDelimitedInto(wb, wb.sheets[0].id, text, undefined, delimiter).workbook;
}
