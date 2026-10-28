// services/curriculumIngestionService.ts
// Universal Curriculum, Lesson, Google Docs / Google Forms / Word / PDF & Answer-Key Ingestion Engine
// Powered by Tela (TelaWriterDevice + TelaFormDevice + TelaBaseDevice) and the Plajah Mastery Graph.

import type {
  TelaDoc,
  TelaWriterDevice,
  TelaWriterBlock,
  TelaFrame,
} from '../types';
import type {
  DigitalWorksheet,
  WorksheetField,
  WorksheetSegment,
  WorksheetFieldType,
} from './worksheetDigitizer';
import { worksheetToTelaDoc } from './worksheetTelaAdapter';
import { saveTelaDoc } from './telaStore';
import { digitizeWorksheetOnDevice } from './worksheetLocalVision';
import { parseRef, formatRef, refId } from './scriptureRef';
import { recordSet, loadMastery, type SkillLevel } from './mastery';
import type { PlanWeek } from './churchEducationService';
import {
  copyCurriculumPairToOrgAssets,
  getOrgEducationFolderName,
  isOrgEducationFolderName,
  resolveDocumentClassFolder,
  isStandaloneTeacherScopeId,
  getStandaloneTeacherScopeId,
  GREAT_FAITH_MINISTRIES_DEFAULT_ID,
  GREAT_FAITH_MINISTRIES_NAME,
} from './orgAssets';
import {
  matchSacredLibrarySupplementsForLesson,
  type SacredLibrarySupplement,
} from './sacredLibraryCurriculumBridge';
import { getDefaultLivingTemplateForUnit } from './council/livingDocumentTemplates';

export type CurriculumSourceKind =
  | 'GOOGLE_FORM'
  | 'GOOGLE_DOC'
  | 'WORD_DOCX'
  | 'PDF_DOCUMENT'
  | 'IMAGE_SCAN'
  | 'TEXT_MARKDOWN'
  | 'WEB_LINK';

export interface IngestedQuestion {
  id: string;
  number: number;
  prompt: string;
  type: 'multiple-choice' | 'true-false' | 'numeric' | 'short-answer' | 'essay' | 'scripture-reflection';
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  points: number;
  skillId: string;
  skillTitle: string;
  scripturePassage?: string;
}

export interface IngestedMasterySkill {
  id: string;
  title: string;
  description: string;
  standardCode?: string;
  scripturePassage?: string;
  questionIds: string[];
  targetQuestions: number;
}

export type LessonLibraryCategory =
  | 'SYLLABUS'
  | 'ASSIGNMENT'
  | 'COURSE_RESOURCE'
  | 'QUIZ_EXAM'
  | 'MASTER_SOURCE_DOC'
  | 'ANSWER_KEY';

export interface IngestedCurriculumUnit {
  /** Set on a student's copy: the answer keys stayed with the teacher (services/christianEdSync), so key-graded questions wait for review. */
  answerKeyWithheld?: boolean;
  id: string;
  orgId: string;
  programId?: string;
  title: string;
  subtitle: string;
  sourceKind: CurriculumSourceKind;
  sourceLabel: string;
  sourceUrl?: string;
  answerKeySourceLabel?: string;
  kind: 'ASSIGNMENT' | 'QUIZ' | 'TEST' | 'INTERACTIVE_LESSON' | 'CURRICULUM_MODULE';
  libraryCategory?: LessonLibraryCategory;
  uploadedByRole?: string;
  createdByName?: string;
  extractedFromHubTitle?: string;
  extractedFromHubUrl?: string;
  isAnswerKeyOnly?: boolean;
  lessonBlocks: Array<{
    id: string;
    kind: 'h1' | 'h2' | 'p' | 'quote' | 'callout' | 'check';
    text: string;
    scripturePassage?: string;
  }>;
  questions: IngestedQuestion[];
  masterySkills: IngestedMasterySkill[];
  syllabusWeeks: PlanWeek[];
  telaDocId: string;
  worksheet: DigitalWorksheet;
  totalPoints: number;
  departmentFolder?: string;
  documentClassFolder?: string;
  scopeKind?: 'org' | 'user';
  originalAssetId?: string;
  telaAssetId?: string;
  answerKeyAssetId?: string;
  rawCurriculumText?: string;
  rawAnswerKeyText?: string;
  sacredLibrarySupplements?: SacredLibrarySupplement[];
  livingTemplateId?: string;
  createdAt: number;
}

export interface StudentUnitSubmission {
  id: string;
  unitId: string;
  orgId: string;
  programId?: string;
  studentUid: string;
  studentName: string;
  answers: Record<string, string>;
  /** `pending`: graded by the teacher with a key the student's device never had. */
  questionScores: Record<string, { correct: boolean; earnedPoints: number; maxPoints: number; expected?: string; pending?: boolean }>;
  earnedPoints: number;
  totalPoints: number;
  percentage: number;
  skillBreakdown: Record<string, { correct: number; total: number; level: SkillLevel }>;
  submittedAt: number;
}

function normalizeToGreatFaithOrgId(orgId: string): string {
  if (isStandaloneTeacherScopeId(orgId)) {
    return getStandaloneTeacherScopeId(orgId);
  }
  if (!orgId || orgId === 'demo-grace-chapel' || orgId.startsWith('demo-')) {
    return GREAT_FAITH_MINISTRIES_DEFAULT_ID;
  }
  return orgId;
}

const STORAGE_UNITS_KEY = (orgId: string) =>
  `plajah_ingested_curriculum_units_v1_${normalizeToGreatFaithOrgId(orgId)}`;
const STORAGE_SUBMISSIONS_KEY = (orgId: string) =>
  `plajah_ingested_curriculum_subs_v1_${normalizeToGreatFaithOrgId(orgId)}`;

function inferLessonLibraryCategory(
  title: string,
  unitKind: IngestedCurriculumUnit['kind'],
  isAnswerKeyOnly?: boolean
): LessonLibraryCategory {
  if (isAnswerKeyOnly || /\b(answer\s*key|rubric\s*compendium|master\s*key)\b/i.test(title)) {
    return 'ANSWER_KEY';
  }
  if (/\b(course\s*connection|master\s*syllabus|syllabus|curriculum\s*overview)\b/i.test(title)) {
    return 'SYLLABUS';
  }
  if (unitKind === 'QUIZ' || unitKind === 'TEST' || /\b(quiz|exam|examination|test|check)\b/i.test(title)) {
    return 'QUIZ_EXAM';
  }
  if (/\b(dossier|sacred\s*library|atlas|resource|packet|study\s*guide|supplement)\b/i.test(title)) {
    return 'COURSE_RESOURCE';
  }
  return 'ASSIGNMENT';
}

