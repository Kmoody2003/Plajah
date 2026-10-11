// conditional — conditional-format and data-validation evaluation.
//
// CF rules resolve to a per-cell visual (style overlay, colour-scale fill,
// data bar, icon) that the Grid UI paints on top of the cell style. Formula
// rules are written relative to the top-left of the rule's first range and
// shifted per cell, like Excel. Validation checks a proposed value (custom
// formulas see the cell as if it already held that value).

import { parseRange, toA1, type RangeAddr } from './address';
import type { Node } from './ast';
import { compareScalars, matchKey, toBool, toStr, type Frame } from './coerce';
import type { SheetEngine } from './engine';
import { mergeStyle, usedRange, type CellStyle, type CfOperator, type CfValueObject, type ConditionalFormat, type DataValidation, type IconSetName, type Sheet, type Workbook } from './model';
import { parseFormula } from './parser';
import { shiftRelative } from './serialize';
import { CellError, Matrix, Ref, type Scalar, type Value, isErr } from './values';
import * as st from './functions/statcore';

export interface CfVisual {
  /** Style overlay from matching highlight rules (fill, font colour, bold, borders…). */
  style?: CellStyle;
  /** Colour-scale fill (#RRGGBB). */
  scaleColor?: string;
  dataBar?: { fraction: number; color: string; negative: boolean; showValue: boolean; gradient: boolean };
  icon?: { set: IconSetName; index: number; count: number; showValue: boolean };
}

const ICON_COUNT = (s: IconSetName) => Number(s[0]);

function rangesOf(list: string): RangeAddr[] {
  return list.split(/\s+/).map(r => parseRange(r)).filter((r): r is RangeAddr => !!r);
}
function bounded(r: RangeAddr, sh: { maxRow: number; maxCol: number }): RangeAddr | null {
  const r2 = Math.min(r.r2, sh.maxRow), c2 = Math.min(r.c2, sh.maxCol);
  return r2 < r.r1 || c2 < r.c1 ? null : { r1: r.r1, c1: r.c1, r2, c2 };
}
function extent(sheet: Sheet, engine: SheetEngine, sheetId: string): { maxRow: number; maxCol: number } {
  void engine; void sheetId;
  const u = usedRange(sheet);
  return { maxRow: u.r2, maxCol: u.c2 };
}

const truthy = (v: Value): boolean => {
  const s = v instanceof Matrix ? v.get(0, 0) : v instanceof Ref ? null : (v as Scalar);
  if (s instanceof CellError || s === null || typeof s === 'string') return false;
  const b = toBool(s as Scalar); return !isErr(b) && b;
};
const scalar = (v: Value): Scalar => (v instanceof Matrix ? v.get(0, 0) : v instanceof Ref ? null : (v as Scalar));

function cmpOp(op: CfOperator, v: Scalar, a: Scalar, b: Scalar): boolean {
  if (v instanceof CellError) return false;
  const c1 = compareScalars(v, a);
  switch (op) {
    case 'equal': return c1 === 0;
    case 'notEqual': return c1 !== 0;
    case 'greaterThan': return c1 > 0;
    case 'lessThan': return c1 < 0;
    case 'greaterThanOrEqual': return c1 >= 0;
    case 'lessThanOrEqual': return c1 <= 0;
    case 'between': { const lo = compareScalars(a, b) <= 0 ? a : b, hi = lo === a ? b : a; return compareScalars(v, lo) >= 0 && compareScalars(v, hi) <= 0; }
    case 'notBetween': { const lo = compareScalars(a, b) <= 0 ? a : b, hi = lo === a ? b : a; return compareScalars(v, lo) < 0 || compareScalars(v, hi) > 0; }
  }
}

