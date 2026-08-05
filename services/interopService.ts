// interopService — Phase 5. Plajah as the universal adapter so it drops into any school on
// Earth without rip-and-replace: rostering (Clever/ClassLink/OneRoster), SSO, content + grade
// passback (LTI 1.3 / AGS), standards ingestion (CASE), and district analytics (Ed-Fi).
//
// HONEST SCOPE: the CASE framework importer below is REAL and self-contained (it ingests a
// machine-readable standards framework into the Plajah standards-graph shape). The rostering /
// LTI / SSO connectors require registered app credentials + live OAuth with each platform, so
// they're typed adapters + a status registry here, not live connections yet (clearly labeled).

import type { LearningStandard, FrameworkId, Subject, GradeId } from '../data/educationStandards';

export type IntegrationStatus = 'live' | 'scaffolded' | 'planned';
export interface Integration {
  id: string; name: string; kind: 'rostering' | 'sso' | 'content' | 'standards' | 'analytics';
  status: IntegrationStatus; desc: string;
}

// The integration surface, with honest status. CASE import is live; the rest await app credentials.
export const INTEGRATIONS: Integration[] = [
  { id: 'case', name: 'CASE (1EdTech)', kind: 'standards', status: 'live', desc: 'Ingest any standards framework as machine-readable data into the Plajah standards graph.' },
  { id: 'clever', name: 'Clever', kind: 'rostering', status: 'scaffolded', desc: 'One-click roster + SSO sync. Adapter ready; awaiting district app credentials.' },
  { id: 'classlink', name: 'ClassLink', kind: 'rostering', status: 'scaffolded', desc: 'Roster + SSO via OneRoster. Adapter ready; awaiting credentials.' },
  { id: 'oneroster', name: 'OneRoster 1.2', kind: 'rostering', status: 'scaffolded', desc: 'Import classes/teachers/students from a OneRoster CSV/REST source.' },
  { id: 'google', name: 'Google Classroom', kind: 'content', status: 'scaffolded', desc: 'Launch Plajah activities from, and pass grades back to, Google Classroom.' },
  { id: 'lti', name: 'LTI 1.3 / AGS', kind: 'content', status: 'scaffolded', desc: 'Deep-link launch + Assignment & Grade Services passback to any LMS (Canvas, Schoology…).' },
  { id: 'edfi', name: 'Ed-Fi', kind: 'analytics', status: 'planned', desc: 'District-scale analytics alignment via the Ed-Fi data standard.' },
];

// ── CASE framework importer (REAL) ───────────────────────────────────────────────
// Accepts a CASE CFPackage / CFItems JSON and maps it to Plajah LearningStandards. CASE is the
// 1EdTech standard for machine-readable competency frameworks; this is exactly how the standards
// graph stays current across states and countries.
interface CaseItem { identifier?: string; fullStatement?: string; humanCodingScheme?: string; CFItemType?: string; educationLevel?: string[]; }
interface CasePackage { CFDocument?: { title?: string; subject?: string[] }; CFItems?: CaseItem[] }

const EDLEVEL_TO_GRADE: Record<string, GradeId> = {
  PK: 'prek', KG: 'k', '00': 'k', '01': 'g1', '02': 'g2', '03': 'g3', '04': 'g4', '05': 'g5', '06': 'g6', '07': 'g7', '08': 'g8',
  '09': 'g9', '10': 'g10', '11': 'g11', '12': 'g12',
};
const subjectFromCase = (s?: string): Subject => {
  const x = (s || '').toLowerCase();
  if (x.includes('math')) return 'MATH';
  if (x.includes('sci')) return 'SCIENCE';
  if (x.includes('social') || x.includes('history')) return 'SOCIAL';
  return 'ELA';
};

export interface CaseImportResult { framework: string; subject: Subject; standards: LearningStandard[]; count: number; }

export function importCASEFramework(pkg: CasePackage, frameworkId: FrameworkId = 'CCSS_ELA'): CaseImportResult {
  const subject = subjectFromCase(pkg.CFDocument?.subject?.[0]);
  const title = pkg.CFDocument?.title || 'Imported framework';
  const items = (pkg.CFItems || []).filter(i => i.fullStatement && i.CFItemType !== 'Domain');
  const standards: LearningStandard[] = items.map(i => {
    const lvl = i.educationLevel?.[0];
    const grade = (lvl && EDLEVEL_TO_GRADE[lvl]) || 'g3';
    return {
      id: `CASE.${i.identifier || i.humanCodingScheme || Math.abs(hashStr(i.fullStatement!)).toString(36)}`,
      framework: frameworkId,
      subject,
      grade,
      domain: i.CFItemType || title,
      code: i.humanCodingScheme || 'CASE',
      statement: i.fullStatement!,
    };
  });
  return { framework: title, subject, standards, count: standards.length };
}

const hashStr = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; };

// A tiny sample CASE package for the in-app import demo.
export const SAMPLE_CASE: CasePackage = {
  CFDocument: { title: 'Sample State ELA Framework', subject: ['English Language Arts'] },
  CFItems: [
    { identifier: 'ela-3-rl-1', humanCodingScheme: '3.RL.1', fullStatement: 'Ask and answer questions to demonstrate understanding of a text, referring explicitly to the text.', CFItemType: 'Standard', educationLevel: ['03'] },
    { identifier: 'ela-3-rl-2', humanCodingScheme: '3.RL.2', fullStatement: 'Recount stories and determine their central message, lesson, or moral.', CFItemType: 'Standard', educationLevel: ['03'] },
    { identifier: 'ela-4-ri-2', humanCodingScheme: '4.RI.2', fullStatement: 'Determine the main idea of a text and explain how it is supported by key details.', CFItemType: 'Standard', educationLevel: ['04'] },
  ],
};