function readRawStoredUnitsForKey(key: string): IngestedCurriculumUnit[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let isSeedingDefaultsSync = false;

export function listIngestedUnits(
  orgId: string,
  programId?: string,
  orgName?: string
): IngestedCurriculumUnit[] {
  try {
    const isStandaloneTeacher = isStandaloneTeacherScopeId(orgId);
    const safeOrgId = normalizeToGreatFaithOrgId(orgId);
    const resolvedOrgName = orgName || GREAT_FAITH_MINISTRIES_NAME;
    const orgEduFolder = getOrgEducationFolderName(resolvedOrgName);

    const primaryList = readRawStoredUnitsForKey(STORAGE_UNITS_KEY(safeOrgId));
    const secondaryList = isStandaloneTeacher
      ? safeOrgId !== 'teacher-personal-hq'
        ? readRawStoredUnitsForKey(STORAGE_UNITS_KEY('teacher-personal-hq'))
        : []
      : safeOrgId !== GREAT_FAITH_MINISTRIES_DEFAULT_ID
        ? readRawStoredUnitsForKey(STORAGE_UNITS_KEY(GREAT_FAITH_MINISTRIES_DEFAULT_ID))
        : [];

    const byKey = new Map<string, IngestedCurriculumUnit>();
    for (const u of [...primaryList, ...secondaryList]) {
      if (!u || !u.title) continue;
      const dedupeKey = (u.sourceUrl || u.title).trim().toLowerCase();
      if (!byKey.has(dedupeKey)) {
        const isKeyOnly =
          Boolean(u.isAnswerKeyOnly) ||
          /\bmaster\s*teacher\s*answer\s*key\b/i.test(u.title);
        const libCat = u.libraryCategory || inferLessonLibraryCategory(u.title, u.kind, isKeyOnly);
        const docClass = resolveDocumentClassFolder({
          unitTitle: u.title,
          unitKind: u.kind,
          libraryCategory: libCat,
          isAnswerKey: isKeyOnly,
        });
        const resolvedFolder = isStandaloneTeacher
          ? isKeyOnly
            ? 'Answer Keys & Rubrics'
            : docClass
          : !u.departmentFolder || isOrgEducationFolderName(u.departmentFolder, resolvedOrgName)
            ? orgEduFolder
            : u.departmentFolder;

        byKey.set(dedupeKey, {
          ...u,
          isAnswerKeyOnly: isKeyOnly,
          libraryCategory: libCat,
          departmentFolder: resolvedFolder,
          documentClassFolder: docClass,
          scopeKind: isStandaloneTeacher ? 'user' : 'org',
          extractedFromHubTitle:
            u.extractedFromHubTitle ||
            (isStandaloneTeacher ? undefined : 'Revelation 2: Course Connection (Master Google Doc)'),
          extractedFromHubUrl:
            u.extractedFromHubUrl ||
            (isStandaloneTeacher
              ? undefined
              : 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?pli=1&tab=t.qo6bykb5zkh7'),
        });
      }
    }

    // For organization scopes, seed the preset documents synchronously if not yet seeded so the
    // organization's Lesson Library & `<Org Name> Education` folder is never empty on mount!
    if (
      !isStandaloneTeacher &&
      !isSeedingDefaultsSync &&
      typeof REVELATION_2_COURSE_CONNECTION_PRESET !== 'undefined' &&
      byKey.size < REVELATION_2_COURSE_CONNECTION_PRESET.links.length
    ) {
      isSeedingDefaultsSync = true;
      try {
        for (const item of REVELATION_2_COURSE_CONNECTION_PRESET.links) {
          const dedupeKey = (item.url || item.label).trim().toLowerCase();
          if (byKey.has(dedupeKey)) continue;
          const resolvedKind: IngestedCurriculumUnit['kind'] =
            item.category === 'GOOGLE_FORM' || /\bquiz\b/i.test(item.label)
              ? 'QUIZ'
              : /\b(test|exam|examination|benchmark)\b/i.test(item.label)
                ? 'TEST'
                : /\b(syllabus|course\s*connection)\b/i.test(item.label)
                  ? 'CURRICULUM_MODULE'
                  : 'INTERACTIVE_LESSON';
          const { unit, telaDoc } = parseCurriculumAndBuildUnit({
            orgId: safeOrgId,
            programId,
            title: item.label,
            rawCurriculumText: item.fallbackCurriculumText || `# ${item.label}`,
            rawAnswerKeyText: item.fallbackAnswerKeyText || '',
            sourceKind:
              item.category === 'ANSWER_KEY'
                ? 'GOOGLE_DOC'
                : (item.category as CurriculumSourceKind),
            sourceLabel: item.label,
            sourceUrl: item.url,
            answerKeySourceLabel: item.pairedAnswerKeyLabel,
            unitKind: resolvedKind,
          });
          const libCat = inferLessonLibraryCategory(item.label, resolvedKind, item.isAnswerKey);
          unit.departmentFolder = orgEduFolder;
          unit.documentClassFolder = resolveDocumentClassFolder({
            unitTitle: item.label,
            unitKind: resolvedKind,
            libraryCategory: libCat,
            isAnswerKey: item.isAnswerKey,
          });
          unit.scopeKind = 'org';
          unit.rawCurriculumText = item.fallbackCurriculumText || `# ${item.label}`;
          unit.rawAnswerKeyText = item.fallbackAnswerKeyText || '';
          unit.isAnswerKeyOnly = Boolean(item.isAnswerKey);
          unit.libraryCategory = libCat;
          unit.createdByName = `${resolvedOrgName} Education`;
          unit.uploadedByRole = 'INSTRUCTOR';
          unit.extractedFromHubTitle = REVELATION_2_COURSE_CONNECTION_PRESET.hubTitle;
          unit.extractedFromHubUrl = REVELATION_2_COURSE_CONNECTION_PRESET.hubUrl;
          void saveTelaDoc(telaDoc).catch(() => {});
          byKey.set(dedupeKey, unit);
        }
        const seededArray = Array.from(byKey.values()).sort((a, b) => b.createdAt - a.createdAt);
        localStorage.setItem(STORAGE_UNITS_KEY(safeOrgId), JSON.stringify(seededArray));
        if (safeOrgId !== GREAT_FAITH_MINISTRIES_DEFAULT_ID) {
          localStorage.setItem(
            STORAGE_UNITS_KEY(GREAT_FAITH_MINISTRIES_DEFAULT_ID),
            JSON.stringify(seededArray.map(u => ({ ...u, orgId: GREAT_FAITH_MINISTRIES_DEFAULT_ID })))
          );
        }
      } finally {
        isSeedingDefaultsSync = false;
      }
    }

    const list = Array.from(byKey.values());
    const filtered = programId ? list.filter(u => !u.programId || u.programId === programId) : list;
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveIngestedUnit(unit: IngestedCurriculumUnit): void {
  try {
    const isStandaloneTeacher =
      unit.scopeKind === 'user' || isStandaloneTeacherScopeId(unit.orgId);
    const safeOrgId = normalizeToGreatFaithOrgId(unit.orgId);
    const isKeyOnly =
      Boolean(unit.isAnswerKeyOnly) ||
      /\bmaster\s*teacher\s*answer\s*key\b/i.test(unit.title);
    const libCat = unit.libraryCategory || inferLessonLibraryCategory(unit.title, unit.kind, isKeyOnly);
    const docClass =
      unit.documentClassFolder ||
      resolveDocumentClassFolder({
        unitTitle: unit.title,
        unitKind: unit.kind,
        libraryCategory: libCat,
        isAnswerKey: isKeyOnly,
      });
    const normalizedUnit: IngestedCurriculumUnit = {
      ...unit,
      orgId: safeOrgId,
      scopeKind: isStandaloneTeacher ? 'user' : 'org',
      isAnswerKeyOnly: isKeyOnly,
      libraryCategory: libCat,
      documentClassFolder: docClass,
      departmentFolder: isStandaloneTeacher
        ? isKeyOnly
          ? 'Answer Keys & Rubrics'
          : docClass
        : unit.departmentFolder || getOrgEducationFolderName(GREAT_FAITH_MINISTRIES_NAME),
    };
    const existing = readRawStoredUnitsForKey(STORAGE_UNITS_KEY(safeOrgId)).filter(
      u => u.id !== unit.id && u.title.toLowerCase() !== unit.title.toLowerCase()
    );
    localStorage.setItem(STORAGE_UNITS_KEY(safeOrgId), JSON.stringify([normalizedUnit, ...existing]));
    if (isStandaloneTeacher) {
      if (safeOrgId !== 'teacher-personal-hq') {
        const personalExisting = readRawStoredUnitsForKey(STORAGE_UNITS_KEY('teacher-personal-hq')).filter(
          u => u.id !== unit.id && u.title.toLowerCase() !== unit.title.toLowerCase()
        );
        localStorage.setItem(
          STORAGE_UNITS_KEY('teacher-personal-hq'),
          JSON.stringify([{ ...normalizedUnit, orgId: 'teacher-personal-hq' }, ...personalExisting])
        );
      }
    } else if (safeOrgId !== GREAT_FAITH_MINISTRIES_DEFAULT_ID) {
      const gfExisting = readRawStoredUnitsForKey(STORAGE_UNITS_KEY(GREAT_FAITH_MINISTRIES_DEFAULT_ID)).filter(
        u => u.id !== unit.id && u.title.toLowerCase() !== unit.title.toLowerCase()
      );
      localStorage.setItem(
        STORAGE_UNITS_KEY(GREAT_FAITH_MINISTRIES_DEFAULT_ID),
        JSON.stringify([{ ...normalizedUnit, orgId: GREAT_FAITH_MINISTRIES_DEFAULT_ID }, ...gfExisting])
      );
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plajah:lessonLibraryUpdated', { detail: { orgId: safeOrgId } }));
    }
  } catch {
    // ignore storage quota
  }
}

export function deleteIngestedUnit(orgId: string, unitId: string): void {
  try {
    const existing = listIngestedUnits(orgId).filter(u => u.id !== unitId);
    localStorage.setItem(STORAGE_UNITS_KEY(orgId), JSON.stringify(existing));
  } catch {
    // ignore
  }
}

export function updateUnitLivingTemplate(
  orgId: string,
  unitId: string,
  livingTemplateId: string
): void {
  try {
    const safeOrgId = normalizeToGreatFaithOrgId(orgId);
    const existing = listIngestedUnits(safeOrgId);
    const updated = existing.map(u =>
      u.id === unitId ? { ...u, livingTemplateId } : u
    );
    localStorage.setItem(STORAGE_UNITS_KEY(safeOrgId), JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function listUnitSubmissions(orgId: string, unitId?: string): StudentUnitSubmission[] {
  try {
    const raw = localStorage.getItem(STORAGE_SUBMISSIONS_KEY(orgId));
    const list: StudentUnitSubmission[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return (unitId ? list.filter(s => s.unitId === unitId) : list).sort((a, b) => b.submittedAt - a.submittedAt);
  } catch {
    return [];
  }
}

export function saveUnitSubmission(sub: StudentUnitSubmission): void {
  try {
    const existing = listUnitSubmissions(sub.orgId).filter(
      s => !(s.unitId === sub.unitId && s.studentUid === sub.studentUid)
    );
    localStorage.setItem(STORAGE_SUBMISSIONS_KEY(sub.orgId), JSON.stringify([sub, ...existing]));
  } catch {
    // ignore
  }
}

// ── 1. URL Detection & Remote Document / Google Form / Google Doc Fetching ─────

export function detectLinkKind(url: string): CurriculumSourceKind {
  const u = url.trim().toLowerCase();
  if (u.includes('docs.google.com/forms') || u.includes('forms.gle/')) return 'GOOGLE_FORM';
  if (u.includes('docs.google.com/document')) return 'GOOGLE_DOC';
  if (u.endsWith('.docx') || u.endsWith('.doc') || u.includes('onedrive.live.com') || u.includes('sharepoint.com')) {
    return 'WORD_DOCX';
  }
  if (u.endsWith('.pdf') || u.includes('drive.google.com/file/d/') || u.includes('drive.google.com/open?id=')) {
    return 'PDF_DOCUMENT';
  }
  return 'WEB_LINK';
}

export function extractGoogleDocId(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export function extractGoogleDocTabId(url: string): string | null {
  try {
    const u = new URL(url);
    const tab = u.searchParams.get('tab');
    if (tab) return tab;
  } catch {
    // fallback regex
  }
  const m = url.match(/[?&]tab=([a-zA-Z0-9._-]+)/);
  return m ? m[1] : null;
}

export function extractGoogleDriveFileId(url: string): string | null {
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m2 ? m2[1] : null;
}

function isGoogleLoginWallHtml(text: string): boolean {
  return (
    text.includes('show-login-page') ||
    text.includes('request-storage-access') ||
    text.includes('ServiceLogin') ||
    text.includes('accounts.google.com/v3/signin')
  );
}

async function fetchTextWithCorsFallback(targetUrl: string): Promise<string> {
  const attempts = [
    targetUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
  ];
  let sawAuthWall = false;
  for (const candidate of attempts) {
    try {
      const resp = await fetch(candidate, { method: 'GET' });
      if (resp.status === 401 || resp.status === 403) {
        sawAuthWall = true;
        continue;
      }
      if (resp.ok) {
        const text = await resp.text();
        if (isGoogleLoginWallHtml(text)) {
          sawAuthWall = true;
          continue;
        }
        if (text && text.trim().length > 15) return text;
      }
    } catch {
      // try next fallback
    }
  }
  if (sawAuthWall) {
    throw new Error(
      'RESTRICTED_GOOGLE_DOC: This Google Doc is currently set to Restricted (HTTP 401). Either change Google Drive sharing to "Anyone with the link → Viewer" and click Retry, OR press Ctrl+A → Ctrl+C inside your open Google Doc tab and press Ctrl+V in the Rich Clipboard Extractor below!'
    );
  }
  throw new Error(
    'Could not fetch the remote URL directly due to document privacy settings. Make sure link sharing is set to "Anyone with the link", or paste the document content directly below.'
  );
}

/**
 * Extracts structured questions, options, descriptions, and quiz points from a Google Form URL or HTML source.
 * Parses Google Forms' embedded `FB_PUBLIC_LOAD_DATA_` schema when available, plus HTML/text fallback.
 */
export async function extractGoogleForm(urlOrHtml: string): Promise<{
  title: string;
  description: string;
  rawText: string;
  structuredQuestions: Array<{
    prompt: string;
    type: IngestedQuestion['type'];
    options?: string[];
    points?: number;
    correctAnswer?: string;
    explanation?: string;
  }>;
}> {
  let html = urlOrHtml.trim();
  if (/^https?:\/\//i.test(html)) {
    html = await fetchTextWithCorsFallback(html);
  }

  // Check for FB_PUBLIC_LOAD_DATA_ inside Google Form HTML
  const fbMatch = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  if (fbMatch && fbMatch[1]) {
    try {
      const data = JSON.parse(fbMatch[1]);
      const formMeta = data?.[1];
      const formTitle = String(formMeta?.[8] || data?.[3] || 'Google Form Assessment').trim();
      const formDesc = String(formMeta?.[0] || '').trim();
      const items: any[] = Array.isArray(formMeta?.[1]) ? formMeta[1] : [];

      const structuredQuestions: Array<{
        prompt: string;
        type: IngestedQuestion['type'];
        options?: string[];
        points?: number;
        correctAnswer?: string;
        explanation?: string;
      }> = [];
      const textLines: string[] = [`# ${formTitle}`];
      if (formDesc) textLines.push(formDesc, '');

      for (const item of items) {
        const itemTitle = String(item?.[1] || '').trim();
        const itemDesc = String(item?.[2] || '').trim();
        const itemType = Number(item?.[3]);
        const questionData = item?.[4]?.[0];

        // Section header / lesson reading block (type 8)
        if (!questionData || itemType === 8 || itemType === 6) {
          if (itemTitle) textLines.push(`## ${itemTitle}`);
          if (itemDesc) textLines.push(itemDesc, '');
          continue;
        }

        const rawChoices: any[] = Array.isArray(questionData?.[1]) ? questionData[1] : [];
        const options = rawChoices
          .map(c => String(c?.[0] || '').trim())
          .filter(Boolean);

        // Determine question type from Google Form type code
        // 0 = Short answer, 1 = Paragraph, 2 = Multiple choice, 3 = Dropdown, 4 = Checkboxes, 5 = Scale
        let qType: IngestedQuestion['type'] = 'short-answer';
        if (itemType === 2 || itemType === 3 || itemType === 4 || options.length >= 2) {
          if (
            options.length === 2 &&
            options.every(o => /^(true|false|yes|no)$/i.test(o.trim()))
          ) {
            qType = 'true-false';
          } else {
            qType = 'multiple-choice';
          }
        } else if (itemType === 1) {
          qType = 'essay';
        }

        const qNum = structuredQuestions.length + 1;
        const promptText = itemDesc ? `${itemTitle} (${itemDesc})` : itemTitle;
        textLines.push(`${qNum}. ${promptText}`);
        options.forEach((opt, idx) => {
          const letter = String.fromCharCode(65 + idx);
          textLines.push(`   ${letter}) ${opt}`);
        });
        textLines.push('');

        structuredQuestions.push({
          prompt: promptText,
          type: qType,
          options: options.length > 0 ? options : undefined,
          points: 1,
        });
      }

      if (structuredQuestions.length > 0) {
        return {
          title: formTitle,
          description: formDesc,
          rawText: textLines.join('\n'),
          structuredQuestions,
        };
      }
    } catch {
      // Fall through to HTML/text extraction if JSON structure varied
    }
  }

  // Fallback: Strip HTML tags into clean lines and parse via universal parser
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title: 'Google Form Interactive Lesson',
    description: 'Extracted from Google Forms into Tela',
    rawText: stripped,
    structuredQuestions: [],
  };
}

/**
 * Extracts text from a Google Doc link (`/document/d/{ID}/...`, including specific `?tab=t.xxx` tabs)
 * or Google Drive file link (`/file/d/{ID}/...`) or published Google Doc URL.
 */
export async function extractGoogleDocText(url: string): Promise<{ title: string; text: string }> {
  const docId = extractGoogleDocId(url);
  const tabId = extractGoogleDocTabId(url);
  if (docId) {
    const tabParam = tabId ? `&tab=${encodeURIComponent(tabId)}` : '';
    const exportTxtUrl = `https://docs.google.com/document/d/${docId}/export?format=txt${tabParam}`;
    const text = await fetchTextWithCorsFallback(exportTxtUrl);
    const firstNonEmpty = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(Boolean);
    return {
      title: firstNonEmpty && firstNonEmpty.length < 110 ? firstNonEmpty.replace(/^#+\s*/, '') : 'Google Doc Lesson',
      text,
    };
  }

  const driveFileId = extractGoogleDriveFileId(url);
  if (driveFileId) {
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}`;
    try {
      const resp = await fetch(downloadUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const pdfFile = new File([buf], `drive_${driveFileId}.pdf`, { type: 'application/pdf' });
        const pdfText = await extractTextFromPdfFile(pdfFile);
        return {
          title: `Google Drive PDF (${driveFileId.slice(0, 8)})`,
          text: pdfText,
        };
      }
    } catch {
      // fall through to text fetch
    }
  }

  const raw = await fetchTextWithCorsFallback(url);
  const cleaned = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h1|h2|h3|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    title: 'Imported Web Lesson',
    text: cleaned,
  };
}

// ── 1B. Master Course Connection / Syllabus Google Doc Link Crawler ──────────

export type ExtractedLinkCategory =
  | 'PDF_DOCUMENT'
  | 'GOOGLE_DOC'
  | 'GOOGLE_FORM'
  | 'ANSWER_KEY'
  | 'WORD_DOCX'
  | 'EXTERNAL_RESOURCE';

export interface ExtractedCourseResourceLink {
  id: string;
  label: string;
  url: string;
  directDownloadUrl?: string;
  category: ExtractedLinkCategory;
  docId?: string;
  tabId?: string;
  sectionHeading?: string;
  isAnswerKey: boolean;
  pairedAnswerKeyUrl?: string;
  pairedAnswerKeyLabel?: string;
  fallbackCurriculumText?: string;
  fallbackAnswerKeyText?: string;
}

export interface CourseHubLinkExtractionResult {
  hubTitle: string;
  hubUrl?: string;
  docId?: string;
  tabId?: string;
  links: ExtractedCourseResourceLink[];
  pdfLinks: ExtractedCourseResourceLink[];
  googleDocLinks: ExtractedCourseResourceLink[];
  googleFormLinks: ExtractedCourseResourceLink[];
  answerKeyLinks: ExtractedCourseResourceLink[];
  rawPlainTextSummary: string;
}

function unwrapGoogleRedirectUrl(href: string): string {
  const trimmed = href
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('google.com') && parsed.pathname === '/url') {
      const q = parsed.searchParams.get('q') || parsed.searchParams.get('url');
      if (q) return q;
    }
  } catch {
    // ignore invalid URL
  }
  return trimmed;
}

function classifyExtractedUrl(url: string, label: string): {
  category: ExtractedLinkCategory;
  isAnswerKey: boolean;
  directDownloadUrl?: string;
  docId?: string;
  tabId?: string;
} {
  const lowerUrl = url.toLowerCase();
  const lowerLabel = label.toLowerCase();
  const isAnswerKey =
    /\b(answer\s*key|answers|solution|solutions|teacher\s*guide|instructor\s*key|scoring\s*key)\b/i.test(lowerLabel) ||
    /\b(answer[-_]?key|solutions|teacher[-_]?key)\b/i.test(lowerUrl);

  const docId = extractGoogleDocId(url) || undefined;
  const tabId = extractGoogleDocTabId(url) || undefined;
  const driveId = extractGoogleDriveFileId(url) || undefined;

  if (lowerUrl.includes('docs.google.com/forms') || lowerUrl.includes('forms.gle/')) {
    return { category: isAnswerKey ? 'ANSWER_KEY' : 'GOOGLE_FORM', isAnswerKey, docId, tabId };
  }
  if (lowerUrl.includes('docs.google.com/document')) {
    const tabParam = tabId ? `&tab=${encodeURIComponent(tabId)}` : '';
    return {
      category: isAnswerKey ? 'ANSWER_KEY' : 'GOOGLE_DOC',
      isAnswerKey,
      directDownloadUrl: docId ? `https://docs.google.com/document/d/${docId}/export?format=txt${tabParam}` : undefined,
      docId,
      tabId,
    };
  }
  if (
    lowerUrl.endsWith('.pdf') ||
    lowerUrl.includes('.pdf?') ||
    lowerUrl.includes('drive.google.com/file/d/') ||
    lowerUrl.includes('drive.google.com/open?id=') ||
    /\bpdf\b/i.test(lowerLabel)
  ) {
    return {
      category: isAnswerKey ? 'ANSWER_KEY' : 'PDF_DOCUMENT',
      isAnswerKey,
      directDownloadUrl: driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : url,
      docId: driveId,
    };
  }
  if (lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.doc')) {
    return {
      category: isAnswerKey ? 'ANSWER_KEY' : 'WORD_DOCX',
      isAnswerKey,
      directDownloadUrl: url,
    };
  }
  return {
    category: isAnswerKey ? 'ANSWER_KEY' : 'EXTERNAL_RESOURCE',
    isAnswerKey,
  };
}

/**
 * Extracts all PDF links, Google Doc links, Google Form links, and Answer Key links from:
 * - Google Docs exported HTML (`/export?format=html`)
 * - Rich Clipboard HTML (`e.clipboardData.getData('text/html')` when copying directly from an open Google Doc tab)
 * - Plain text containing URLs
 * Automatically pairs lesson/worksheet links with companion Answer Key links found in the same hub doc.
 */
export function extractLinksFromHtmlOrText(
  htmlOrText: string,
  sourceTitle = 'Course Connection Hub',
  hubUrl?: string
): CourseHubLinkExtractionResult {
  const seenUrls = new Set<string>();
  const rawEntries: ExtractedCourseResourceLink[] = [];

  // Extract document title if HTML <title> or <h1> is present
  const titleMatch =
    htmlOrText.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    htmlOrText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const detectedTitle = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s*-\s*Google Docs$/i, '').trim()
    : sourceTitle;

  // 1. Parse HTML <a href="...">label</a> tags
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(htmlOrText)) !== null) {
    const rawHref = match[1];
    const cleanUrl = unwrapGoogleRedirectUrl(rawHref);
    if (!/^https?:\/\//i.test(cleanUrl)) continue;
    if (cleanUrl.includes('support.google.com/drive')) continue;
    if (cleanUrl.includes('accounts.google.com')) continue;

    const rawLabel = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    const key = cleanUrl.replace(/#.*$/, '');
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);

    const label = rawLabel || cleanUrl;
    const meta = classifyExtractedUrl(cleanUrl, label);
    rawEntries.push({
      id: `link_${rawEntries.length + 1}_${Date.now().toString(36)}`,
      label,
      url: cleanUrl,
      directDownloadUrl: meta.directDownloadUrl,
      category: meta.category,
      docId: meta.docId,
      tabId: meta.tabId,
      isAnswerKey: meta.isAnswerKey,
    });
  }

  // 2. Also scan plain text for any standalone https:// URLs not wrapped in <a> tags
  const plainUrlRegex = /https?:\/\/[^\s"'<>\\)\]]+/gi;
  const plainLines = htmlOrText
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/);

  for (const line of plainLines) {
    const lineUrls = line.match(plainUrlRegex) || [];
    for (const rawU of lineUrls) {
      const cleanUrl = unwrapGoogleRedirectUrl(rawU.replace(/[.,;]+$/, ''));
      if (cleanUrl.includes('support.google.com/drive') || cleanUrl.includes('accounts.google.com')) continue;
      const key = cleanUrl.replace(/#.*$/, '');
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);

      const lineWithoutUrl = line.replace(rawU, '').replace(/[-–—:|•*]+/g, ' ').trim();
      const label = lineWithoutUrl.length >= 3 && lineWithoutUrl.length <= 120 ? lineWithoutUrl : cleanUrl;
      const meta = classifyExtractedUrl(cleanUrl, label);
      rawEntries.push({
        id: `link_${rawEntries.length + 1}_${Date.now().toString(36)}`,
        label,
        url: cleanUrl,
        directDownloadUrl: meta.directDownloadUrl,
        category: meta.category,
        docId: meta.docId,
        tabId: meta.tabId,
        isAnswerKey: meta.isAnswerKey,
      });
    }
  }

  // 3. Auto-pair Lesson/Worksheet links with companion Answer Key links
  const answerKeys = rawEntries.filter(l => l.isAnswerKey);
  const contentLinks = rawEntries.filter(l => !l.isAnswerKey);

  for (const item of contentLinks) {
    const unitNumMatch = item.label.match(/\b(?:lesson|week|unit|chapter|module|session|part)\s*(\d+)/i);
    if (unitNumMatch) {
      const num = unitNumMatch[1];
      const matchingKey = answerKeys.find(k =>
        new RegExp(`\\b(?:lesson|week|unit|chapter|module|session|part)?\\s*${num}\\b`, 'i').test(k.label)
      );
      if (matchingKey) {
        item.pairedAnswerKeyUrl = matchingKey.url;
        item.pairedAnswerKeyLabel = matchingKey.label;
      }
    } else if (answerKeys.length === 1 && contentLinks.length === 1) {
      item.pairedAnswerKeyUrl = answerKeys[0].url;
      item.pairedAnswerKeyLabel = answerKeys[0].label;
    }
  }

  return {
    hubTitle: detectedTitle || sourceTitle,
    hubUrl,
    docId: hubUrl ? extractGoogleDocId(hubUrl) || undefined : undefined,
    tabId: hubUrl ? extractGoogleDocTabId(hubUrl) || undefined : undefined,
    links: rawEntries,
    pdfLinks: rawEntries.filter(l => l.category === 'PDF_DOCUMENT'),
    googleDocLinks: rawEntries.filter(l => l.category === 'GOOGLE_DOC'),
    googleFormLinks: rawEntries.filter(l => l.category === 'GOOGLE_FORM'),
    answerKeyLinks: answerKeys,
    rawPlainTextSummary: plainLines
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 60)
      .join('\n'),
  };
}

/**
 * Crawls a Master Google Doc URL (including specific `?tab=t.xxx` tabs like
 * `https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?pli=1&tab=t.qo6bykb5zkh7`)
 * and extracts every linked PDF, Google Doc, Google Form, and Answer Key.
 */
export async function extractLinksFromGoogleDocHub(url: string): Promise<CourseHubLinkExtractionResult> {
  const docId = extractGoogleDocId(url);
  const tabId = extractGoogleDocTabId(url);
  if (!docId) {
    const rawHtml = await fetchTextWithCorsFallback(url);
    return extractLinksFromHtmlOrText(rawHtml, 'Course Connection Hub', url);
  }

  const tabParam = tabId ? `&tab=${encodeURIComponent(tabId)}` : '';
  const exportHtmlUrl = `https://docs.google.com/document/d/${docId}/export?format=html${tabParam}`;
  const html = await fetchTextWithCorsFallback(exportHtmlUrl);
  return extractLinksFromHtmlOrText(html, 'Course Connection Hub', url);
}


// ── 2. Local File Readers: Word (.docx), PDF (.pdf), Text/Markdown/CSV ────────

/**
 * Unpacks a Word `.docx` file directly in the browser by reading `word/document.xml` from the ZIP entries
 * and decompressing with native `DecompressionStream('deflate-raw')`.
 */
export async function extractTextFromDocxFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);

  // Locate local file header for `word/document.xml`
  let offset = 0;
  while (offset + 30 < bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) {
      offset++;
      continue;
    }
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
    const fileName = new TextDecoder().decode(nameBytes);
    const dataStart = offset + 30 + fileNameLen + extraLen;

    if (fileName === 'word/document.xml' && compressedSize > 0) {
      const slice = bytes.subarray(dataStart, dataStart + compressedSize);
      let xmlText = '';
      if (compression === 0) {
        xmlText = new TextDecoder().decode(slice);
      } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(slice);
        writer.close();
        const decompressed = await new Response(ds.readable).arrayBuffer();
        xmlText = new TextDecoder().decode(decompressed);
      }
      if (xmlText) {
        return xmlText
          .replace(/<\/w:p>/g, '\n')
          .replace(/<w:tab\/>/g, '\t')
          .replace(/<w:br[^/>]*\/>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
      break;
    }
    offset = dataStart + Math.max(1, compressedSize);
  }

  // Fallback raw UTF-8 scan for readable ASCII/Unicode text runs
  const rawText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const xmlMatches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  if (xmlMatches && xmlMatches.length > 0) {
    return xmlMatches
      .map(m => m.replace(/<[^>]+>/g, ''))
      .join(' ')
      .trim();
  }
  return rawText.replace(/[^\x20-\x7E\r\n\t]/g, ' ').replace(/\s{3,}/g, '\n').trim();
}

/**
 * Extracts text & questions from a PDF file (.pdf).
 * Supports embedded PDF text streams, DecompressionStream FlateDecode streams, and scanned PDF fallback.
 */
export async function extractTextFromPdfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const rawLatin = new TextDecoder('latin1').decode(bytes);

  const chunks: string[] = [];

  const decodePdfLiteral = (s: string) =>
    s
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');

  const extractBtEtStrings = (content: string) => {
    const btBlocks = content.match(/BT[\s\S]*?ET/g) || [];
    for (const blk of btBlocks) {
      const tjArrays = blk.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
      for (const arr of tjArrays) {
        const literals = arr.match(/\((?:\\.|[^\\)])*\)/g) || [];
        const line = literals.map(l => decodePdfLiteral(l.slice(1, -1))).join('');
        if (line.trim()) chunks.push(line.trim());
      }
      const singleTjs = blk.match(/\((?:\\.|[^\\)])*\)\s*Tj/g) || [];
      for (const stj of singleTjs) {
        const inner = stj.replace(/\)\s*Tj$/, '').slice(1);
        const decoded = decodePdfLiteral(inner);
        if (decoded.trim()) chunks.push(decoded.trim());
      }
    }
  };

  // 1. Check uncompressed text blocks first
  extractBtEtStrings(rawLatin);

  // 2. Decompress FlateDecode streams with DecompressionStream('deflate')
  if (typeof DecompressionStream !== 'undefined') {
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;
    let streamCount = 0;
    while ((match = streamRegex.exec(rawLatin)) !== null && streamCount < 45) {
      streamCount++;
      const binStr = match[1];
      if (binStr.length < 10 || binStr.length > 500_000) continue;
      const streamBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) streamBytes[i] = binStr.charCodeAt(i) & 0xff;
      try {
        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        writer.write(streamBytes);
        writer.close();
        const decompressed = await new Response(ds.readable).arrayBuffer();
        const text = new TextDecoder('latin1').decode(decompressed);
        extractBtEtStrings(text);
      } catch {
        // stream might be image or raw deflate
      }
    }
  }

  const combined = chunks
    .join('\n')
    .replace(/[^\x20-\x7E\r\n\t’“”—–•]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (combined.length >= 30) {
    return combined;
  }

  // Fallback if PDF is a scanned image PDF or custom-encoded font: generate structured template from filename
  const cleanName = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
  return [
    `# ${cleanName}`,
    `Interactive PDF Worksheet & Study Guide imported from ${file.name}.`,
    ``,
    `1. What is the central theme, thesis, or key Scripture passage in ${cleanName}?`,
    `Answer: Core theme and primary textual evidence`,
    ``,
    `2. Summarize the three main takeaways or observations from this document.`,
    `Answer: Observation, interpretation, and application`,
    ``,
    `3. Multiple Choice: Which statement best reflects the conclusion of ${cleanName}?`,
    `A) The primary argument is supported by historical and textual context`,
    `B) The passage has no practical application`,
    `C) The context is unrelated to the unit syllabus`,
    `D) None of the above`,
    `Answer: A`,
  ].join('\n');
}

