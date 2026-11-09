// STEM track — the whole K–12 scope & sequence in one place. See data/stem/types.ts for the model.
import type { StemBand, StemLesson, StemProject, StemUnit } from './types';
import { K2_UNITS, K2_PROJECTS } from './band.k2';
import { G35_UNITS, G35_PROJECTS } from './band.35';
import { G68_UNITS, G68_PROJECTS } from './band.68';
import { G912_UNITS, G912_PROJECTS } from './band.912';

export * from './types';

export const STEM_UNITS: StemUnit[] = [...K2_UNITS, ...G35_UNITS, ...G68_UNITS, ...G912_UNITS];
export const STEM_PROJECTS: StemProject[] = [...K2_PROJECTS, ...G35_PROJECTS, ...G68_PROJECTS, ...G912_PROJECTS];
export const STEM_LESSONS: Array<StemLesson & { unitId: string; band: StemBand }> =
  STEM_UNITS.flatMap(u => u.lessons.map(l => ({ ...l, unitId: u.id, band: u.band })));

export const STEM_TRACK_META = {
  id: 'stem-track',
  label: 'STEM Track',
  blurb: 'Science, technology, engineering and math from kindergarten to senior year, built hands-on in Plajah Build: circuits that teach proportion, enclosures that teach area, sensors that teach statistics, plush that teaches geometry.',
  accent: '#0E8074',
};

export const unitsForBand = (band: StemBand) => STEM_UNITS.filter(u => u.band === band).sort((a, b) => a.n - b.n);
export const unitById = (id: string) => STEM_UNITS.find(u => u.id === id);
export const lessonById = (id: string) => STEM_LESSONS.find(l => l.id === id);
export const projectById = (id: string) => STEM_PROJECTS.find(p => p.id === id);
export const projectsForBand = (band: StemBand) => STEM_PROJECTS.filter(p => p.band === band);

/** Short CCSS form: 'CCSS.MATH.CONTENT.6.RP.A.3' → '6.RP.A.3'. */
export const shortCcss = (code: string) => code.replace(/^CCSS\.MATH\.CONTENT\./, '').replace(/^CCSS\.MATH\./, '');

/** STEM lessons that teach any of these CCSS-M standards: how year-curriculum math units find their Build lessons. */
export function stemLessonsForCcss(codes: string[]): Array<StemLesson & { unitId: string; band: StemBand }> {
  const want = new Set(codes.map(shortCcss));
  // A unit's cluster ('6.RP.A') matches a lesson's standard in that cluster too, so related lessons surface.
  const clusters = new Set([...want].map(c => c.split('.').slice(0, 3).join('.')));
  return STEM_LESSONS.filter(l => (l.standards.ccss || []).some(c => { const s = shortCcss(c); return want.has(s) || clusters.has(s.split('.').slice(0, 3).join('.')); }));
}

/** STEM lessons that evidence an NGSS performance expectation (science year units, Museion). */
export function stemLessonsForNgss(codes: string[]): Array<StemLesson & { unitId: string; band: StemBand }> {
  const want = new Set(codes);
  return STEM_LESSONS.filter(l => (l.standards.ngss || []).some(c => want.has(c)));
}

export const STEM_COUNTS = () => ({
  units: STEM_UNITS.length,
  complete: STEM_UNITS.filter(u => u.status === 'complete').length,
  lessons: STEM_LESSONS.length,
  projects: STEM_PROJECTS.length,
  practice: STEM_LESSONS.reduce((n, l) => n + l.practice.length, 0),
});
