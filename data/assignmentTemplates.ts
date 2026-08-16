// assignmentTemplates — one template model across every subject. Subject packs are
// CONFIGURATIONS, not new code: math, ELA, science, social studies, world language and arts all
// render through the same structure, rubric and differentiation shape.
//
// Teacher flow: subject → grade band → task type → a populated template with licence-appropriate
// materials suggested → edit → then either
//   • assign it from the District persona (free, always allowed), or
//   • package it into a paid course from the Independent persona — where the licence filter
//     applies automatically at the wall (CC-BY / PD materials only).
//
// That last branch is where the two halves of the Integrity Wall meet: the boundary separating
// the personas is the same boundary separating what content may cross into commercial use.

import type { GradeBand, LibrarySubject, StandardRef } from './oerLibrary';
import type { License } from '../services/oerLicenseGate';

export type TaskType =
  | 'practiceSet' | 'readingResponse' | 'labReport' | 'essay'
  | 'projectBrief' | 'exitTicket' | 'quiz' | 'discussion';

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  practiceSet: 'Practice set',
  readingResponse: 'Reading response',
  labReport: 'Lab report',
  essay: 'Essay',
  projectBrief: 'Project brief',
  exitTicket: 'Exit ticket',
  quiz: 'Quiz',
  discussion: 'Discussion',
};

export const SUBJECT_LABEL: Record<LibrarySubject, string> = {
  ela: 'English / Language Arts',
  math: 'Mathematics',
  science: 'Science',
  socialStudies: 'Social Studies',
  worldLang: 'World Languages',
  arts: 'Arts',
};

export interface RubricCriterion {
  name: string;
  levels: Array<{ label: string; descriptor: string; points: number }>;
}

export interface Rubric { criteria: RubricCriterion[] }

export interface TemplateStructure {
  title: string;
  objective: string;
  standardsAlignment: StandardRef[];
  /** libraryItem ids. Filtered by the licence gate when commercialUse is on. */
  materials: string[];
  steps: string[];
  differentiation: { support: string; extension: string };
  rubric: Rubric;
  estimatedMinutes: number;
}

export interface AssignmentTemplate {
  id: string;
  ownerUid: string;
  subject: LibrarySubject;
  gradeBand: GradeBand;
  taskType: TaskType;
  visibility: 'private' | 'public';
  /** True when packaged into a paid Independent-persona offering. Requires licenseValidated,
   *  which only the server may set — the rules refuse a commercial template without it. */
  commercialUse: boolean;
  licenseValidated: boolean;
  /** Most restrictive licence across attached materials. */
  license: License;
  /** Provenance chain for teacher remixes. */
  remixOf: string | null;
  structure: TemplateStructure;
  createdAt: number;
  updatedAt: number;
}

/** The seed shape — no ownership or validation state until a teacher adopts one. */
export type TemplateSeed = Pick<AssignmentTemplate, 'subject' | 'gradeBand' | 'taskType'> & {
  id: string;
  structure: TemplateStructure;
};

