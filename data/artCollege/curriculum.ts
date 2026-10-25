/**
 * Flattens the Art College catalog into a `Curriculum` for the shared SchoolView reader, so every
 * unit gets progress, the Academic Passport ledger and a lesson page for free. One track per
 * course; one lesson per unit. The lesson body is composed from the unit, never duplicated.
 */
import type { Curriculum, Lesson, Track } from '../../services/schoolChassis';
import { COURSES, unitKey } from './index';
import { DEPT_LABEL, type Course, type CourseUnit } from './types';
import { critiqueFormat } from './critique';

const LEVEL: Record<number, Track['level']> = { 100: 'FOUNDATION', 200: 'INTERMEDIATE', 300: 'ADVANCED', 400: 'ADVANCED' };

export function unitBody(course: Course, u: CourseUnit): string {
  const crit = u.critique ? critiqueFormat(u.critique) : null;
  return [
    u.teach,
    `By the end of this unit you can:\n${u.outcomes.map(o => `• ${o}`).join('\n')}`,
    `Studio: ${u.studio.prompt}\nHand in: ${u.studio.deliverable}.`,
    u.studio.figure && u.studio.alt ? `Figure studies are for verified adult learners. Everyone else does this instead: ${u.studio.alt}` : '',
    crit ? `Critique format: ${crit.title} (${crit.minutes} min) — ${crit.steps.map(s => s.label).join(' → ')}.` : '',
  ].filter(Boolean).join('\n\n');
}

function lessonFor(course: Course, u: CourseUnit): Lesson {
  return {
    id: unitKey(course, u),
    title: u.title,
    blurb: `${course.code} · ${u.weeks} wk · ${u.studio.deliverable}`,
    minutes: Math.min(90, u.weeks * 20),
    body: unitBody(course, u),
    standardIds: ['PJART.COLLEGE.' + course.dept],
    assignment: { prompt: `${u.studio.prompt} Hand in: ${u.studio.deliverable}.`, tool: u.studio.tool ?? 'NONE', postTag: 'artcollege' },
    resources: course.resources,
    museum: u.study,
  };
}

export const ART_COLLEGE_CURRICULUM: Curriculum = {
  id: 'art-college',
  label: 'Art College',
  blurb: 'A four-year studio and scholarship curriculum — foundation, drawing and painting, sculpture and ceramics, graphic design, illustration, fashion, photography and art history — taught by looking at real museum objects, made in your own studio, and tested in critique.',
  accent: '#E5B94E',
  framework: 'PLAJAH_ART_COLLEGE',
  tracks: COURSES.map(c => ({
    id: c.code.replace(' ', '-').toLowerCase(),
    title: `${c.code} · ${c.title}`,
    blurb: `${DEPT_LABEL[c.dept]} · ${c.credits} credits. ${c.blurb}`,
    level: LEVEL[c.level],
    lessons: c.units.map(u => lessonFor(c, u)),
  })),
};

export default ART_COLLEGE_CURRICULUM;