function hex(c: string) { const h = c.replace('#', ''); const x = h.length === 8 ? h.slice(2) : h; return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
function mix(a: string, b: string, t: number) {
  const p = hex(a), q = hex(b);
  return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Resolve a cfvo threshold against the numeric values of the range. */
function threshold(c: CfValueObject, nums: number[], engine: SheetEngine, sheet: number, at: { row: number; col: number }, isMin: boolean): number {
  switch (c.type) {
    case 'min': return nums.length ? Math.min(...nums) : 0;
    case 'max': return nums.length ? Math.max(...nums) : 0;
    case 'num': return Number(c.value ?? 0);
    case 'percent': { const lo = Math.min(...nums), hi = Math.max(...nums); return lo + ((hi - lo) * Number(c.value ?? (isMin ? 0 : 100))) / 100; }
    case 'percentile': return st.percentileInc(nums, Number(c.value ?? 50) / 100);
    case 'formula': { const v = scalar(engine.evaluate(c.value ?? '0', sheet, at.row, at.col)); return typeof v === 'number' ? v : 0; }
  }
}

/**
 * Visual results of every conditional format on a sheet, keyed by A1.
 * Pass `viewport` to limit work to visible cells (statistics such as
 * top-10 / averages / scales still use the whole rule range).
 */
export function evaluateConditionalFormats(engine: SheetEngine, wb: Workbook, sheetId: string, viewport?: RangeAddr): Map<string, CfVisual> {
  const out = new Map<string, CfVisual>();
  const sheet = wb.sheets.find(s => s.id === sheetId); if (!sheet?.conditionalFormats?.length) return out;
  const si = engine.sheetIndexOf(sheetId);
  const ext = extent(sheet, engine, sheetId);
  const rules = sheet.conditionalFormats.slice().sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9));
  const stopped = new Set<string>();
  const astCache = new Map<string, Node | null>();
  const parse = (f: string) => { if (!astCache.has(f)) { try { astCache.set(f, parseFormula(f)); } catch { astCache.set(f, null); } } return astCache.get(f)!; };
  for (const cf of rules) {
    const ranges = rangesOf(cf.ranges);
    if (!ranges.length) continue;
    const origin = { row: ranges[0].r1, col: ranges[0].c1 };
    // Cells of the rule (bounded by used extent) with their values.
    const cells: { row: number; col: number; a1: string; v: Scalar }[] = [];
    for (const r0 of ranges) { const r = bounded(r0, ext); if (!r) continue; for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) cells.push({ row, col, a1: toA1(row, col), v: engine.getValue(si, row, col) }); }
    const inView = (c: { row: number; col: number }) => !viewport || (c.row >= viewport.r1 && c.row <= viewport.r2 && c.col >= viewport.c1 && c.col <= viewport.c2);
    const nums = cells.map(c => c.v).filter((v): v is number => typeof v === 'number');
    const rule = cf.rule;
    const apply = (a1: string, vis: CfVisual) => {
      if (stopped.has(a1)) return;
      const cur = out.get(a1) ?? {};
      // Earlier (higher-priority) rules win conflicting properties.
      if (vis.style) cur.style = cur.style ? mergeStyle(vis.style, cur.style as Record<string, unknown>) : vis.style;
      if (vis.scaleColor && !cur.scaleColor) cur.scaleColor = vis.scaleColor;
      if (vis.dataBar && !cur.dataBar) cur.dataBar = vis.dataBar;
      if (vis.icon && !cur.icon) cur.icon = vis.icon;
      out.set(a1, cur);
      if (cf.stopIfTrue) stopped.add(a1);
    };
    const evalAt = (f: string, c: { row: number; col: number }) => {
      const ast = parse(f); if (!ast) return null;
      return engine.evaluateAst(shiftRelative(ast, c.row - origin.row, c.col - origin.col), si, c.row, c.col);
    };
    switch (rule.type) {
      case 'cellIs': {
        for (const c of cells) {
          if (!inView(c) || c.v === null) continue;
          const a = scalar(evalAt(rule.formulas[0] ?? '0', c) ?? null), b = scalar(evalAt(rule.formulas[1] ?? '0', c) ?? null);
          if (cmpOp(rule.operator, c.v, a, b)) apply(c.a1, { style: rule.style });
        }
        break;
      }
      case 'expression':
        for (const c of cells) if (inView(c)) { const v = evalAt(rule.formula, c); if (v !== null && truthy(v)) apply(c.a1, { style: rule.style }); }
        break;
      case 'containsText': case 'notContainsText': case 'beginsWith': case 'endsWith': {
        const q = rule.text.toLowerCase();
        for (const c of cells) {
          if (!inView(c)) continue;
          const t = toStr(c.v); const s = (isErr(t) ? '' : t).toLowerCase();
          const hit = rule.type === 'beginsWith' ? s.startsWith(q) : rule.type === 'endsWith' ? s.endsWith(q) : s.includes(q);
          if (rule.type === 'notContainsText' ? !hit : hit) apply(c.a1, { style: rule.style });
        }
        break;
      }
      case 'containsBlanks': case 'notContainsBlanks': case 'containsErrors': case 'notContainsErrors': {
        for (const c of cells) {
          if (!inView(c)) continue;
          const blank = c.v === null || (typeof c.v === 'string' && !c.v.trim());
          const err = c.v instanceof CellError;
          const hit = rule.type === 'containsBlanks' ? blank : rule.type === 'notContainsBlanks' ? !blank : rule.type === 'containsErrors' ? err : !err;
          if (hit) apply(c.a1, { style: rule.style });
        }
        break;
      }
      case 'duplicateValues': case 'uniqueValues': {
        const counts = new Map<string, number>();
        for (const c of cells) if (c.v !== null) counts.set(matchKey(c.v), (counts.get(matchKey(c.v)) ?? 0) + 1);
        for (const c of cells) {
          if (!inView(c) || c.v === null) continue;
          const n = counts.get(matchKey(c.v)) ?? 0;
          if (rule.type === 'duplicateValues' ? n > 1 : n === 1) apply(c.a1, { style: rule.style });
        }
        break;
      }
      case 'top10': {
        const sorted = nums.slice().sort((a, b) => (rule.bottom ? a - b : b - a));
        const k = rule.percent ? Math.max(1, Math.floor((nums.length * rule.rank) / 100)) : rule.rank;
        const cut = sorted[Math.min(k, sorted.length) - 1];
        for (const c of cells) if (inView(c) && typeof c.v === 'number' && cut !== undefined && (rule.bottom ? c.v <= cut : c.v >= cut)) apply(c.a1, { style: rule.style });
        break;
      }
      case 'aboveAverage': {
        if (!nums.length) break;
        const m = st.mean(nums), sd = nums.length > 1 ? Math.sqrt(st.varP(nums)) : 0;
        const lim = rule.stdDev ? (rule.below ? m - rule.stdDev * sd : m + rule.stdDev * sd) : m;
        for (const c of cells) {
          if (!inView(c) || typeof c.v !== 'number') continue;
          const hit = rule.below ? (rule.equalAverage ? c.v <= lim : c.v < lim) : rule.equalAverage ? c.v >= lim : c.v > lim;
          if (hit) apply(c.a1, { style: rule.style });
        }
        break;
      }
      case 'colorScale': {
        if (!nums.length) break;
        const th = rule.cfvo.map((c, i) => threshold(c, nums, engine, si, origin, i === 0));
        for (const c of cells) {
          if (!inView(c) || typeof c.v !== 'number') continue;
          let color: string;
          if (th.length === 2) { const t = th[1] === th[0] ? 0 : Math.min(1, Math.max(0, (c.v - th[0]) / (th[1] - th[0]))); color = mix(rule.colors[0], rule.colors[1], t); }
          else if (c.v <= th[1]) { const t = th[1] === th[0] ? 0 : Math.max(0, (c.v - th[0]) / (th[1] - th[0])); color = mix(rule.colors[0], rule.colors[1], t); }
          else { const t = th[2] === th[1] ? 1 : Math.min(1, (c.v - th[1]) / (th[2] - th[1])); color = mix(rule.colors[1], rule.colors[2], t); }
          apply(c.a1, { scaleColor: color });
        }
        break;
      }
      case 'dataBar': {
        if (!nums.length) break;
        const lo = threshold(rule.cfvo[0] ?? { type: 'min' }, nums, engine, si, origin, true);
        const hi = threshold(rule.cfvo[1] ?? { type: 'max' }, nums, engine, si, origin, false);
        for (const c of cells) {
          if (!inView(c) || typeof c.v !== 'number') continue;
          // With negatives the bar grows from an axis at 0; otherwise from the minimum.
          const span = lo < 0 ? Math.max(Math.abs(hi), Math.abs(lo)) : hi - lo;
          const fraction = span === 0 ? 1 : lo < 0 ? Math.min(1, Math.abs(c.v) / span) : Math.min(1, Math.max(0, (c.v - lo) / span));
          apply(c.a1, { dataBar: { fraction, color: rule.color, negative: c.v < 0, showValue: rule.showValue !== false, gradient: rule.gradient !== false } });
        }
        break;
      }
      case 'iconSet': {
        if (!nums.length) break;
        const count = ICON_COUNT(rule.iconSet);
        const defaults = Array.from({ length: count }, (_, i) => ({ type: 'percent' as const, value: String(Math.round((i * 100) / count)) }));
        const cfvo = rule.cfvo.length === count ? rule.cfvo : defaults;
        const th = cfvo.map((c, i) => threshold(c, nums, engine, si, origin, i === 0));
        for (const c of cells) {
          if (!inView(c) || typeof c.v !== 'number') continue;
          let idx = 0;
          for (let i = 1; i < count; i++) if (c.v >= th[i]) idx = i;
          if (rule.reverse) idx = count - 1 - idx;
          apply(c.a1, { icon: { set: rule.iconSet, index: idx, count, showValue: rule.showValue !== false } });
        }
        break;
      }
    }
  }
  return out;
}