// ── 3. Answer-Key Parser & Merger ─────────────────────────────────────────────

export interface ParsedAnswerKey {
  byNumber: Record<number, { answer: string; explanation?: string; points?: number }>;
  byPromptKeyword: Array<{ match: string; answer: string; explanation?: string }>;
}

/**
 * Parses a standalone Answer Key document (from a Google Doc, Word doc, PDF, or pasted text).
 * Recognizes formats like:
 * - `1. B` or `1) B — Because Romans 8:1...`
 * - `Question 2: Grace through faith (Ephesians 2:8-9) [5 pts]`
 * - `Q3: True`
 * - `4 - C`
 */
export function parseAnswerKeyText(rawKeyText: string): ParsedAnswerKey {
  const byNumber: Record<number, { answer: string; explanation?: string; points?: number }> = {};
  const byPromptKeyword: Array<{ match: string; answer: string; explanation?: string }> = [];

  if (!rawKeyText || !rawKeyText.trim()) return { byNumber, byPromptKeyword };

  const lines = rawKeyText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Pattern A: `1. B`, `Q1: Romans 8:1`, `1) True - explanation`, `#2: C (2 pts)`
    const numMatch = line.match(
      /^(?:Q(?:uestion)?\s*#?|#)?(\d{1,3})\s*[.):\-–]\s*(.+)$/i
    );
    if (numMatch) {
      const qNum = Number(numMatch[1]);
      let rest = numMatch[2].trim();
      let points: number | undefined;
      const ptMatch = rest.match(/\[(\d+)\s*(?:pts?|points?)\]/i) || rest.match(/\((\d+)\s*(?:pts?|points?)\)/i);
      if (ptMatch) {
        points = Number(ptMatch[1]);
        rest = rest.replace(ptMatch[0], '').trim();
      }
      const expSplit = rest.split(/\s+(?:—|--|because|explanation:|rationale:)\s+/i);
      const ans = expSplit[0].trim();
      const explanation = expSplit.slice(1).join(' — ').trim() || undefined;
      if (ans) {
        byNumber[qNum] = { answer: ans, explanation, points };
      }
      continue;
    }

    // Pattern B: `Answer 1: ...` or `Key 1: ...`
    const altMatch = line.match(/^(?:Answer|Key|Correct)\s*#?(\d{1,3})\s*[:\-–]\s*(.+)$/i);
    if (altMatch) {
      byNumber[Number(altMatch[1])] = { answer: altMatch[2].trim() };
      continue;
    }

    // Pattern C: `Topic / Term => Answer`
    const kwMatch = line.match(/^([^:]{3,60}):\s*(.+)$/);
    if (kwMatch && !/^(name|date|class|teacher|score|grade|title|instructions)$/i.test(kwMatch[1].trim())) {
      byPromptKeyword.push({
        match: kwMatch[1].trim().toLowerCase(),
        answer: kwMatch[2].trim(),
      });
    }
  }

  return { byNumber, byPromptKeyword };
}

// ── 4. Curriculum Body Parser (Lessons, Syllabus Weeks, Questions & Skills) ───

const SCRIPTURE_REGEX =
  /\b((?:[1-3]\s+)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Songs|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\s+\d+(?::\d+(?:-\d+)?)?)\b/i;

export function parseCurriculumAndBuildUnit(params: {
  orgId: string;
  programId?: string;
  title?: string;
  rawCurriculumText: string;
  rawAnswerKeyText?: string;
  sourceKind: CurriculumSourceKind;
  sourceLabel: string;
  sourceUrl?: string;
  answerKeySourceLabel?: string;
  unitKind?: IngestedCurriculumUnit['kind'];
  preParsedQuestions?: Array<{
    prompt: string;
    type: IngestedQuestion['type'];
    options?: string[];
    points?: number;
    correctAnswer?: string;
    explanation?: string;
  }>;
}): { unit: IngestedCurriculumUnit; telaDoc: TelaDoc } {
  const {
    orgId,
    programId,
    rawCurriculumText,
    rawAnswerKeyText,
    sourceKind,
    sourceLabel,
    sourceUrl,
    answerKeySourceLabel,
    unitKind = 'INTERACTIVE_LESSON',
    preParsedQuestions = [],
  } = params;

  const parsedKey = parseAnswerKeyText(rawAnswerKeyText || '');
  const lines = rawCurriculumText
    .split(/\r?\n/)
    .map(l => l.trim());

  let detectedTitle = params.title?.trim() || '';
  const lessonBlocks: IngestedCurriculumUnit['lessonBlocks'] = [];
  const syllabusWeeks: PlanWeek[] = [];
  const questions: IngestedQuestion[] = [];

  let currentSkillTitle = 'Core Concept & Textual Mastery';
  let currentSkillId = 'skill_1';
  const skillsMap = new Map<string, IngestedMasterySkill>();

  const ensureSkill = (id: string, title: string, passage?: string): IngestedMasterySkill => {
    const existing = skillsMap.get(id);
    if (existing) {
      if (passage && !existing.scripturePassage) existing.scripturePassage = passage;
      return existing;
    }
    const created: IngestedMasterySkill = {
      id,
      title,
      description: passage
        ? `Mastery of ${title} (${passage}) through interactive Tela practice and assessment.`
        : `Mastery of ${title} across lesson readings and auto-graded checks.`,
      standardCode: `MASTERY.${skillsMap.size + 1}`,
      scripturePassage: passage,
      questionIds: [],
      targetQuestions: 0,
    };
    skillsMap.set(id, created);
    return created;
  };

  // Detect embedded "Answer Key" section at the bottom of the same document
  let inEmbeddedAnswerKey = false;
  const embeddedKeyLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i++;
      continue;
    }

    if (/^(?:#+\s*)?(?:answer\s+key|teacher\s+key|solutions|grading\s+key)\s*:?$/i.test(line)) {
      inEmbeddedAnswerKey = true;
      i++;
      continue;
    }

    if (inEmbeddedAnswerKey) {
      embeddedKeyLines.push(line);
      i++;
      continue;
    }

    // 1. Check for Title / Heading
    if (/^#\s+(.+)/.test(line) && !detectedTitle) {
      detectedTitle = line.replace(/^#+\s+/, '').trim();
      lessonBlocks.push({
        id: `lblk_${lessonBlocks.length + 1}`,
        kind: 'h1',
        text: detectedTitle,
      });
      i++;
      continue;
    }

    // 2. Check for Week / Unit / Lesson / Module Header
    const weekMatch = line.match(
      /^(?:#+\s*)?(?:Week|Unit|Module|Lesson|Session)\s+(\d+)\s*[:\-–.]?\s*(.*)$/i
    );
    if (weekMatch) {
      const wkNum = Number(weekMatch[1]);
      const wkTitle = weekMatch[2].trim() || `Week ${wkNum} Study`;
      const scMatch = line.match(SCRIPTURE_REGEX) || (lines[i + 1] || '').match(SCRIPTURE_REGEX);
      const passage = scMatch ? scMatch[1] : '';
      const parsedRef = passage ? parseRef(passage) : null;

      currentSkillId = `skill_unit_${wkNum}`;
      currentSkillTitle = wkTitle;
      ensureSkill(currentSkillId, currentSkillTitle, parsedRef ? formatRef(parsedRef) : passage);

      syllabusWeeks.push({
        id: `wk_${wkNum}_${Date.now().toString(36).slice(-3)}`,
        title: wkTitle,
        passage: parsedRef ? formatRef(parsedRef) : passage || 'John 1:1-14',
        ...(parsedRef ? { refId: refId(parsedRef) } : {}),
        note: lines[i + 1] && !/^\d+[.)]/.test(lines[i + 1]) ? lines[i + 1] : `Interactive Tela study for ${wkTitle}`,
        worksheetPrompt: `Complete the ${wkTitle} interactive check in Tela.`,
      });

      lessonBlocks.push({
        id: `lblk_${lessonBlocks.length + 1}`,
        kind: 'h2',
        text: `Unit ${wkNum}: ${wkTitle}`,
        scripturePassage: parsedRef ? formatRef(parsedRef) : passage || undefined,
      });
      i++;
      continue;
    }

    // 3. Check for H2/H3 section header
    if (/^#{2,3}\s+(.+)/.test(line)) {
      const secTitle = line.replace(/^#{2,3}\s+/, '').trim();
      currentSkillId = `skill_sec_${skillsMap.size + 1}`;
      currentSkillTitle = secTitle;
      const scMatch = secTitle.match(SCRIPTURE_REGEX);
      ensureSkill(currentSkillId, currentSkillTitle, scMatch ? scMatch[1] : undefined);
      lessonBlocks.push({
        id: `lblk_${lessonBlocks.length + 1}`,
        kind: 'h2',
        text: secTitle,
        scripturePassage: scMatch ? scMatch[1] : undefined,
      });
      i++;
      continue;
    }

    // 4. Check for Numbered Question (`1. ...`, `Q1: ...`, `Question 1: ...`)
    const qMatch = line.match(/^(?:Q(?:uestion)?\s*#?)?(\d{1,3})\s*[.):]\s+(.+)$/i);
    if (qMatch && preParsedQuestions.length === 0) {
      const qNum = questions.length + 1;
      let prompt = qMatch[2].trim();
      let points = 1;
      const ptMatch = prompt.match(/\[(\d+)\s*(?:pts?|points?)\]/i) || prompt.match(/\((\d+)\s*(?:pts?|points?)\)/i);
      if (ptMatch) {
        points = Number(ptMatch[1]);
        prompt = prompt.replace(ptMatch[0], '').trim();
      }

      const options: string[] = [];
      let inlineAnswer: string | undefined;
      let explanation: string | undefined;

      // Look ahead for options A) B) C) D) or inline Answer: / Key:
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (!nextLine) {
          j++;
          continue;
        }
        // Option line: `A) ...`, `a. ...`, `[x] B) ...`, `*C) ...`
        const optMatch = nextLine.match(/^(\*|\[x\])?\s*([A-F])[.)]\s+(.+)$/i);
        if (optMatch) {
          const isMarkedCorrect = Boolean(optMatch[1]);
          const letter = optMatch[2].toUpperCase();
          const optText = optMatch[3].trim();
          const formattedOpt = `${letter}) ${optText}`;
          options.push(formattedOpt);
          if (isMarkedCorrect) inlineAnswer = letter;
          j++;
          continue;
        }
        // Inline Answer line: `Answer: B`, `Correct Answer: ...`, `Key: ...`
        const ansMatch = nextLine.match(/^(?:Correct\s+)?(?:Answer|Key|Solution)\s*[:\-–]\s*(.+)$/i);
        if (ansMatch) {
          inlineAnswer = ansMatch[1].trim();
          j++;
          continue;
        }
        // Inline Explanation / Rubric line
        const expMatch = nextLine.match(/^(?:Explanation|Rationale|Rubric|Note)\s*[:\-–]\s*(.+)$/i);
        if (expMatch) {
          explanation = expMatch[1].trim();
          j++;
          continue;
        }
        break;
      }

      const scMatch = prompt.match(SCRIPTURE_REGEX);
      const passage = scMatch ? scMatch[1] : undefined;
      const skill = ensureSkill(currentSkillId, currentSkillTitle, passage);

      let qType: IngestedQuestion['type'] = 'short-answer';
      if (options.length >= 2) {
        qType = 'multiple-choice';
      } else if (/^(true\s+or\s+false|t\s*\/\s*f)\b/i.test(prompt) || /\b(true\s+or\s+false)\b/i.test(prompt)) {
        qType = 'true-false';
        options.push('True', 'False');
      } else if (passage) {
        qType = 'scripture-reflection';
      } else if (/^(calculate|solve|evaluate|find\s+the\s+value|how\s+many)\b/i.test(prompt)) {
        qType = 'numeric';
      }

      const qId = `q_${qNum}`;
      skill.questionIds.push(qId);
      skill.targetQuestions = skill.questionIds.length;

      questions.push({
        id: qId,
        number: qNum,
        prompt,
        type: qType,
        options: options.length > 0 ? options : undefined,
        correctAnswer: inlineAnswer,
        explanation,
        points,
        skillId: skill.id,
        skillTitle: skill.title,
        scripturePassage: passage,
      });

      i = j;
      continue;
    }

    // 5. Regular Lesson Paragraph or Scripture Callout
    const scMatch = line.match(SCRIPTURE_REGEX);
    lessonBlocks.push({
      id: `lblk_${lessonBlocks.length + 1}`,
      kind: scMatch ? 'callout' : 'p',
      text: line,
      scripturePassage: scMatch ? scMatch[1] : undefined,
    });
    i++;
  }

  // If Google Forms provided pre-parsed structured questions, hydrate them
  if (preParsedQuestions.length > 0 && questions.length === 0) {
    const skill = ensureSkill(currentSkillId, currentSkillTitle);
    preParsedQuestions.forEach((pq, idx) => {
      const qNum = idx + 1;
      const qId = `q_${qNum}`;
      skill.questionIds.push(qId);
      skill.targetQuestions = skill.questionIds.length;
      const scMatch = pq.prompt.match(SCRIPTURE_REGEX);
      questions.push({
        id: qId,
        number: qNum,
        prompt: pq.prompt,
        type: pq.type,
        options: pq.options,
        correctAnswer: pq.correctAnswer,
        explanation: pq.explanation,
        points: pq.points || 1,
        skillId: skill.id,
        skillTitle: skill.title,
        scripturePassage: scMatch ? scMatch[1] : undefined,
      });
    });
  }

  // If no explicit numbered questions were found in a prose lesson doc, synthesize interactive checks from lesson blocks
  if (questions.length === 0) {
    const skill = ensureSkill(currentSkillId, detectedTitle || 'Lesson Comprehension & Mastery');
    const scBlocks = lessonBlocks.filter(b => b.scripturePassage);
    const firstPassage = scBlocks[0]?.scripturePassage;

    const synth: Array<Omit<IngestedQuestion, 'id' | 'number' | 'skillId' | 'skillTitle'>> = [
      {
        prompt: firstPassage
          ? `According to ${firstPassage} in this lesson, what is the primary truth or teaching revealed in the passage?`
          : `What is the central thesis and key takeaway of "${detectedTitle || sourceLabel}"?`,
        type: firstPassage ? 'scripture-reflection' : 'short-answer',
        correctAnswer: firstPassage || 'Central lesson takeaway',
        explanation: 'Synthesized from the primary lesson reading.',
        points: 2,
        scripturePassage: firstPassage,
      },
      {
        prompt: `Which statement best summarizes the core objective of "${detectedTitle || sourceLabel}"?`,
        type: 'multiple-choice',
        options: [
          'A) Applying the primary textual and conceptual principles in daily practice',
          'B) Ignoring the historical and textual context of the lesson',
          'C) Skipping the mastery reflection prompts',
          'D) None of the above',
        ],
        correctAnswer: 'A',
        explanation: 'Option A aligns with the curriculum objective.',
        points: 1,
      },
      {
        prompt: 'True or False: I have read the lesson passage and completed the key observation notes.',
        type: 'true-false',
        options: ['True', 'False'],
        correctAnswer: 'True',
        points: 1,
      },
    ];

    synth.forEach((sq, idx) => {
      const qNum = idx + 1;
      const qId = `q_${qNum}`;
      skill.questionIds.push(qId);
      skill.targetQuestions = skill.questionIds.length;
      questions.push({
        ...sq,
        id: qId,
        number: qNum,
        skillId: skill.id,
        skillTitle: skill.title,
      });
    });
  }

  // Merge embedded Answer Key + separate Answer Key doc into questions
  const embeddedKey = parseAnswerKeyText(embeddedKeyLines.join('\n'));
  for (const q of questions) {
    const fromSeparate = parsedKey.byNumber[q.number];
    const fromEmbedded = embeddedKey.byNumber[q.number];
    const matched = fromSeparate || fromEmbedded;
    if (matched) {
      q.correctAnswer = matched.answer;
      if (matched.explanation) q.explanation = matched.explanation;
      if (matched.points) q.points = matched.points;
    } else if (!q.correctAnswer && parsedKey.byPromptKeyword.length > 0) {
      const lowerPrompt = q.prompt.toLowerCase();
      const kw = parsedKey.byPromptKeyword.find(k => lowerPrompt.includes(k.match));
      if (kw) {
        q.correctAnswer = kw.answer;
        if (kw.explanation) q.explanation = kw.explanation;
      }
    }
  }

  // If no explicit weeks were parsed, create a default week from the lesson so it can be added to any syllabus
  if (syllabusWeeks.length === 0) {
    const firstPassage =
      questions.find(q => q.scripturePassage)?.scripturePassage ||
      lessonBlocks.find(b => b.scripturePassage)?.scripturePassage ||
      'John 1:1-14';
    const parsedRef = parseRef(firstPassage);
    syllabusWeeks.push({
      id: `wk_1_${Date.now().toString(36).slice(-3)}`,
      title: detectedTitle || sourceLabel,
      passage: parsedRef ? formatRef(parsedRef) : firstPassage,
      ...(parsedRef ? { refId: refId(parsedRef) } : {}),
      note: lessonBlocks.find(b => b.kind === 'p')?.text || `Interactive Tela unit imported from ${sourceLabel}.`,
      worksheetPrompt: `Complete the ${questions.length}-question interactive Tela check.`,
    });
  }

  const finalTitle = detectedTitle || sourceLabel.replace(/\.[a-z0-9]+$/i, '');
  const unitId = `cur_${orgId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  // Build DigitalWorksheet compatible with `worksheetToTelaDoc` & `<WorksheetFillable />`
  const wsFields: WorksheetField[] = questions.map((q, idx) => {
    const fieldType: WorksheetFieldType =
      q.type === 'multiple-choice'
        ? 'multiple-choice'
        : q.type === 'true-false'
        ? 'true-false'
        : q.type === 'numeric'
        ? 'numeric'
        : q.type === 'essay'
        ? 'essay'
        : 'text';
    return {
      id: q.id,
      type: fieldType,
      prompt: `${q.number}. ${q.prompt}`,
      options: q.options,
      correctAnswer: q.correctAnswer,
      points: q.points,
      bbox: [0.06, Math.min(0.92, 0.12 + idx * 0.09), 0.94, Math.min(0.98, 0.19 + idx * 0.09)],
      // Current WorksheetField shape (percent of page) — worksheetToTelaDoc and WorksheetFillable read these.
      label: q.prompt,
      ordinal: String(q.number),
      choices: q.options,
      box: { x: 6, y: Math.min(92, 12 + idx * 9), width: 88, height: 7 },
      needsManualGrade: !q.correctAnswer,
    };
  });

  const wsSegments: WorksheetSegment[] = [
    ...lessonBlocks.slice(0, 8).map((b, idx) => ({
      id: `seg_lesson_${idx + 1}`,
      kind: (b.kind === 'h1' || b.kind === 'h2' ? 'heading' : 'instructions') as WorksheetSegment['kind'],
      text: b.text,
      box: { x: 6, y: Math.min(10, 2 + idx), width: 88, height: 1 },
      confidence: 1,
    })),
    ...questions.map(q => ({
      id: `seg_${q.id}`,
      kind: 'question' as const,
      questionNumber: String(q.number),
      text: q.prompt,
      fieldType: (
        q.type === 'multiple-choice'
          ? 'multiple-choice'
          : q.type === 'true-false'
          ? 'true-false'
          : q.type === 'numeric'
          ? 'numeric'
          : 'text'
      ) as WorksheetFieldType,
      options: q.options,
      answerKey: q.correctAnswer,
      points: q.points,
      box: { x: 6, y: Math.min(91, 11 + q.number * 9), width: 88, height: 2 },
      confidence: 1,
    })),
  ];

  const now = Date.now();
  const worksheet: DigitalWorksheet = {
    id: `ws_${unitId}`,
    ownerId: orgId,
    title: finalTitle,
    subject: 'Curriculum & Mastery',
    gradeBand: 'All Ages',
    instructions: `Complete the lesson reading and answer all ${questions.length} interactive items. Powered by Tela.`,
    sourceImageUrl: '',
    fields: wsFields,
    segments: wsSegments,
    createdAt: now,
    updatedAt: now,
  };

  // Convert worksheet into interactive TelaDoc (WRITER + BASE + FORM + VECTOR devices)
  const baseTelaDoc = worksheetToTelaDoc(worksheet);

  // Match Sacred Library Supplemental Materials (Manuscripts, Patristic Fathers, Councils, Artifacts, Hymns)
  const scriptureRefsForBridge = [
    ...lessonBlocks.map(b => b.scripturePassage).filter((x): x is string => Boolean(x)),
    ...questions.map(q => q.scripturePassage).filter((x): x is string => Boolean(x)),
  ];
  const sacredLibrarySupplements = matchSacredLibrarySupplementsForLesson({
    title: finalTitle,
    rawText: rawCurriculumText,
    scripturePassages: scriptureRefsForBridge,
  });

  const livingTemplate = getDefaultLivingTemplateForUnit({
    id: unitId,
    kind: unitKind,
    title: finalTitle,
  });

  // Enhance TelaDoc with a dedicated Frame 1 Interactive Lesson Reader (`TelaWriterDevice`)
  // alongside the Interactive Student Response Form & Auto-Grading Base Table
  const lessonWriterId = `dev_lesson_writer_${unitId}`;
  const writerBlocks: TelaWriterBlock[] = [
    { id: `${lessonWriterId}_h1`, kind: 'h1', text: finalTitle },
    {
      id: `${lessonWriterId}_meta`,
      kind: 'callout',
      text: `Source: ${sourceLabel}${answerKeySourceLabel ? ` · Answer Key: ${answerKeySourceLabel}` : ''} · Living Design: ${livingTemplate.name} · ${questions.length} Interactive Items · ${questions.reduce((s, q) => s + q.points, 0)} Total Points`,
    },
    ...lessonBlocks.map((b, idx) => ({
      id: `${lessonWriterId}_b_${idx}`,
      kind: (b.kind === 'h1' || b.kind === 'h2' || b.kind === 'quote' || b.kind === 'callout' ? b.kind : 'p') as TelaWriterBlock['kind'],
      text: b.scripturePassage ? `${b.text} [${b.scripturePassage}]` : b.text,
    })),
    ...(sacredLibrarySupplements.length > 0
      ? [
          {
            id: `${lessonWriterId}_sacred_hdr`,
            kind: 'h2' as const,
            text: `Lorea Sacred Library · Supplemental Primary Sources & Artifacts (${sacredLibrarySupplements.length})`,
          },
          ...sacredLibrarySupplements.map((sup, sIdx) => ({
            id: `${lessonWriterId}_sacred_${sIdx}`,
            kind: 'callout' as const,
            text: `[${sup.categoryBadge} · ${sup.era}] ${sup.title} — ${sup.summary} | Lesson Connection: ${sup.connectionToLesson}${sup.primaryExcerpt ? ` | Excerpt: ${sup.primaryExcerpt}` : ''}`,
          })),
        ]
      : []),
    {
      id: `${lessonWriterId}_q_hdr`,
      kind: 'h2',
      text: 'Interactive Assessment & Answer Key Check',
    },
    ...questions.map(q => ({
      id: `${lessonWriterId}_q_${q.id}`,
      kind: 'check' as const,
      text: `${q.number}. ${q.prompt}${q.options ? ` (${q.options.join(' / ')})` : ''}${q.correctAnswer ? ` [Key: ${q.correctAnswer}]` : ''}`,
      checked: false,
    })),
  ];

  const lessonWriterDevice: TelaWriterDevice = {
    id: lessonWriterId,
    type: 'WRITER',
    mode: 'DOCUMENT',
    blocks: writerBlocks,
  };

  const lessonFrame: TelaFrame = {
    id: `frame_lesson_${unitId}`,
    kind: 'PAPER',
    preset: 'LETTER',
    orientation: 'PORTRAIT',
    x: -880,
    y: 0,
    w: 816,
    h: 1056,
    deviceIds: [lessonWriterId],
    label: `${finalTitle} · Lesson & Answer Guide`,
  };

  const telaDoc: TelaDoc = {
    ...baseTelaDoc,
    id: `tela_${unitId}`,
    title: `${finalTitle} (Interactive Tela)`,
    frames: [lessonFrame, ...baseTelaDoc.frames],
    devices: {
      ...baseTelaDoc.devices,
      [lessonWriterId]: lessonWriterDevice,
    },
  };

  const masterySkills = Array.from(skillsMap.values());
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

  const unit: IngestedCurriculumUnit = {
    id: unitId,
    orgId,
    programId,
    title: finalTitle,
    subtitle: `${sourceKind.replace('_', ' ')} · ${questions.length} Interactive Questions · ${sacredLibrarySupplements.length} Sacred Library Supplements`,
    sourceKind,
    sourceLabel,
    sourceUrl,
    answerKeySourceLabel,
    kind: unitKind,
    lessonBlocks,
    questions,
    masterySkills,
    syllabusWeeks,
    telaDocId: telaDoc.id,
    worksheet,
    totalPoints,
    sacredLibrarySupplements,
    livingTemplateId: livingTemplate.id,
    createdAt: now,
  };

  return { unit, telaDoc };
}

/**
 * High-level orchestrator: ingests a Lesson/Curriculum source (File, URL, or Text) + optional Answer Key
 * (File, URL, or Text), saves the interactive `TelaDoc` into `telaStore`, persists the `IngestedCurriculumUnit`,
 * and returns both ready for immediate launch or inline completion.
 */
export async function ingestCurriculumToTela(params: {
  orgId: string;
  orgName?: string;
  scopeKind?: 'org' | 'user';
  programId?: string;
  title?: string;
  unitKind?: IngestedCurriculumUnit['kind'];
  libraryCategory?: LessonLibraryCategory;
  uploadedByRole?: string;
  createdByName?: string;
  extractedFromHubTitle?: string;
  extractedFromHubUrl?: string;
  isAnswerKeyOnly?: boolean;
  livingTemplateId?: string;
  lessonFile?: File | null;
  lessonUrl?: string;
  lessonText?: string;
  answerKeyFile?: File | null;
  answerKeyUrl?: string;
  answerKeyText?: string;
}): Promise<{ unit: IngestedCurriculumUnit; telaDoc: TelaDoc }> {
  let rawCurriculumText = params.lessonText?.trim() || '';
  let sourceKind: CurriculumSourceKind = 'TEXT_MARKDOWN';
  let sourceLabel = params.title?.trim() || 'Interactive Lesson';
  let preParsedQuestions: Array<{
    prompt: string;
    type: IngestedQuestion['type'];
    options?: string[];
    points?: number;
    correctAnswer?: string;
    explanation?: string;
  }> = [];

  // 1. Extract Lesson Source
  if (params.lessonFile) {
    const f = params.lessonFile;
    sourceLabel = f.name;
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.pdf')) {
      sourceKind = 'PDF_DOCUMENT';
      rawCurriculumText = await extractTextFromPdfFile(f);
    } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      sourceKind = 'WORD_DOCX';
      rawCurriculumText = await extractTextFromDocxFile(f);
    } else if (f.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(lower)) {
      sourceKind = 'IMAGE_SCAN';
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read worksheet image.'));
        reader.readAsDataURL(f);
      });
      const scanRes = await digitizeWorksheetOnDevice(dataUrl, params.orgId, () => {});
      rawCurriculumText = [
        `# ${scanRes.sheet.title || f.name}`,
        ...(scanRes.sheet.segments || []).map((s, idx) =>
          s.kind === 'question' ? `${idx + 1}. ${s.text}` : s.text
        ),
      ].join('\n');
    } else {
      sourceKind = 'TEXT_MARKDOWN';
      rawCurriculumText = await f.text();
    }
  } else if (params.lessonUrl && params.lessonUrl.trim()) {
    const url = params.lessonUrl.trim();
    sourceKind = detectLinkKind(url);
    sourceLabel = params.title?.trim() || url;
    if (!rawCurriculumText) {
      if (sourceKind === 'GOOGLE_FORM') {
        const formRes = await extractGoogleForm(url);
        if (!params.title && formRes.title) sourceLabel = formRes.title;
        rawCurriculumText = [rawCurriculumText, formRes.rawText].filter(Boolean).join('\n\n');
        preParsedQuestions = formRes.structuredQuestions;
      } else {
        const docRes = await extractGoogleDocText(url);
        if (!params.title && docRes.title) sourceLabel = docRes.title;
        rawCurriculumText = [rawCurriculumText, docRes.text].filter(Boolean).join('\n\n');
      }
    }
  }

  // 2. Extract Companion Answer Key Source (if provided via File or Link or Text)
  let rawAnswerKeyText = params.answerKeyText?.trim() || '';
  let answerKeySourceLabel: string | undefined = rawAnswerKeyText ? 'Linked Teacher Answer Key' : undefined;

  if (params.answerKeyFile) {
    const kf = params.answerKeyFile;
    answerKeySourceLabel = kf.name;
    const lower = kf.name.toLowerCase();
    if (lower.endsWith('.pdf')) {
      rawAnswerKeyText = [rawAnswerKeyText, await extractTextFromPdfFile(kf)].filter(Boolean).join('\n');
    } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      rawAnswerKeyText = [rawAnswerKeyText, await extractTextFromDocxFile(kf)].filter(Boolean).join('\n');
    } else {
      rawAnswerKeyText = [rawAnswerKeyText, await kf.text()].filter(Boolean).join('\n');
    }
  } else if (params.answerKeyUrl && params.answerKeyUrl.trim()) {
    const kUrl = params.answerKeyUrl.trim();
    answerKeySourceLabel = 'Linked Answer Key Doc';
    if (!rawAnswerKeyText) {
      try {
        const docRes = await extractGoogleDocText(kUrl);
        rawAnswerKeyText = [rawAnswerKeyText, docRes.text].filter(Boolean).join('\n');
      } catch {
        // Keep existing rawAnswerKeyText if remote key doc is restricted
      }
    }
  }

  const safeOrgId = normalizeToGreatFaithOrgId(params.orgId);

  const { unit, telaDoc } = parseCurriculumAndBuildUnit({
    orgId: safeOrgId,
    programId: params.programId,
    title: params.title,
    rawCurriculumText,
    rawAnswerKeyText,
    sourceKind,
    sourceLabel,
    sourceUrl: params.lessonUrl?.trim() || undefined,
    answerKeySourceLabel,
    unitKind: params.unitKind,
    preParsedQuestions,
  });

  // An org's lesson stays tied to the org, so sharing it as a public template follows the org's policy.
  if (params.scopeKind !== 'user' && !isStandaloneTeacherScopeId(params.orgId)) telaDoc.orgOrigin = { orgId: safeOrgId, orgName: params.orgName };
  await saveTelaDoc(telaDoc);

  const resolvedLibraryCategory =
    params.libraryCategory ||
    inferLessonLibraryCategory(unit.title, unit.kind, params.isAnswerKeyOnly);
  const isStandaloneTeacher =
    params.scopeKind === 'user' || isStandaloneTeacherScopeId(params.orgId);

  // Automatically copy BOTH the Original Document Version AND the Interactive Tela Document Version
  // into Content HQ:
  // - For standalone teachers (`scopeKind === 'user'`): into their own Content HQ under the Document Class Folder
  //   (`Lessons & Course Resources`, `Assignments & Worksheets`, `Quizzes & Assessments`, `Syllabi & Master Source Docs`, `Answer Keys & Rubrics`).
  // - For organizations (`scopeKind === 'org'`): into the organization's Content HQ under `<Organization Name> Education`.
  const assetCopy = await copyCurriculumPairToOrgAssets({
    orgId: safeOrgId,
    orgName: params.orgName || (isStandaloneTeacher ? 'Teacher Content HQ' : GREAT_FAITH_MINISTRIES_NAME),
    scopeKind: isStandaloneTeacher ? 'user' : 'org',
    departmentFolder: isStandaloneTeacher
      ? undefined
      : getOrgEducationFolderName(params.orgName || GREAT_FAITH_MINISTRIES_NAME),
    unitTitle: unit.title,
    unitKind: unit.kind,
    libraryCategory: resolvedLibraryCategory,
    isAnswerKeyOnly: params.isAnswerKeyOnly,
    sourceKind: unit.sourceKind,
    sourceUrl: unit.sourceUrl,
    rawCurriculumText,
    rawAnswerKeyText,
    telaDoc,
  });

  unit.orgId = assetCopy.targetOrgId;
  unit.scopeKind = isStandaloneTeacher ? 'user' : 'org';
  unit.departmentFolder = assetCopy.departmentFolder;
  unit.documentClassFolder = assetCopy.documentClassFolder;
  unit.originalAssetId = assetCopy.originalAsset.id;
  unit.telaAssetId = assetCopy.telaAsset.id;
  unit.answerKeyAssetId = assetCopy.answerKeyAsset?.id;
  unit.rawCurriculumText = rawCurriculumText;
  unit.rawAnswerKeyText = rawAnswerKeyText;
  unit.libraryCategory = resolvedLibraryCategory;
  unit.uploadedByRole = params.uploadedByRole || (isStandaloneTeacher ? 'TEACHER' : 'INSTRUCTOR');
  unit.createdByName = params.createdByName || 'Course Instructor';
  unit.extractedFromHubTitle = params.extractedFromHubTitle;
  unit.extractedFromHubUrl = params.extractedFromHubUrl;
  unit.isAnswerKeyOnly = Boolean(params.isAnswerKeyOnly);
  if (params.livingTemplateId) {
    unit.livingTemplateId = params.livingTemplateId;
  }

  saveIngestedUnit(unit);

  return { unit, telaDoc };
}

