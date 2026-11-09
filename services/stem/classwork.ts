// STEM track → Academia classwork. No parallel system: a STEM project or lesson becomes an ordinary assignment
// template seed (data/assignmentTemplates TemplateSeed), the teacher adopts and assigns it with the same
// AssignTemplatePanel → templateAssignments → templateSubmissions → LessonGradingPanel flow every other subject
// uses. The one extra the assignment carries is `buildLaunch`, resolved from the seed id at assign time
// (services/assignmentTemplateService.assignTemplate), which puts an "Open in Plajah Build" step in the student's
// AssignedLessonView. Lesson practice also lays out as a Tela worksheet through the year-curriculum builder.

import type { TemplateSeed } from '../../data/assignmentTemplates';
import type { StandardRef } from '../../data/oerLibrary';
import type { BuildLaunch, StemBand, StemLesson, StemProject, StemStandards } from '../../data/stem/types';
import { STEM_LESSONS, STEM_PROJECTS, lessonById, projectById } from '../../data/stem';
import type { Worksheet, WsItem, WsSection, YearGrade } from '../yearCurriculum/types';

export const PROJECT_SEED_PREFIX = 'seed-stem-proj-';
export const LESSON_SEED_PREFIX = 'seed-stem-lesson-';

/** Only CCSS and NGSS are frameworks the ledger models; CSTA and international codes stay on the STEM page. */
export function standardRefs(s: StemStandards): StandardRef[] {
  return [
    ...(s.ccss || []).map(code => ({ framework: 'CCSS' as const, code })),
    ...(s.ngss || []).map(code => ({ framework: 'NGSS' as const, code })),
  ];
}

const rubricCriterion = (name: string, b: string, d: string, p: string, a: string) => ({
  name,
  levels: [
    { label: 'Beginning', descriptor: b, points: 1 },
    { label: 'Developing', descriptor: d, points: 2 },
    { label: 'Proficient', descriptor: p, points: 3 },
    { label: 'Advanced', descriptor: a, points: 4 },
  ],
});

export function projectSeed(p: StemProject): TemplateSeed {
  return {
    id: `${PROJECT_SEED_PREFIX}${p.id}`,
    subject: p.subject,
    gradeBand: p.band,
    taskType: 'projectBrief',
    structure: {
      title: p.title,
      objective: `${p.drivingQuestion} ${p.brief}`,
      standardsAlignment: standardRefs(p.standards),
      materials: [],
      steps: [
        ...p.steps,
        `Deliver: ${p.deliverables.join('; ')}.`,
        'Turn in: paste your Plajah Build share link (or a photo of your build) and write what you would change next time.',
      ],
      differentiation: p.differentiation,
      rubric: p.rubric,
      estimatedMinutes: p.minutes,
    },
  };
}

/** A lesson as classwork: hook, the Build activity, the practice set and the exit ticket, graded on a fixed rubric. */
export function lessonSeed(l: StemLesson & { band: StemBand }): TemplateSeed {
  return {
    id: `${LESSON_SEED_PREFIX}${l.id}`,
    subject: l.strands.includes('math') ? 'math' : 'science',
    gradeBand: l.band,
    taskType: 'practiceSet',
    structure: {
      title: l.title,
      objective: l.objectives.join(' '),
      standardsAlignment: standardRefs(l.standards),
      materials: [],
      steps: [
        `Warm up: ${l.hook}`,
        ...l.build.steps.map(s => `Build: ${s}`),
        ...l.practice.map((q, i) => `Practice ${i + 1}: ${q.q}`),
        `Exit ticket: ${l.exitTicket.q}`,
      ],
      differentiation: { support: l.differentiation.support.join(' '), extension: l.differentiation.extension.join(' ') },
      rubric: {
        criteria: [
          rubricCriterion('Build', 'Opened the room and started', 'Built part of the circuit or model', 'Built it and it works as described', 'Built it, tested a change and explained the result'),
          rubricCriterion('Math & science', 'Attempted the practice', 'Some practice correct', 'Most practice correct with units', 'All correct, with reasoning shown'),
          rubricCriterion('Explaining', 'Exit ticket blank or unclear', 'Partial explanation', 'Clear explanation using the vocabulary', 'Clear explanation that connects the build to the math'),
        ],
      },
      estimatedMinutes: l.minutes,
    },
  };
}

export const STEM_PROJECT_SEEDS: TemplateSeed[] = STEM_PROJECTS.map(projectSeed);
export const STEM_LESSON_SEEDS: TemplateSeed[] = STEM_LESSONS.map(lessonSeed);

/** The Build launch an assignment made from a STEM seed carries (null for any other seed). */
export function stemLaunchForSeed(seedId: string | null | undefined): BuildLaunch | null {
  if (!seedId) return null;
  if (seedId.startsWith(PROJECT_SEED_PREFIX)) {
    const p = projectById(seedId.slice(PROJECT_SEED_PREFIX.length));
    return p ? { ...p.launch, lesson: p.id } : null;
  }
  if (seedId.startsWith(LESSON_SEED_PREFIX)) {
    const l = lessonById(seedId.slice(LESSON_SEED_PREFIX.length));
    return l ? { ...l.build.launch, lesson: l.id } : null;
  }
  return null;
}

// ── Tela worksheet (reuses the year-curriculum layout engine) ────────────────

const bandGrade: Record<StemBand, YearGrade> = { 'K-2': 'g2', '3-5': 'g4', '6-8': 'g7', '9-12': 'g8' };
const bandTheme: Record<StemBand, string> = { 'K-2': 'tide', '3-5': 'circuit', '6-8': 'circuit', '9-12': 'circuit' };

export function lessonWorksheet(l: StemLesson & { band: StemBand }): Worksheet {
  const items: WsItem[] = l.practice.map((p, i) => ({
    id: `${l.id}-p${i + 1}`,
    kind: 'answer',
    prompt: p.q,
    answer: p.answer,
    numeric: typeof p.value === 'number',
    tolerance: p.tol,
    points: p.level,
    skill: l.mathFocus || l.strands[0],
    level: p.level,
    lines: p.value === undefined ? 2 : 1,
  }));
  const sections: WsSection[] = [
    {
      id: 'worked', title: 'Worked example', kind: 'worked', directions: 'Read each step. Then try the practice.',
      items: [], example: l.worked[0] ? { prompt: l.worked[0].prompt, steps: [...l.worked[0].steps, `Answer: ${l.worked[0].answer}`] } : undefined,
    },
    { id: 'practice', title: 'Practice', kind: 'practice', directions: 'Show your work and include units.', items },
    {
      id: 'exit', title: 'Exit ticket', kind: 'reflect', directions: 'Answer in a sentence or two.',
      items: [{ id: `${l.id}-exit`, kind: 'write', prompt: l.exitTicket.q, answer: l.exitTicket.answer, points: 2, skill: 'explain', level: 2, lines: 3 }],
    },
  ];
  return {
    id: `ws-${l.id}`,
    lessonId: l.id,
    title: l.title,
    kicker: `STEM Track · Grades ${l.band}`,
    grade: bandGrade[l.band],
    subject: 'math',
    objective: l.objectives[0],
    ccss: l.standards.ccss || [],
    intl: l.standards.intl || {},
    profile: { tier: 'core' },
    sections,
    themeId: bandTheme[l.band],
    adaptations: [],
    minutes: l.minutes,
    seed: 1,
  };
}