// ── Data validation ──────────────────────────────────────────────────────────

/** The validation rule covering a cell, if any. */
export function validationAt(sheet: Sheet, row: number, col: number): DataValidation | undefined {
  return sheet.dataValidations?.find(dv => rangesOf(dv.ranges).some(r => row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2));
}

function dvOrigin(dv: DataValidation) { const r = rangesOf(dv.ranges)[0]; return r ? { row: r.r1, col: r.c1 } : { row: 0, col: 0 }; }

/** Dropdown options for a list rule (literal list, a range, or an array formula). */
export function listOptions(engine: SheetEngine, wb: Workbook, sheetId: string, row: number, col: number): string[] | null {
  const sheet = wb.sheets.find(s => s.id === sheetId); if (!sheet) return null;
  const dv = validationAt(sheet, row, col);
  if (!dv || dv.type !== 'list') return null;
  if (dv.list) return dv.list;
  if (!dv.formula1) return [];
  const f1 = dv.formula1.replace(/^=/, '');
  if (/^"[^"]*"$/.test(f1)) return f1.slice(1, -1).split(',').map(s => s.trim());
  const o = dvOrigin(dv);
  let ast: Node; try { ast = shiftRelative(parseFormula(f1), row - o.row, col - o.col); } catch { return []; }
  const v = engine.evaluateAst(ast, engine.sheetIndexOf(sheetId), row, col);
  const m = v instanceof Matrix ? v : new Matrix([[scalar(v)]]);
  return m.data.flat().filter(x => x !== null && !(x instanceof CellError)).map(x => { const t = toStr(x as Scalar); return isErr(t) ? '' : t; });
}