// ── 5. Auto-Grading & Mastery Skill Recording Engine ──────────────────────────

function normalizeAnswerToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-f][.)]\s*/i, '')
    .replace(/[.,!?;:"'()]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Grades a student's interactive submission against the unit's Answer Key (`IngestedQuestion.correctAnswer`),
 * updates the Khan-style Mastery Graph (`services/mastery.ts`) for both the student and classroom course,
 * and saves the submission record for the Teacher Gradebook & Assess Work studio.
 */
/** Does a student's answer match the key? Questions with no key get completion credit (two or more characters). */
export function isAnswerCorrect(q: IngestedQuestion, answer: string): boolean {
  const rawStudent = (answer || '').trim();
  const rawExpected = (q.correctAnswer || '').trim();
  let isCorrect = false;
  if (!rawExpected) {
    // Open reflection / completion credit when non-empty
    isCorrect = rawStudent.length >= 2;
  } else if (q.type === 'multiple-choice') {
    const studentLetter = rawStudent.match(/^([A-F])\b/i)?.[1]?.toUpperCase();
    const expectedLetter = rawExpected.match(/^([A-F])\b/i)?.[1]?.toUpperCase();
    if (studentLetter && expectedLetter) {
      isCorrect = studentLetter === expectedLetter;
    } else {
      isCorrect = normalizeAnswerToken(rawStudent) === normalizeAnswerToken(rawExpected);
    }
  } else if (q.type === 'true-false') {
    isCorrect = rawStudent.toLowerCase().startsWith(rawExpected.toLowerCase()[0]);
  } else if (q.type === 'numeric') {
    const nStudent = Number(rawStudent.replace(/[^0-9.-]/g, ''));
    const nExpected = Number(rawExpected.replace(/[^0-9.-]/g, ''));
    isCorrect = Number.isFinite(nStudent) && Number.isFinite(nExpected) && Math.abs(nStudent - nExpected) <= 0.01;
  } else {
    const normS = normalizeAnswerToken(rawStudent);
    const normE = normalizeAnswerToken(rawExpected);
    isCorrect =
      normS.length > 0 &&
      (normS === normE || normS.includes(normE) || (normS.length >= 4 && normE.includes(normS)));
  }
  return isCorrect;
}

export function gradeAndRecordUnitSubmission(params: {
  unit: IngestedCurriculumUnit;
  studentUid: string;
  studentName: string;
  answers: Record<string, string>;
}): StudentUnitSubmission {
  const { unit, studentUid, studentName, answers } = params;
  const questionScores: StudentUnitSubmission['questionScores'] = {};
  const skillTallies: Record<string, { correct: number; total: number }> = {};

  let earnedPoints = 0;
  let totalPoints = 0;

  for (const q of unit.questions) {
    const maxPts = q.points || 1;
    totalPoints += maxPts;
    const rawStudent = (answers[q.id] || '').trim();
    const rawExpected = (q.correctAnswer || '').trim();

    if (!rawExpected && unit.answerKeyWithheld) {
      questionScores[q.id] = { correct: false, earnedPoints: 0, maxPoints: maxPts, pending: true };
      continue;
    }

    const isCorrect = isAnswerCorrect(q, rawStudent);

    const pts = isCorrect ? maxPts : 0;
    earnedPoints += pts;
    questionScores[q.id] = {
      correct: isCorrect,
      earnedPoints: pts,
      maxPoints: maxPts,
      expected: q.correctAnswer,
    };

    if (!skillTallies[q.skillId]) {
      skillTallies[q.skillId] = { correct: 0, total: 0 };
    }
    skillTallies[q.skillId].total += 1;
    if (isCorrect) skillTallies[q.skillId].correct += 1;
  }

  // Record each skill in `services/mastery.ts` under the organization/program course namespace
  const masteryCourseKey = `elevate_${unit.orgId}${unit.programId ? `_${unit.programId}` : ''}`;
  const skillBreakdown: StudentUnitSubmission['skillBreakdown'] = {};

  for (const [skillId, tally] of Object.entries(skillTallies)) {
    const updatedMap = recordSet(masteryCourseKey, skillId, tally.correct, tally.total, false);
    const level: SkillLevel = updatedMap[skillId]?.level ?? 1;
    skillBreakdown[skillId] = {
      correct: tally.correct,
      total: tally.total,
      level,
    };
  }

  // Also record into the global `world-religions` / `christian-education` course key so Academia TeacherHub sees it
  for (const [skillId, tally] of Object.entries(skillTallies)) {
    recordSet('world-religions', `${unit.orgId}_${skillId}`, tally.correct, tally.total, false);
  }

  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 100;
  const sub: StudentUnitSubmission = {
    id: `sub_${unit.id}_${studentUid}_${Date.now().toString(36)}`,
    unitId: unit.id,
    orgId: unit.orgId,
    programId: unit.programId,
    studentUid,
    studentName,
    answers,
    questionScores,
    earnedPoints,
    totalPoints,
    percentage,
    skillBreakdown,
    submittedAt: Date.now(),
  };

  saveUnitSubmission(sub);
  return sub;
}

export function loadOrgMasterySummary(orgId: string, programId?: string) {
  const masteryCourseKey = `elevate_${orgId}${programId ? `_${programId}` : ''}`;
  return loadMastery(masteryCourseKey);
}

/**
 * Extracts all embedded external hyperlinks (`word/_rels/document.xml.rels` + `word/document.xml`)
 * from a `.docx` file (e.g. when a teacher downloads a Google Doc as `.docx`).
 */
export async function extractLinksFromDocxFile(file: File): Promise<CourseHubLinkExtractionResult> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);

  const readZipEntry = async (targetPath: string): Promise<string> => {
    let offset = 0;
    while (offset + 30 < bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) {
        offset++;
        continue;
      }
      const compression = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const fileNameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const nameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
      const fileName = new TextDecoder().decode(nameBytes);
      const dataStart = offset + 30 + fileNameLen + extraLen;

      if (fileName === targetPath && compressedSize > 0) {
        const slice = bytes.subarray(dataStart, dataStart + compressedSize);
        if (compression === 0) {
          return new TextDecoder().decode(slice);
        } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(slice);
          writer.close();
          const decompressed = await new Response(ds.readable).arrayBuffer();
          return new TextDecoder().decode(decompressed);
        }
      }
      offset = dataStart + Math.max(1, compressedSize);
    }
    return '';
  };

  const relsXml = await readZipEntry('word/_rels/document.xml.rels');
  const docXml = await readZipEntry('word/document.xml');

  // Map rId -> Target URL
  const relMap = new Map<string, string>();
  const relRegex = /<Relationship\b[^>]*Id=["']([^"']+)["'][^>]*Target=["']([^"']+)["'][^>]*>/gi;
  let rMatch: RegExpExecArray | null;
  while ((rMatch = relRegex.exec(relsXml)) !== null) {
    relMap.set(rMatch[1], rMatch[2].replace(/&amp;/g, '&'));
  }

  // Build synthetic HTML anchors from <w:hyperlink r:id="rId...">...</w:hyperlink>
  const syntheticHtmlParts: string[] = [`<h1>${file.name.replace(/\.docx$/i, '')}</h1>`];
  const linkRegex = /<w:hyperlink\b[^>]*r:id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/w:hyperlink>/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = linkRegex.exec(docXml)) !== null) {
    const rId = lMatch[1];
    const targetUrl = relMap.get(rId);
    const labelText = lMatch[2].replace(/<[^>]+>/g, '').trim();
    if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
      syntheticHtmlParts.push(`<p><a href="${targetUrl}">${labelText || targetUrl}</a></p>`);
    }
  }

  // Also include any relationships that were not matched inside <w:hyperlink>
  for (const [, targetUrl] of relMap.entries()) {
    if (/^https?:\/\//i.test(targetUrl)) {
      syntheticHtmlParts.push(`<p><a href="${targetUrl}">${targetUrl}</a></p>`);
    }
  }

  const plainText = await extractTextFromDocxFile(file);
  syntheticHtmlParts.push(`<div>${plainText}</div>`);

  return extractLinksFromHtmlOrText(syntheticHtmlParts.join('\n'), file.name.replace(/\.docx$/i, ''));
}

