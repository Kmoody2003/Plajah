// services/edu/documentLookCore.ts — the look order, pure (no Firebase). See ./documentLook.ts.
import { ALL_LIVING_DOCUMENT_TEMPLATES, DEFAULT_LIVING_TEMPLATE_ID, getLivingTemplateById, type LivingDocumentTemplate } from '../council/livingDocumentTemplates';

/** A look: one design for lessons and worksheets, one for tests and quizzes. Unset = inherit. */
export interface EduLook { worksheet?: string; test?: string }
export interface OrgLooks { org: EduLook; departments: Record<string, EduLook> }
export type LookSource = 'assignment' | 'teacher' | 'department' | 'organization' | 'lesson' | 'platform';
export interface ResolvedLook { templateId: string; source: LookSource }

export const SOURCE_LABEL: Record<LookSource, string> = {
  assignment: 'picked for this assignment', teacher: 'your look', department: 'the department’s look', organization: 'the organization’s look', lesson: 'the lesson’s own look', platform: 'the Plajah default',
};

const TEST_KIND = /QUIZ|TEST|EXAM/i;
export const isTestKind = (kind: string | undefined) => TEST_KIND.test(kind || '');
const known = new Set(ALL_LIVING_DOCUMENT_TEMPLATES.map(t => t.id));
/** A stored id is used only if that design still exists. */
export const validLook = (id: string | undefined | null): string | undefined => (id && known.has(id) ? id : undefined);
export const lookTemplate = (look: EduLook | null | undefined, kind: string | undefined): string | undefined => validLook(isTestKind(kind) ? look?.test : look?.worksheet);

export const lookChoices = (test: boolean): LivingDocumentTemplate[] => ALL_LIVING_DOCUMENT_TEMPLATES.filter(t => (t.category === 'TEST_QUIZ') === test);
export const lookName = (id: string | undefined) => (validLook(id) ? getLivingTemplateById(id).name : '');

export function resolveLook(o: {
  unit: { kind?: string; livingTemplateId?: string };
  /** Picked on the assign sheet for this hand-out. */
  assignment?: string | null;
  teacher?: EduLook | null;
  department?: EduLook | null;
  organization?: EduLook | null;
}): ResolvedLook {
  const kind = o.unit.kind;
  const picked = validLook(o.assignment);
  if (picked) return { templateId: picked, source: 'assignment' };
  const t = lookTemplate(o.teacher, kind);
  if (t) return { templateId: t, source: 'teacher' };
  const d = lookTemplate(o.department, kind);
  if (d) return { templateId: d, source: 'department' };
  const g = lookTemplate(o.organization, kind);
  if (g) return { templateId: g, source: 'organization' };
  const own = validLook(o.unit.livingTemplateId);
  if (own) return { templateId: own, source: 'lesson' };
  return { templateId: DEFAULT_LIVING_TEMPLATE_ID, source: 'platform' };
}

/** The looks in force for one class: its department's and its organization's. */
export const looksForCourse = (looks: OrgLooks | null | undefined, departmentId: string | undefined) => ({
  organization: looks?.org, department: departmentId ? looks?.departments[departmentId] : undefined,
});