// A four-level rubric is the house default; a criterion is one row.
const criterion = (
  name: string,
  beginning: string, developing: string, proficient: string, advanced: string,
): RubricCriterion => ({
  name,
  levels: [
    { label: 'Beginning', descriptor: beginning, points: 1 },
    { label: 'Developing', descriptor: developing, points: 2 },
    { label: 'Proficient', descriptor: proficient, points: 3 },
    { label: 'Advanced', descriptor: advanced, points: 4 },
  ],
});

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    id: 'seed-math-68-ratios',
    subject: 'math',
    gradeBand: '6-8',
    taskType: 'practiceSet',
    structure: {
      title: 'Ratios in the Real World',
      objective: 'Students use ratio language to describe relationships between quantities and solve unit-rate problems from real contexts.',
      standardsAlignment: [
        { framework: 'CCSS', code: 'CCSS.MATH.6.RP.A.1' },
        { framework: 'CCSS', code: 'CCSS.MATH.6.RP.A.2' },
        { framework: 'PISA', code: 'PISA.MATH.L2' },
      ],
      materials: ['openstax-prealgebra-2e'],
      steps: [
        'Warm-up: identify three ratios in the classroom (5 min)',
        'Guided practice from OpenStax Prealgebra Ch. 5 exercise set',
        'Partner task: price-per-unit comparison from a real store flyer',
        'Exit check: two unit-rate problems, self-scored against the rubric',
      ],
      differentiation: {
        support: 'Provide a ratio-table graphic organizer; use whole-number quantities only.',
        extension: 'Introduce three-quantity ratios and part:part:whole reasoning.',
      },
      rubric: {
        criteria: [criterion(
          'Ratio reasoning',
          'Identifies ratios with support',
          'Writes ratios correctly in context',
          'Solves unit-rate problems accurately',
          'Justifies method and checks reasonableness',
        )],
      },
      estimatedMinutes: 45,
    },
  },
  {
    id: 'seed-ela-912-argument',
    subject: 'ela',
    gradeBand: '9-12',
    taskType: 'readingResponse',
    structure: {
      title: "Author's Argument Deep Read",
      objective: "Students trace and evaluate an author's argument, citing strong textual evidence.",
      standardsAlignment: [
        { framework: 'CCSS', code: 'CCSS.ELA.RI.9-10.8' },
        { framework: 'PISA', code: 'PISA.READ.L4' },
      ],
      materials: ['pg-23'],
      steps: [
        'First read: annotate claims vs. evidence (public-domain text from the library)',
        'Second read: map the argument structure in pairs',
        'Written response: evaluate whether the evidence supports the claim',
        'Peer review against the rubric',
      ],
      differentiation: {
        support: 'Sentence starters for claims/evidence; chunked text.',
        extension: "Compare two authors' arguments on the same subject.",
      },
      rubric: {
        criteria: [criterion(
          'Evidence use',
          'Cites evidence loosely tied to the claim',
          'Cites relevant evidence',
          'Integrates strong, specific evidence',
          'Evaluates sufficiency and bias of evidence',
        )],
      },
      estimatedMinutes: 60,
    },
  },
  {
    id: 'seed-science-68-matter',
    subject: 'science',
    gradeBand: '6-8',
    taskType: 'labReport',
    structure: {
      title: 'Matter and Its Interactions Lab',
      objective: 'Students develop a model describing how particle arrangement changes with state of matter.',
      standardsAlignment: [
        { framework: 'NGSS', code: 'MS-PS1-4' },
        { framework: 'PISA', code: 'PISA.SCI.L3' },
      ],
      materials: [],
      steps: [
        'Phenomenon hook: condensation on a cold glass',
        'Investigation in station groups; record observations',
        'Model drawing: particle diagrams across three states',
        'CER write-up: Claim, Evidence, Reasoning',
      ],
      differentiation: {
        support: 'Pre-drawn particle diagram frames to annotate.',
        extension: 'Add energy-transfer arrows and explain anomalies (evaporative cooling).',
      },
      rubric: {
        criteria: [criterion(
          'Modeling',
          'Model shows states without particles',
          'Particle model mostly accurate',
          'Accurate model tied to observations',
          'Model correctly predicts a new scenario',
        )],
      },
      estimatedMinutes: 90,
    },
  },
  {
    id: 'seed-social-68-primary-source',
    subject: 'socialStudies',
    gradeBand: '6-8',
    taskType: 'projectBrief',
    structure: {
      title: 'Primary Source Investigation: My City',
      objective: 'Students corroborate multiple primary sources to construct an account of a local historical event.',
      standardsAlignment: [
        { framework: 'CCSS', code: 'CCSS.ELA.RH.6-8.1' },
        { framework: 'PISA', code: 'PISA.READ.L3' },
      ],
      materials: ['pg-23'],
      steps: [
        'Select an event from the local history source set (Library of Congress / DPLA)',
        'Source analysis sheets: author, audience, purpose, perspective',
        'Corroboration matrix across 3+ sources',
        'Final product: exhibit panel, podcast segment, or short essay',
      ],
      differentiation: {
        support: 'Curated three-source packet with guiding questions.',
        extension: 'Locate one additional source independently and assess its reliability.',
      },
      rubric: {
        criteria: [criterion(
          'Corroboration',
          'Summarizes one source',
          'Compares two sources',
          'Corroborates 3+ sources into an account',
          'Addresses conflicting evidence explicitly',
        )],
      },
      estimatedMinutes: 180,
    },
  },
  {
    id: 'seed-worldlang-912-listening',
    subject: 'worldLang',
    gradeBand: '9-12',
    taskType: 'discussion',
    structure: {
      title: 'Interpretive Listening Circle',
      objective: 'Students interpret an authentic audio text and sustain a target-language discussion.',
      standardsAlignment: [{ framework: 'PISA', code: 'PISA.READ.L3' }],
      materials: [],
      steps: [
        'Two listens of an authentic clip with structured note frames',
        'Small-group meaning negotiation in the target language',
        'Whole-class discussion with sentence frames',
        'Self-assessment against can-do statements',
      ],
      differentiation: {
        support: 'Transcript available on the second listen; glossary of eight key terms.',
        extension: 'No transcript; students summarize register and tone.',
      },
      rubric: {
        criteria: [criterion(
          'Interpretation',
          'Identifies topic and some words',
          'Identifies the main idea',
          'Main idea plus supporting details',
          'Infers tone, purpose, and audience',
        )],
      },
      estimatedMinutes: 50,
    },
  },
  {
    id: 'seed-arts-35-rhythm',
    subject: 'arts',
    gradeBand: '3-5',
    taskType: 'projectBrief',
    structure: {
      title: 'Rhythm Patterns to Composition',
      objective: 'Students create and notate a four-measure rhythm composition and perform it.',
      standardsAlignment: [{ framework: 'PISA', code: 'PISA.MATH.L1' }],
      materials: [],
      steps: [
        'Echo-clap warm-up with quarter/eighth patterns',
        'Pattern bank building on rhythm cards',
        'Compose four measures; notate with icon or standard notation',
        'Perform for a partner; the partner claps it back from the notation',
      ],
      differentiation: {
        support: 'Icon notation and two-measure length.',
        extension: 'Add rests and a second voice (body-percussion ostinato).',
      },
      rubric: {
        criteria: [criterion(
          'Composition',
          'Pattern copied from the bank',
          'Original pattern, notation gaps',
          'Original, accurately notated, performable',
          'Uses rests/syncopation intentionally',
        )],
      },
      estimatedMinutes: 40,
    },
  },
];

export const seedById = (id: string): TemplateSeed | undefined => TEMPLATE_SEEDS.find(t => t.id === id);

export function filterSeeds(opts: { subject?: LibrarySubject; gradeBand?: GradeBand; taskType?: TaskType }): TemplateSeed[] {
  return TEMPLATE_SEEDS.filter(t =>
    (!opts.subject || t.subject === opts.subject) &&
    (!opts.gradeBand || t.gradeBand === opts.gradeBand) &&
    (!opts.taskType || t.taskType === opts.taskType)
  );
}