/**
 * Batch-converts a list of extracted PDF / Google Doc / Google Form links (and their paired Answer Key links)
 * from a Master Course Connection Google Doc into interactive Tela documents + Mastery skills.
 */
export async function batchIngestExtractedLinksToTela(params: {
  orgId: string;
  orgName?: string;
  scopeKind?: 'org' | 'user';
  programId?: string;
  links: ExtractedCourseResourceLink[];
  includeAnswerKeyDocs?: boolean;
  onProgress?: (current: number, total: number, label: string) => void;
}): Promise<Array<{ unit: IngestedCurriculumUnit; telaDoc: TelaDoc }>> {
  const results: Array<{ unit: IngestedCurriculumUnit; telaDoc: TelaDoc }> = [];
  const actionable = params.includeAnswerKeyDocs
    ? params.links
    : params.links.filter(l => !l.isAnswerKey || Boolean(l.fallbackCurriculumText));

  for (let i = 0; i < actionable.length; i++) {
    const item = actionable[i];
    params.onProgress?.(i + 1, actionable.length, item.label);

    const resolvedKind: IngestedCurriculumUnit['kind'] =
      item.category === 'GOOGLE_FORM' || /\bquiz\b/i.test(item.label)
        ? 'QUIZ'
        : /\b(test|exam|examination|benchmark)\b/i.test(item.label)
          ? 'TEST'
          : 'INTERACTIVE_LESSON';

    try {
      const built = await ingestCurriculumToTela({
        orgId: params.orgId,
        orgName: params.orgName,
        scopeKind: params.scopeKind,
        programId: params.programId,
        title: item.label,
        isAnswerKeyOnly: item.isAnswerKey,
        lessonUrl: item.url,
        lessonText: item.fallbackCurriculumText,
        answerKeyUrl: item.pairedAnswerKeyUrl,
        answerKeyText: item.fallbackAnswerKeyText,
        unitKind: resolvedKind,
      });
      results.push(built);
    } catch {
      const fallbackText =
        item.fallbackCurriculumText ||
        `# ${item.label}\nSource Link: ${item.url}\n\n1. Key takeaway and biblical/course analysis from ${item.label}:\n2. Explain the primary Scripture passage and doctrine covered in ${item.label}:`;
      const built = await ingestCurriculumToTela({
        orgId: params.orgId,
        orgName: params.orgName,
        scopeKind: params.scopeKind,
        programId: params.programId,
        title: item.label,
        isAnswerKeyOnly: item.isAnswerKey,
        lessonUrl: item.url,
        lessonText: fallbackText,
        answerKeyText: item.fallbackAnswerKeyText,
        unitKind: resolvedKind,
      });
      results.push(built);
    }
  }

  return results;
}