// ── OneRoster roster import (typed adapter) ──────────────────────────────────────
export interface RosterMember { sourcedId: string; role: 'teacher' | 'student'; givenName: string; familyName: string; }
export interface RosterClass { sourcedId: string; title: string; grade?: string; members: RosterMember[]; }
export function parseOneRosterClasses(payload: { classes?: any[]; enrollments?: any[]; users?: any[] }): RosterClass[] {
  const users: Record<string, any> = Object.fromEntries((payload.users || []).map(u => [u.sourcedId, u]));
  const byClass: Record<string, RosterClass> = {};
  (payload.classes || []).forEach(c => { byClass[c.sourcedId] = { sourcedId: c.sourcedId, title: c.title, grade: (c.grades || [])[0], members: [] }; });
  (payload.enrollments || []).forEach(e => {
    const cls = byClass[e.class?.sourcedId || e.classSourcedId]; const u = users[e.user?.sourcedId || e.userSourcedId];
    if (cls && u) cls.members.push({ sourcedId: u.sourcedId, role: e.role === 'teacher' ? 'teacher' : 'student', givenName: u.givenName || '', familyName: u.familyName || '' });
  });
  return Object.values(byClass);
}

// ── Outbound: export Plajah artifacts INTO third-party tools (interop-native) ─────
// On-platform teacher tools are built to emit standard ed-tech formats so they drop into any
// stack. These produce the real payload shapes; the live push needs the connector's OAuth (see
// INTEGRATIONS status), but the format is correct today and downloadable for manual import.

export interface LessonPlanLike { title: string; objective: string; standardCode?: string; activities: string[]; }

/** Standards-based gradebook → CSV (RFC-4180 quoting). Universally importable. */
export function exportGradebookCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

/** Google Classroom courseWork API payload (push requires Classroom OAuth). */
export function toGoogleClassroomCoursework(plan: LessonPlanLike) {
  return {
    title: plan.title,
    description: [plan.objective, '', ...plan.activities].join('\n'),
    workType: 'ASSIGNMENT',
    state: 'DRAFT',
    maxPoints: 100,
    ...(plan.standardCode ? { associatedWithDeveloper: { standard: plan.standardCode } } : {}),
  };
}

/** LTI 1.3 Deep Linking resource (returned to a platform during a deep-link launch). */
export function toLtiResourceLink(plan: LessonPlanLike) {
  return {
    type: 'ltiResourceLink',
    title: plan.title,
    text: plan.objective,
    lineItem: { scoreMaximum: 100, label: plan.title },
    custom: { plajah_standard: plan.standardCode || '', plajah_activities: plan.activities.join(' | ') },
  };
}

/** OneRoster lineItem result rows for grade passback. */
export function toOneRosterResults(rows: { studentSourcedId: string; score: number }[], lineItemSourcedId: string) {
  return rows.map(r => ({ sourcedId: `${lineItemSourcedId}-${r.studentSourcedId}`, status: 'active', lineItem: { sourcedId: lineItemSourcedId }, student: { sourcedId: r.studentSourcedId }, score: r.score, scoreStatus: 'fully graded' }));
}

// QTI 3.0 (Question & Test Interoperability) — the 1EdTech standard for assessments, so a
// Plajah check imports into any QTI-aware assessment platform.
export interface CheckQuestion { prompt: string; options: string[]; answer: number; }
export interface AssignmentLike { title: string; standardCode?: string; points: number; questions: CheckQuestion[]; }

export function toQTIAssessment(a: AssignmentLike) {
  return {
    type: 'qti-assessment-test',
    identifier: `plajah-${(a.standardCode || 'check').replace(/[^a-z0-9]/gi, '')}`,
    title: a.title,
    'qti-outcome-declaration': { identifier: 'SCORE', baseType: 'float', normalMaximum: a.points },
    'qti-test-part': [{
      identifier: 'part-1', 'qti-navigation-mode': 'linear',
      'qti-assessment-section': [{
        identifier: 'section-1', title: a.title,
        'qti-assessment-item': a.questions.map((q, i) => ({
          identifier: `item-${i + 1}`, title: q.prompt.slice(0, 40),
          ...(a.standardCode ? { 'qti-alignment': { targetCode: a.standardCode } } : {}),
          'qti-response-declaration': { identifier: 'RESPONSE', cardinality: 'single', baseType: 'identifier', 'qti-correct-response': { value: `choice_${q.answer}` } },
          'qti-item-body': {
            'qti-choice-interaction': {
              responseIdentifier: 'RESPONSE', maxChoices: 1, 'qti-prompt': q.prompt,
              'qti-simple-choice': q.options.map((o, j) => ({ identifier: `choice_${j}`, value: o })),
            },
          },
        })),
      }],
    }],
  };
}

/** Trigger a browser download of any text artifact. */
export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* optional */ }
}

// ── LTI 1.3 launch (typed adapter) ───────────────────────────────────────────────
export interface LtiLaunch { userId: string; roles: string[]; contextTitle?: string; resourceLinkId?: string; isInstructor: boolean; }
export function parseLtiLaunch(claims: Record<string, any>): LtiLaunch {
  const roles: string[] = claims['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
  return {
    userId: claims.sub,
    roles,
    contextTitle: claims['https://purl.imsglobal.org/spec/lti/claim/context']?.title,
    resourceLinkId: claims['https://purl.imsglobal.org/spec/lti/claim/resource_link']?.id,
    isInstructor: roles.some(r => /Instructor|Faculty|Teacher/i.test(r)),
  };
}
