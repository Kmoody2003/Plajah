// Grading: every size of a garment in one pattern. Each size is drafted from our own size chart,
// then the pieces are stacked on a common zero point (the fold at the hem for fold pieces, the
// bottom centre of the piece otherwise), the way graded commercial patterns are printed: one
// cutting line per size, each in its own colour and line style, with a size key. The same nest
// goes to the preview, the print PDF, the DXF and the tech pack's graded spec (POM table).

import { type Pattern, type ParamValue, type SoftTemplate, SIZE_CHART } from './patterns';

export interface GradeSet { sizes: string[]; patterns: Pattern[]; /** The largest size: its labels, grain and notches carry the nest. */ base: Pattern }

/** Distinct, print-safe colours, and four line styles so neighbouring sizes differ in two ways. */
export const SIZE_COLOURS = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0284c7', '#4f46e5', '#9333ea', '#db2777', '#65a30d', '#0891b2', '#7c3aed', '#b45309', '#475569'];
export const SIZE_DASHES: number[][] = [[], [6, 3], [2, 2], [8, 3, 2, 3]];
export const sizeStyle = (i: number) => ({ color: SIZE_COLOURS[i % SIZE_COLOURS.length], dash: SIZE_DASHES[i % SIZE_DASHES.length] });
export const sizeRangeLabel = (sizes: string[]) => (sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]}` : sizes[0] ?? '');

/** The template's body sizes in chart order (empty when it has none: a mattress or bed size is not graded). */
export function sizesOf(t: SoftTemplate): string[] {
  const p = t.params.find(x => x.key === 'size' && x.type === 'select'); const all = p?.options?.map(o => o.value) ?? [];
  return all.length && all.every(s => s in SIZE_CHART) ? all : [];
}

/** Sizes from `from` to `to` inclusive, in chart order. */
export function sizeRange(all: string[], from: string, to: string): string[] {
  let i0 = all.indexOf(from), i1 = all.indexOf(to); if (i0 < 0 || i1 < 0) return [];
  if (i0 > i1) [i0, i1] = [i1, i0]; return all.slice(i0, i1 + 1);
}

/** Draft every size; null when fewer than two sizes are asked for or a size fails to draft. */
export function gradeSet(t: SoftTemplate, v: Record<string, ParamValue>, sizes: string[]): GradeSet | null {
  if (sizes.length < 2) return null;
  try { const patterns = sizes.map(size => t.build({ ...v, size })); return { sizes, patterns, base: patterns[patterns.length - 1] }; } catch { return null; }
}

export interface PomRow { pom: string; values: number[]; /** Average grade increment between neighbouring sizes (mm). */ step: number }
/** Graded measurement spec: each size's points of measure, plus the grade rule. */
export function gradePom(g: GradeSet): { sizes: string[]; rows: PomRow[] } {
  const rowsOf = (p: Pattern, s: string): Array<[string, number]> => {
    if (p.grading) { const k = p.grading.sizes.indexOf(s); if (k >= 0) return p.grading.rows.map(r => [r.pom, r.values[k]] as [string, number]); }
    return p.finished;
  };
  const table = g.sizes.map((s, i) => rowsOf(g.patterns[i], s)); const poms = table[table.length - 1].map(r => r[0]);
  return { sizes: g.sizes, rows: poms.map(pom => {
    const values = table.map(t => t.find(r => r[0] === pom)?.[1] ?? NaN); const d = values.slice(1).map((x, i) => x - values[i]).filter(Number.isFinite);
    return { pom, values, step: d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0 };
  }) };
}