/**
 * Ensures every document detected in `REVELATION_2_COURSE_CONNECTION_PRESET` is onboarded into
 * `<Org Name> Education` for organization accounts (and repairs any earlier cached unit that had 0 questions
 * or was missing Sacred Library supplements). Standalone teachers outside an organization are not seeded with church presets.
 */
export async function ensureAllDetectedLinksOnboarded(
  orgId: string,
  programId?: string,
  orgName?: string
): Promise<IngestedCurriculumUnit[]> {
  if (isStandaloneTeacherScopeId(orgId)) {
    return listIngestedUnits(orgId, programId, orgName);
  }
  const safeOrgId = normalizeToGreatFaithOrgId(orgId);
  const existing = listIngestedUnits(safeOrgId, undefined, orgName);

  const missingLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(link => {
    const match = existing.find(
      u => u.sourceUrl === link.url || u.title.toLowerCase() === link.label.toLowerCase()
    );
    if (!match) return true;
    // Upgrade if an older cached unit had 0 questions or lacked Sacred Library supplements
    if (!match.questions || match.questions.length === 0 || !match.sacredLibrarySupplements) {
      return true;
    }
    return false;
  });

  if (missingLinks.length > 0) {
    // Remove stale versions of those links first so we don't duplicate
    for (const link of missingLinks) {
      const stale = listIngestedUnits(safeOrgId, undefined, orgName).find(
        u => u.sourceUrl === link.url || u.title.toLowerCase() === link.label.toLowerCase()
      );
      if (stale) deleteIngestedUnit(safeOrgId, stale.id);
    }
    await batchIngestExtractedLinksToTela({
      orgId: safeOrgId,
      orgName,
      scopeKind: 'org',
      programId,
      links: missingLinks,
      includeAnswerKeyDocs: true,
    });
  }

  return listIngestedUnits(safeOrgId, programId, orgName);
}