export interface ValidationResult { ok: boolean; title?: string; message?: string; style?: DataValidation['errorStyle'] }

/** Would `value` be accepted in (row, col)? */
export function validateValue(engine: SheetEngine, wb: Workbook, sheetId: string, row: number, col: number, value: Scalar): ValidationResult {
  const sheet = wb.sheets.find(s => s.id === sheetId); if (!sheet) return { ok: true };
  const dv = validationAt(sheet, row, col);
  if (!dv || dv.type === 'any') return { ok: true };
  const fail = (): ValidationResult => ({ ok: false, title: dv.errorTitle ?? 'Invalid entry', message: dv.error ?? 'This value does not match the data validation rules for this cell.', style: dv.errorStyle ?? 'stop' });
  if (value === null || value === '') return dv.allowBlank === false ? fail() : { ok: true };
  const si = engine.sheetIndexOf(sheetId);
  const o = dvOrigin(dv);
  const evalF = (f?: string): Scalar => {
    if (!f) return null;
    try { return scalar(engine.evaluateAst(shiftRelative(parseFormula(f.replace(/^=/, '')), row - o.row, col - o.col), si, row, col)); } catch { return null; }
  };
  switch (dv.type) {
    case 'list': {
      const opts = listOptions(engine, wb, sheetId, row, col) ?? [];
      const t = toStr(value); const s = isErr(t) ? '' : t.toLowerCase();
      return opts.some(x => x.toLowerCase() === s) ? { ok: true } : fail();
    }
    case 'custom': {
      let ast: Node; try { ast = shiftRelative(parseFormula((dv.formula1 ?? 'TRUE').replace(/^=/, '')), row - o.row, col - o.col); } catch { return fail(); }
      return truthy(engine.evaluateAst(ast, si, row, col, { row, col, value })) ? { ok: true } : fail();
    }
    default: {
      let v: Scalar = value;
      if (dv.type === 'textLength') { const t = toStr(value); v = isErr(t) ? 0 : t.length; }
      else if (typeof v !== 'number') return fail();
      if (dv.type === 'whole' && !Number.isInteger(v)) return fail();
      const a = evalF(dv.formula1), b = evalF(dv.formula2);
      return cmpOp(dv.operator ?? 'between', v, a, b) ? { ok: true } : fail();
    }
  }
}

export type { Frame, ConditionalFormat };
