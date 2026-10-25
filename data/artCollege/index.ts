/**
 * Art College catalog — one import for programs, courses, critique formats and reviews, plus the
 * integrity helpers the UI, the check script and the tests share.
 */
import type { Course, Program, CourseUnit } from './types';
import { FOUNDATION_COURSES } from './courses.foundation';
import { STUDIO_COURSES } from './courses.studio';
import { DESIGN_COURSES } from './courses.design';
import { FASHION_COURSES } from './courses.fashion';
import { SCHOLARSHIP_COURSES } from './courses.scholarship';
import { THESIS_COURSES } from './courses.thesis';
import { PROGRAMS } from './programs';

export * from './types';
export { PROGRAMS, programById } from './programs';
export { CRITIQUE_FORMATS, critiqueFormat, RUBRICS, PORTFOLIO_REVIEWS, reviewFor } from './critique';

export const COURSES: Course[] = [
  ...FOUNDATION_COURSES, ...STUDIO_COURSES, ...DESIGN_COURSES, ...FASHION_COURSES, ...SCHOLARSHIP_COURSES, ...THESIS_COURSES,
].sort((a, b) => a.code.localeCompare(b.code));

const byCode = new Map(COURSES.map(c => [c.code, c]));
export const courseByCode = (code: string) => byCode.get(code);
export const unitKey = (course: Course, unit: CourseUnit) => `${course.code.replace(' ', '').toLowerCase()}-${unit.id}`;

export const programCredits = (p: Program): number =>
  p.years.reduce((n, y) => n + y.courses.reduce((m, c) => m + (byCode.get(c)?.credits ?? 0), 0) + y.electives * 3, 0);

/** Catalog integrity problems; empty when the catalog is sound. */
export function validateCatalog(): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const c of COURSES) {
    if (seen.has(c.code)) errs.push(`duplicate course ${c.code}`);
    seen.add(c.code);
    if (!c.code.startsWith(c.dept + ' ')) errs.push(`${c.code}: dept ${c.dept} does not match code`);
    if (Math.floor(Number(c.code.split(' ')[1]) / 100) * 100 !== c.level) errs.push(`${c.code}: level ${c.level} does not match code`);
    if (c.grading.reduce((n, g) => n + g.pct, 0) !== 100) errs.push(`${c.code}: grading does not sum to 100`);
    if (!c.units.length) errs.push(`${c.code}: no units`);
    const ids = new Set<string>();
    for (const u of c.units) {
      if (ids.has(u.id)) errs.push(`${c.code}: duplicate unit ${u.id}`);
      ids.add(u.id);
      if (!u.teach || !u.studio?.prompt || !u.studio?.deliverable || !u.outcomes?.length) errs.push(`${c.code}/${u.id}: incomplete unit`);
      if (u.studio.figure && !u.studio.alt) errs.push(`${c.code}/${u.id}: figure studio without an alt brief`);
    }
    for (const p of c.prereq) if (!byCode.has(p)) errs.push(`${c.code}: unknown prereq ${p}`);
  }
  for (const p of PROGRAMS) {
    const placed = new Map<string, number>();
    p.years.forEach(y => y.courses.forEach(code => {
      if (!byCode.has(code)) errs.push(`${p.id}: unknown course ${code}`);
      if (placed.has(code)) errs.push(`${p.id}: ${code} placed twice`);
      placed.set(code, y.year);
    }));
    p.years.forEach(y => y.courses.forEach(code => {
      for (const pre of byCode.get(code)?.prereq ?? []) {
        const at = placed.get(pre);
        if (at === undefined) errs.push(`${p.id}: ${code} needs ${pre}, which the plan lacks`);
        else if (at > y.year) errs.push(`${p.id}: ${code} (year ${y.year}) comes before its prereq ${pre} (year ${at})`);
      }
    }));
    if (programCredits(p) !== p.credits) errs.push(`${p.id}: plan totals ${programCredits(p)} credits, stated ${p.credits}`);
  }
  return errs;
}