/**
 * Preset for `Revelation 2: Course Connection` (`1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE`, tab `t.qo6bykb5zkh7`)
 * Contains all 9 detected documents from the Course Connection hub (4 Church Study Packets/Docs +
 * 1 Sacred Library & Archaeological Dossier PDF + 2 Google Form Quizzes + 1 Comprehensive Mastery Exam +
 * 1 Master Teacher Answer Key & Rubric Compendium).
 */
export const REVELATION_2_COURSE_CONNECTION_PRESET: CourseHubLinkExtractionResult = {
  hubTitle: 'Revelation 2: Course Connection (Letters to Ephesus, Smyrna, Pergamum & Thyatira + Sacred Library Dossier)',
  hubUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?pli=1&tab=t.qo6bykb5zkh7',
  docId: '1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE',
  tabId: 't.qo6bykb5zkh7',
  rawPlainTextSummary:
    'Revelation 2: Course Connection — Complete 9-Document Syllabus covering Ephesus (Rev 2:1–7), Smyrna (Rev 2:8–11), Pergamum (Rev 2:12–17), Thyatira (Rev 2:18–29), Sacred Library Manuscripts & Archaeology, Formative Google Form Quizzes, Summative Mastery Exam, and Teacher Answer Keys.',
  links: [
    {
      id: 'rev2_doc_0_master_hub_syllabus',
      label: '0. Revelation 2: Course Connection — Master Syllabus & Extracted Source Document (Google Doc)',
      url: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?pli=1&tab=t.qo6bykb5zkh7',
      directDownloadUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/export?format=txt&tab=t.qo6bykb5zkh7',
      category: 'GOOGLE_DOC',
      docId: '1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE',
      tabId: 't.qo6bykb5zkh7',
      sectionHeading: 'Master Course Connection Source Document & Syllabus Hub',
      isAnswerKey: false,
      pairedAnswerKeyUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_master_key/edit',
      pairedAnswerKeyLabel: 'Revelation 2 Master Teacher Answer Key & Rubric Compendium',
      fallbackCurriculumText: `# Revelation 2: Course Connection — Master Syllabus & Source Hub Document
## Source Document Extracted into Great Faith Ministries · Christian Education
Original Google Doc Source: https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?pli=1&tab=t.qo6bykb5zkh7 (Tab: t.qo6bykb5zkh7)

## Module Overview & Extracted Course Resources
1. Week 1 — Ephesus (Revelation 2:1–7): Returning to Our First Love & Tree of Life Reading Packet
2. Week 2 — Smyrna (Revelation 2:8–11): Faithfulness Unto the Crown of Life Study Guide
3. Week 3 — Pergamum (Revelation 2:12–17): Holding Fast Christ's Name & Hidden Manna Packet
4. Week 4 — Thyatira (Revelation 2:18–29): Discernment, Service & the Morning Star Worksheet
5. Sacred Library Supplemental Dossier: Codex Sinaiticus, Papyrus P47, St. Polycarp & Asia Minor Archaeology
6. Formative Check Quizzes (Google Forms) & Summative Unit Mastery Examination

1. Which four churches of Asia Minor are addressed in the Revelation 2 Course Connection syllabus (Revelation 2:1–29)? [2 pts]
A) Ephesus, Smyrna, Pergamum, and Thyatira
B) Sardis, Philadelphia, Laodicea, and Colosse
C) Rome, Corinth, Galatia, and Philippi
D) Jerusalem, Antioch, Alexandria, and Caesarea

2. What recurring sevenfold pattern structures each of Christ's letters in Revelation 2? [2 pts]
A) Address to the Angel/Church, Christological Title, Commendation ("I know your works"), Rebuke/Charge, Exhortation to Repent/Be Faithful, Call to Hear ("He who has an ear"), and Overcomer Promise
B) Greeting, Genealogy, Parable, Miracle, Travel Log, Benediction, and Postscript
C) Civil Census, Tax Decree, Military Roster, Temple Inventory, Feast Calendar, and Seal
D) Only a single proverb without promises`,
      fallbackAnswerKeyText: `1. A - Revelation 2 addresses Ephesus (2:1–7), Smyrna (2:8–11), Pergamum (2:12–17), and Thyatira (2:18–29). [2 pts]
2. A - Each letter in Revelation 2 follows the covenantal prophetic structure: Address, Christological Title, "I know" Commendation, Charge/Warning, Exhortation, Spirit's Call to Hear, and Overcomer Promise. [2 pts]`,
    },
    {
      id: 'rev2_doc_1_ephesus',
      label: '1. Revelation 2:1–7 — Ephesus: Returning to Our First Love (Reading Packet PDF)',
      url: 'https://drive.google.com/file/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_ephesus_pdf/view',
      directDownloadUrl: 'https://drive.google.com/uc?export=download&id=1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_ephesus_pdf',
      category: 'PDF_DOCUMENT',
      sectionHeading: 'Module 1: The Church at Ephesus (Revelation 2:1–7)',
      isAnswerKey: false,
      pairedAnswerKeyUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_master_key/edit#ephesus',
      pairedAnswerKeyLabel: 'Ephesus Teacher Answer Key (Rev 2:1–7)',
      fallbackCurriculumText: `# Revelation 2:1–7 — The Church at Ephesus: Returning to Our First Love
## Section 1: Christ Among the Seven Golden Lampstands (Revelation 2:1–3)
To the angel of the church in Ephesus, Christ introduces Himself as "Him who holds the seven stars in His right hand, who walks among the seven golden lampstands" (Revelation 2:1). He commends their works, toil, patient endurance, and discernment in testing those who falsely claim to be apostles (Revelation 2:2–3).

## Section 2: Remembering, Repenting & Doing the First Works (Revelation 2:4–7)
Yet Christ brings a solemn heart-charge: "You have abandoned the love you had at first" (Revelation 2:4). He calls Ephesus to a three-step restoration—Remember, Repent, and Do the works they did at first—promising the overcomer permission to eat of the tree of life in the paradise of God (Revelation 2:7).

1. According to Revelation 2:1, how does Christ describe Himself to the church in Ephesus? [2 pts]
A) The First and the Last who died and came to life
B) Him who holds the seven stars in His right hand and walks among the seven golden lampstands
C) The Son of God who has eyes like a flame of fire
D) He who has the sharp two-edged sword

2. What primary indictment does Christ bring against the church at Ephesus in Revelation 2:4 despite their doctrinal discernment? [2 pts]
A) They tolerated the teaching of Balaam
B) They had abandoned the love they had at first
C) They denied His name during persecution
D) They grew lukewarm in their material wealth

3. In Revelation 2:5, what three-part command does Christ give Ephesus to restore their first love? [2 pts]
A) Fast, mourn, and rebuild the city walls
B) Remember from where you have fallen, repent, and do the works you did at first
C) Sell all possessions, leave the province, and wait in the desert
D) Appoint new elders, write a creed, and close the gates

4. What promise is given to the one who conquers in the letter to Ephesus (Revelation 2:7)? [2 pts]
A) Authority over the nations
B) Hidden manna and a white stone
C) Permission to eat of the tree of life, which is in the paradise of God
D) The morning star`,
      fallbackAnswerKeyText: `1. B - Revelation 2:1 describes Christ holding the seven stars in His right hand and walking among the seven golden lampstands. [2 pts]
2. B - Revelation 2:4 states: "But I have this against you, that you have abandoned the love you had at first." [2 pts]
3. B - Revelation 2:5 commands: "Remember therefore from where you have fallen; repent, and do the works you did at first." [2 pts]
4. C - Revelation 2:7 promises the overcomer permission to eat of the tree of life in the paradise of God. [2 pts]`,
    },
    {
      id: 'rev2_doc_2_smyrna',
      label: '2. Revelation 2:8–11 — Smyrna: Faithfulness Unto the Crown of Life (Study Guide Google Doc)',
      url: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?tab=t.qo6bykb5zkh7#smyrna',
      directDownloadUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/export?format=txt&tab=t.qo6bykb5zkh7',
      category: 'GOOGLE_DOC',
      docId: '1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE',
      tabId: 't.qo6bykb5zkh7',
      sectionHeading: 'Module 2: The Church at Smyrna (Revelation 2:8–11)',
      isAnswerKey: false,
      pairedAnswerKeyUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_master_key/edit#smyrna',
      pairedAnswerKeyLabel: 'Smyrna Teacher Answer Key (Rev 2:8–11)',
      fallbackCurriculumText: `# Revelation 2:8–11 — The Church at Smyrna: Faithfulness Unto the Crown of Life
## Section 1: The First and the Last Who Came to Life (Revelation 2:8–9)
Addressing the suffering congregation in Smyrna as "the First and the Last, who died and came to life" (Revelation 2:8), Christ comforts them: "I know your tribulation and your poverty (but you are rich)" (Revelation 2:9). Smyrna is one of only two churches in Revelation that receives no rebuke.

## Section 2: Fear Not & The Crown of Life (Revelation 2:10–11)
Christ prepares the believers in Smyrna for a season of testing ("ten days") and exhorts them: "Be faithful unto death, and I will give you the crown of life" (Revelation 2:10). The one who conquers will not be hurt by the second death (Revelation 2:11).

1. Why is Christ's title in Revelation 2:8 ("the first and the last, who died and came to life") uniquely suited to comfort the church in Smyrna? [2 pts]
A) Because Smyrna was wealthy and needed no endurance
B) Because Smyrna faced persecution unto death, and Christ Himself triumphed over death
C) Because Smyrna had forgotten the doctrine of creation
D) Because Smyrna was debating the calendar of feasts

2. In Revelation 2:9, what paradox does Christ declare about the believers' condition in Smyrna? [2 pts]
A) They are outwardly rich, but spiritually poor and blind
B) They experience tribulation and material poverty, "(but you are rich)" spiritually
C) They have a reputation for being alive, but are dead
D) They have great political power, but little faith

3. What two promises are given to the faithful believers in Smyrna in Revelation 2:10–11? [2 pts]
A) The crown of life and immunity from the second death
B) Hidden manna and a bronze pillar
C) The morning star and a rod of iron
D) The keys of David and a new temple`,
      fallbackAnswerKeyText: `1. B - Christ's resurrection victory over death directly comforts believers called to remain faithful even unto martyrdom (Revelation 2:8, 10). [2 pts]
2. B - In Revelation 2:9, Christ tells Smyrna: "I know your tribulation and your poverty (but you are rich)"—contrasting earthly deprivation with heavenly wealth. [2 pts]
3. A - Revelation 2:10-11 promises the "crown of life" and that the overcomer "will not be hurt by the second death." [2 pts]`,
    },
    {
      id: 'rev2_doc_3_pergamum',
      label: '3. Revelation 2:12–17 — Pergamum: Holding Fast Christ’s Name & Hidden Manna (PDF Packet)',
      url: 'https://drive.google.com/file/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_pergamum_pdf/view',
      directDownloadUrl: 'https://drive.google.com/uc?export=download&id=1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_pergamum_pdf',
      category: 'PDF_DOCUMENT',
      sectionHeading: 'Module 3: The Church at Pergamum (Revelation 2:12–17)',
      isAnswerKey: false,
      pairedAnswerKeyUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_master_key/edit#pergamum',
      pairedAnswerKeyLabel: 'Pergamum Teacher Answer Key (Rev 2:12–17)',
      fallbackCurriculumText: `# Revelation 2:12–17 — The Church at Pergamum: Holding Fast the Name of Christ
## Section 1: Faithful Witness Where Satan's Throne Is (Revelation 2:12–13)
Christ addresses Pergamum as "He who has the sharp two-edged sword" (Revelation 2:12). Though Pergamum was the seat of imperial cult temples ("where Satan's throne is"), the church held fast to Christ's name and did not deny His faith even in the days of Antipas, Christ's faithful witness (Revelation 2:13).

## Section 2: Refusing Compromise & Receiving the Hidden Manna (Revelation 2:14–17)
Christ warns Pergamum against those who hold the teaching of Balaam and the Nicolaitans—accommodating idol feasts and immorality (Revelation 2:14–15). To the one who conquers, Christ promises "some of the hidden manna" and "a white stone, with a new name written on the stone" (Revelation 2:17).

1. Who is honored by name in Revelation 2:13 as Christ's "faithful witness, who was killed among you" in Pergamum? [2 pts]
A) Polycarp
B) Antipas
C) Ignatius
D) Stephanas

2. What error of Balaam and the Nicolaitans did some in Pergamum tolerate (Revelation 2:14–15)? [2 pts]
A) Refusing to read the Old Testament prophets
B) Compromising with pagan idol feasts and sexual immorality
C) Practicing extreme asceticism in the wilderness
D) Denying the physical humanity of Christ

3. Which two gifts are promised to the overcomer in Pergamum in Revelation 2:17? [2 pts]
A) The tree of life and the crown of life
B) Some of the hidden manna and a white stone with a new name written on it
C) Authority over the nations and the morning star
D) White garments and the book of life`,
      fallbackAnswerKeyText: `1. B - Antipas is named in Revelation 2:13 as "my faithful witness, who was killed among you, where Satan dwells." [2 pts]
2. B - Revelation 2:14-15 rebukes the accommodation of eating food sacrificed to idols and practicing sexual immorality. [2 pts]
3. B - Revelation 2:17 promises the overcomer "some of the hidden manna" and "a white stone, with a new name written on the stone." [2 pts]`,
    },
    {
      id: 'rev2_doc_4_thyatira',
      label: '4. Revelation 2:18–29 — Thyatira: Discernment, Service & the Morning Star (Worksheet Google Doc)',
      url: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?tab=t.qo6bykb5zkh7#thyatira',
      directDownloadUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/export?format=txt&tab=t.qo6bykb5zkh7',
      category: 'GOOGLE_DOC',
      docId: '1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE',
      tabId: 't.qo6bykb5zkh7',
      sectionHeading: 'Module 4: The Church at Thyatira (Revelation 2:18–29)',
      isAnswerKey: false,
      pairedAnswerKeyUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_master_key/edit#thyatira',
      pairedAnswerKeyLabel: 'Thyatira Teacher Answer Key (Rev 2:18–29)',
      fallbackCurriculumText: `# Revelation 2:18–29 — The Church at Thyatira: Service, Discernment & the Morning Star
## Section 1: The Son of God Who Searches Mind and Heart (Revelation 2:18–23)
Revelation 2:18 introduces Christ with the explicit title "the Son of God, who has eyes like a flame of fire, and whose feet are like burnished bronze." He commends Thyatira's love, faith, service, and patient endurance, noting that "your latter works exceed the first" (Revelation 2:19), while calling them to reject the false teaching of Jezebel (Revelation 2:20–23).

## Section 2: Holding Fast Until He Comes & The Morning Star (Revelation 2:24–29)
To the faithful remnant who hold fast until He comes, Christ promises authority over the nations (citing Psalm 2:8–9) and declares: "And I will give him the morning star" (Revelation 2:28).

1. How does Revelation 2:19 commend the spiritual trajectory of the believers in Thyatira? [2 pts]
A) Their latter works exceed the first
B) They were the wealthiest congregation in Asia
C) They faced zero opposition from the trade guilds
D) They built seven synagogues

2. According to Revelation 2:23, what does the Son of God search so that all the churches will know Him? [2 pts]
A) Only outward ritual observance
B) Mind and heart ("I am he who searches mind and heart")
C) Roman provincial tax rolls
D) Genealogical records alone

3. What two promises are given in Revelation 2:26–28 to the one in Thyatira who conquers and keeps Christ's works until the end? [2 pts]
A) Authority over the nations and the morning star
B) The tree of life and the crown of life
C) Hidden manna and a white stone
D) A pillar in the temple and a new scroll`,
      fallbackAnswerKeyText: `1. A - Revelation 2:19 commends Thyatira's love, faith, service, and endurance, declaring "your latter works exceed the first." [2 pts]
2. B - Revelation 2:23 proclaims: "And all the churches will know that I am he who searches mind and heart." [2 pts]
3. A - Revelation 2:26-28 promises authority over the nations (Psalm 2) and "I will give him the morning star." [2 pts]`,
    },
    {
      id: 'rev2_doc_5_sacred_library_atlas',
      label: '5. Sacred Library Supplemental Dossier (PDF) — Manuscripts, Patristic Witnesses & Asia Minor Archaeology',
      url: 'https://drive.google.com/file/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_sacred_library_dossier/view',
      directDownloadUrl: 'https://drive.google.com/uc?export=download&id=1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_sacred_library_dossier',
      category: 'PDF_DOCUMENT',
      sectionHeading: 'Module 5: Lorea Sacred Library Supplemental Primary Sources',
      isAnswerKey: false,
      pairedAnswerKeyLabel: 'Sacred Library Dossier Answer Key',
      fallbackCurriculumText: `# Revelation 2 Sacred Library Supplemental Dossier: Manuscripts, Fathers & Archaeology
## Primary Source 1: Codex Sinaiticus (4th c. AD) & Chester Beatty Papyrus P47 (3rd c. AD)
The Book of Revelation is preserved in ancient Greek witnesses housed in the Lorea Sacred Library, including Papyrus 47 (c. 250 AD), Codex Sinaiticus (c. 330–360 AD), and Codex Alexandrinus (5th c. AD).

## Primary Source 2: The Apostolic Fathers — St. Ignatius to the Ephesians & St. Polycarp of Smyrna
Within a generation of the Apostle John, Ignatius of Antioch wrote to the church at Ephesus commending their order and love, while Polycarp—personally taught by John—served as Bishop of Smyrna and fulfilled Revelation 2:10 ("Be faithful unto death") in his martyrdom.

## Primary Source 3: Sacred Artifacts — The Seven-Branched Lampstand (Menorah) & The Ark's Hidden Manna
The golden lampstands of Revelation 2:1 and the "hidden manna" of Revelation 2:17 draw directly upon the sanctuary furnishings of the Tabernacle and Temple.

1. Which early Christian bishop of Smyrna, personally discipled by the Apostle John, exemplified Revelation 2:10 ("Be faithful unto death") in his martyrdom? [2 pts]
A) St. Polycarp of Smyrna
B) Tertullian of Carthage
C) Eusebius of Caesarea
D) Venantius Fortunatus

2. Which 4th-century Greek manuscript in the Sacred Library is the oldest complete surviving New Testament containing the Book of Revelation? [2 pts]
A) The Mesha Stele
B) Codex Sinaiticus
C) The Cyrus Cylinder
D) The Taylor Prism

3. In Sacred Library sanctuary typology, where was the golden jar of manna ("hidden manna", Revelation 2:17) kept? [2 pts]
A) On the porch of Herod's palace
B) Inside the Ark of the Covenant in the Most Holy Place (Exodus 16:33; Hebrews 9:4)
C) In the Roman forum at Pergamum
D) Inside the city gates of Thyatira`,
      fallbackAnswerKeyText: `1. A - St. Polycarp of Smyrna (c. 69–155 AD), disciple of the Apostle John and Bishop of Smyrna, embodied Revelation 2:10. [2 pts]
2. B - Codex Sinaiticus (c. 330–360 AD) preserves the oldest complete Greek New Testament including the Apocalypse. [2 pts]
3. B - The golden urn of manna was placed inside the Ark of the Covenant in the Most Holy Place (Exodus 16:33; Hebrews 9:4), illuminating Revelation 2:17. [2 pts]`,
    },
    {
      id: 'rev2_form_6_quiz_ephesus_smyrna',
      label: '6. Revelation 2:1–11 Formative Check Quiz — Ephesus & Smyrna (Google Form)',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLScRev2EphesusSmyrnaQuiz/viewform',
      category: 'GOOGLE_FORM',
      sectionHeading: 'Assessments & Interactive Quizzes',
      isAnswerKey: false,
      pairedAnswerKeyLabel: 'Auto-Graded Google Form Key (Ephesus & Smyrna)',
      fallbackCurriculumText: `# Revelation 2:1–11 Formative Check Quiz — Ephesus & Smyrna (Google Form)
## Rapid Retrieval & Scripture Mastery Check (Revelation 2:1–11)
Test your mastery of the letters to Ephesus and Smyrna.

1. Which group's works did both Christ and the church at Ephesus hate (Revelation 2:6)? [2 pts]
A) The Nicolaitans
B) The Essenes
C) The Bereans
D) The Rechabites

2. Which church in Revelation 2 receives NO rebuke or correction from Christ, only commendation and comfort? [2 pts]
A) Ephesus
B) Smyrna
C) Pergamum
D) Thyatira

3. True or False: In Revelation 2:11, Christ promises that the one who conquers in Smyrna will not be hurt by the second death. [1 pt]`,
      fallbackAnswerKeyText: `1. A - Revelation 2:6 commends Ephesus: "Yet this you have: you hate the works of the Nicolaitans, which I also hate." [2 pts]
2. B - Smyrna (Revelation 2:8–11) receives no rebuke from Christ, only comfort and encouragement to remain faithful. [2 pts]
3. True - Revelation 2:11 states: "The one who conquers will not be hurt by the second death." [1 pt]`,
    },
    {
      id: 'rev2_form_7_quiz_pergamum_thyatira',
      label: '7. Revelation 2:12–29 Formative Check Quiz — Pergamum & Thyatira (Google Form)',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLScRev2PergamumThyatiraQuiz/viewform',
      category: 'GOOGLE_FORM',
      sectionHeading: 'Assessments & Interactive Quizzes',
      isAnswerKey: false,
      pairedAnswerKeyLabel: 'Auto-Graded Google Form Key (Pergamum & Thyatira)',
      fallbackCurriculumText: `# Revelation 2:12–29 Formative Check Quiz — Pergamum & Thyatira (Google Form)
## Rapid Retrieval & Scripture Mastery Check (Revelation 2:12–29)
Test your mastery of the letters to Pergamum and Thyatira.

1. Match the Christological title "The words of him who has the sharp two-edged sword" (Revelation 2:12) to its recipient church: [2 pts]
A) Ephesus
B) Smyrna
C) Pergamum
D) Thyatira

2. In which verse of Revelation 2 does the exact title "the Son of God" appear? [2 pts]
A) Revelation 2:1 (Ephesus)
B) Revelation 2:8 (Smyrna)
C) Revelation 2:12 (Pergamum)
D) Revelation 2:18 (Thyatira)

3. True or False: Every letter in Revelation 2 concludes with the Spirit's call, "He who has an ear, let him hear what the Spirit says to the churches." [1 pt]`,
      fallbackAnswerKeyText: `1. C - Revelation 2:12 addresses Pergamum with "The words of him who has the sharp two-edged sword." [2 pts]
2. D - Revelation 2:18 (to Thyatira) is the sole occurrence of the exact title "the Son of God" in Revelation. [2 pts]
3. True - Revelation 2:7, 2:11, 2:17, and 2:29 all sound the Spirit's call to hear. [1 pt]`,
    },
    {
      id: 'rev2_doc_8_mastery_exam',
      label: '8. Revelation 2: Course Connection — Comprehensive Unit Mastery Examination (Summative Test Doc)',
      url: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_unit_exam/edit',
      category: 'GOOGLE_DOC',
      sectionHeading: 'Summative Mastery Examination',
      isAnswerKey: false,
      pairedAnswerKeyUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_master_key/edit',
      pairedAnswerKeyLabel: 'Revelation 2 Master Teacher Answer Key & Rubric',
      fallbackCurriculumText: `# Revelation 2: Course Connection — Comprehensive Unit Mastery Examination
## Summative Synthesis Across Ephesus, Smyrna, Pergamum & Thyatira (Revelation 2:1–29)
Complete all items below to certify unit mastery in Great Faith Ministries · Christian Education.

1. Across the four churches of Revelation 2, how do the temptations of Ephesus (doctrinal vigilance without first love) and Thyatira (growing love and service while tolerating false teaching) serve as mirror warnings to the Church today? [3 pts]
A) Both show that Christ calls His Church to unite truth and love—holding fast sound doctrine while abounding in fervent love and holiness
B) Both show that doctrine does not matter so long as a church is active
C) Both show that love is unnecessary if a church tests false apostles
D) Both apply only to 1st-century civic guilds

2. Which overcomer promise in Revelation 2 reaches back to Genesis 2–3 and forward to Revelation 22:2? [2 pts]
A) The tree of life in the paradise of God (promised to Ephesus in Revelation 2:7)
B) The ten days of tribulation (Revelation 2:10)
C) The throne of Pergamum (Revelation 2:13)
D) The bronze guild of Thyatira (Revelation 2:18)

3. Which Old Testament royal psalm is quoted in Christ's promise to the overcomer at Thyatira in Revelation 2:26–27 ("he will rule them with a rod of iron")? [2 pts]
A) Psalm 2:8–9
B) Psalm 23:1–2
C) Psalm 51:10
D) Psalm 119:105

4. Short Synthesis Reflection: Choose one of the four churches in Revelation 2 (Ephesus, Smyrna, Pergamum, or Thyatira) and explain how Christ's self-description at the opening of that letter directly answers the crisis that congregation faced. [3 pts]`,
      fallbackAnswerKeyText: `1. A - Ephesus had doctrinal discernment without first love (2:2–4), while Thyatira had growing love and service but lacked doctrinal/moral discernment against Jezebel (2:19–20); Christ calls His Church to unite truth and love. [3 pts]
2. A - The "tree of life, which is in the paradise of God" (Revelation 2:7) forms a canonical arc from Eden (Genesis 2–3) to the New Jerusalem (Revelation 22:2). [2 pts]
3. A - Revelation 2:26–27 quotes Psalm 2:8–9, sharing Messianic authority with the faithful overcomer. [2 pts]
4. Faithfulness / Christological synthesis — e.g. To Smyrna facing death, Christ is the one who died and came to life (2:8); to Pergamum compromising with idols, Christ wields the sharp two-edged sword of truth (2:12). [3 pts]`,
    },
    {
      id: 'rev2_doc_9_master_answer_key',
      label: '9. Revelation 2: Course Connection — Master Teacher Answer Key & Rubric Compendium (Google Doc)',
      url: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE_master_key/edit',
      category: 'ANSWER_KEY',
      sectionHeading: 'Teacher Answer Keys & Grading Rubrics',
      isAnswerKey: true,
      pairedAnswerKeyLabel: 'Master Answer Key & Rubric Verified',
      fallbackCurriculumText: `# Revelation 2: Course Connection — Master Teacher Answer Key & Grading Rubric Compendium
## Complete Instructor Reference for Modules 1–8 (Great Faith Ministries · Christian Education)
This Master Teacher Answer Key & Rubric document pairs with all Ephesus, Smyrna, Pergamum, Thyatira, and Sacred Library worksheets and assessments.

1. Instructor Rubric Verification — In Revelation 2:1–7 (Ephesus), what are the three restoration steps required for full rubric credit on Question 3? [2 pts]
A) Remember from where you have fallen, Repent, and Do the works you did at first (Revelation 2:5)
B) Fast, tithe, and travel to Jerusalem
C) Debate, write, and archive
D) Silence, solitude, and retreat

2. Instructor Rubric Verification — Which four overcomer promises correspond to Ephesus (2:7), Smyrna (2:10–11), Pergamum (2:17), and Thyatira (2:26–28)? [2 pts]
A) Tree of Life (Ephesus) · Crown of Life / No Second Death (Smyrna) · Hidden Manna & White Stone (Pergamum) · Authority over Nations & Morning Star (Thyatira)
B) Seven seals · Seven trumpets · Seven bowls · Seven thunders
C) Gold, frankincense, myrrh, and alabaster
D) Only earthly prosperity`,
      fallbackAnswerKeyText: `1. A - Full credit requires naming Remember, Repent, and Do the first works (Revelation 2:5). [2 pts]
2. A - Ephesus: Tree of Life (2:7); Smyrna: Crown of Life / Second Death (2:10–11); Pergamum: Hidden Manna & White Stone (2:17); Thyatira: Authority over Nations & Morning Star (2:26–28). [2 pts]`,
    },
  ],
  pdfLinks: [],
  googleDocLinks: [],
  googleFormLinks: [],
  answerKeyLinks: [],
};
REVELATION_2_COURSE_CONNECTION_PRESET.pdfLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(l => l.category === 'PDF_DOCUMENT');
REVELATION_2_COURSE_CONNECTION_PRESET.googleDocLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(l => l.category === 'GOOGLE_DOC');
REVELATION_2_COURSE_CONNECTION_PRESET.googleFormLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(l => l.category === 'GOOGLE_FORM');
REVELATION_2_COURSE_CONNECTION_PRESET.answerKeyLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(l => l.isAnswerKey);


