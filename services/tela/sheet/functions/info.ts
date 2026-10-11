// info — Information functions (IS*, N, NA, TYPE, ERROR.TYPE, CELL, SHEET(S)).

import { scalarOf } from '../coerce';
import { colToLetters } from '../address';
import { compileFormat } from '../numfmt';
import { CellError, ERR, Lambda, Matrix, OMITTED, Ref, errorTypeNumber, type Value, isErr } from '../values';
import { N, S, omitted } from './helpers';
import { def } from './registry';

const L = { lift: 'all' as const };
def('ISBLANK', 'info', 1, 1, 'value', 'TRUE if the cell is empty.', a => a[0] === null || a[0] === OMITTED, L);
def('ISNUMBER', 'info', 1, 1, 'value', 'TRUE for numbers.', a => typeof a[0] === 'number', L);
def('ISTEXT', 'info', 1, 1, 'value', 'TRUE for text.', a => typeof a[0] === 'string', L);
def('ISNONTEXT', 'info', 1, 1, 'value', 'TRUE for anything but text.', a => typeof a[0] !== 'string', L);
def('ISLOGICAL', 'info', 1, 1, 'value', 'TRUE for logical values.', a => typeof a[0] === 'boolean', L);
def('ISERROR', 'info', 1, 1, 'value', 'TRUE for any error.', a => a[0] instanceof CellError, L);
def('ISERR', 'info', 1, 1, 'value', 'TRUE for errors other than #N/A.', a => a[0] instanceof CellError && a[0].code !== '#N/A', L);
def('ISNA', 'info', 1, 1, 'value', 'TRUE for #N/A.', a => a[0] instanceof CellError && a[0].code === '#N/A', L);
def('ISEVEN', 'info', 1, 1, 'number', 'TRUE for even numbers.', a => { const n = N(a[0]); return isErr(n) ? n : Math.trunc(n) % 2 === 0; }, L);
def('ISODD', 'info', 1, 1, 'number', 'TRUE for odd numbers.', a => { const n = N(a[0]); return isErr(n) ? n : Math.abs(Math.trunc(n) % 2) === 1; }, L);
def('ISREF', 'info', 1, 1, 'value', 'TRUE for references.', a => a[0] instanceof Ref);
def('ISFORMULA', 'info', 1, 1, 'reference', 'TRUE if the cell holds a formula.', (a, f) => {
  const r = a[0]; if (!(r instanceof Ref) || r.ext) return ERR.VALUE;
  const ar = r.areas[0]; return f.e.isFormulaCell(r.sheet, ar.r1, ar.c1);
}, { future: true });
def('N', 'info', 1, 1, 'value', 'Value converted to a number.', a => {
  const v = a[0];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof CellError) return v;
  return 0;
}, L);
def('NA', 'info', 0, 0, '', 'The #N/A error.', () => ERR.NA);
def('TYPE', 'info', 1, 1, 'value', 'Type code: 1 number, 2 text, 4 logical, 16 error, 64 array.', (a, f) => {
  const v = a[0];
  if (v instanceof Matrix || (v instanceof Ref && !v.isCell)) return 64;
  if (v instanceof Lambda) return 128;
  const s = scalarOf(v, f);
  if (typeof s === 'number' || s === null) return 1;
  if (typeof s === 'string') return 2;
  if (typeof s === 'boolean') return 4;
  return 16;
});
def('ERROR.TYPE', 'info', 1, 1, 'error_val', 'Number for an error value.', a => (a[0] instanceof CellError ? errorTypeNumber(a[0]) : ERR.NA), L);
def('SHEET', 'info', 0, 1, '[value]', 'Sheet number.', (a, f) => {
  if (omitted(a[0])) return f.s + 1;
  const v = a[0];
  if (v instanceof Ref) return v.sheet + 1;
  if (typeof v === 'string') { const i = f.e.sheetIndex(v); return i < 0 ? ERR.NA : i + 1; }
  return ERR.VALUE;
}, { future: true });
def('SHEETS', 'info', 0, 1, '[reference]', 'Number of sheets.', (a, f) => (omitted(a[0]) ? f.e.sheetCount() : 1), { future: true });

/** CELL format codes (Excel's short descriptors) for a number format. */
function cellFormatCode(fmt: string): string {
  const c = compileFormat(fmt);
  if (/^general$/i.test(fmt)) return 'G';
  if (c.isDate) {
    if (/^m+\/d+\/y+/i.test(fmt) || fmt.includes('d') && fmt.includes('y') && fmt.includes('m')) return 'D1';
    if (/d.*m/i.test(fmt) && !/y/i.test(fmt)) return 'D2';
    if (/m.*y/i.test(fmt) && !/d/i.test(fmt)) return 'D3';
    if (/h.*s/i.test(fmt)) return /am\/pm/i.test(fmt) ? 'D6' : 'D8';
    return /am\/pm/i.test(fmt) ? 'D7' : 'D9';
  }
  const dec = (fmt.split(';')[0].split('.')[1] ?? '').replace(/[^0#?].*$/, '').length;
  if (fmt.includes('%')) return 'P' + dec;
  if (/E[+-]/i.test(fmt)) return 'S' + dec;
  if (fmt.includes('$')) return 'C' + dec;
  if (fmt.includes(',')) return ',' + dec;
  return 'F' + dec;
}
def('CELL', 'info', 1, 2, 'info_type, [reference]', 'Information about a cell (address, col, row, contents, type, format, width).', (a, f) => {
  const t = S(a[0], f); if (isErr(t)) return t;
  const r = omitted(a[1]) ? new Ref(f.s, [{ r1: f.row, c1: f.col, r2: f.row, c2: f.col }]) : a[1];
  if (!(r instanceof Ref) || r.ext) return ERR.VALUE;
  const ar = r.areas[0];
  switch (t.toLowerCase()) {
    case 'address': return `$${colToLetters(ar.c1)}$${ar.r1 + 1}`;
    case 'col': return ar.c1 + 1;
    case 'row': return ar.r1 + 1;
    case 'contents': { const v = f.e.cellValue(r.sheet, ar.r1, ar.c1); return v === null ? 0 : v; }
    case 'type': { const v = f.e.cellValue(r.sheet, ar.r1, ar.c1); return v === null ? 'b' : typeof v === 'string' ? 'l' : 'v'; }
    case 'format': return cellFormatCode(f.e.numFmtAt(r.sheet, ar.r1, ar.c1));
    case 'filename': return '';
    case 'sheetname': return f.e.sheetName(r.sheet);
    case 'width': return 10;
    case 'prefix': { const v = f.e.cellValue(r.sheet, ar.r1, ar.c1); return typeof v === 'string' ? "'" : ''; }
    case 'protect': return 1;
    case 'parentheses': return /\(/.test(f.e.numFmtAt(r.sheet, ar.r1, ar.c1)) ? 1 : 0;
    case 'color': return /\[(red|color)/i.test(f.e.numFmtAt(r.sheet, ar.r1, ar.c1)) ? 1 : 0;
    default: return ERR.VALUE;
  }
}, { volatile: true });
def('INFO', 'info', 1, 1, 'type_text', 'Information about the environment.', (a, f) => {
  const t = S(a[0], f); if (isErr(t)) return t;
  switch (t.toLowerCase()) {
    case 'numfile': return f.e.sheetCount();
    case 'recalc': return 'Automatic';
    case 'system': return 'pcdos';
    case 'release': return '16.0';
    case 'osversion': return 'Tela';
    case 'origin': return '$A:$A$1';
    case 'directory': return '';
    default: return ERR.VALUE;
  }
}, { volatile: true });
