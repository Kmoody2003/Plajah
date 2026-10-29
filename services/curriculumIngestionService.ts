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
import { saveTelaDoc, loadTelaDoc } from './telaStore';
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
import { pushLibraryUnit, removeLibraryUnit, libraryActorIsAdmin, libraryActorUid } from './lessonLibraryStore';

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
  /** The question's printed number. Parts (7a, 7b …) share their question's number. */
  number: number;
  /** As printed when it isn't just the number: '7a', '9c'. */
  label?: string;
  /** For a part: its question's own text ("Fill in the Blanks:"), shown once above the parts. */
  group?: string;
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

/** Questions as the paper numbers them: 7a–7f count as question 7. */
export function countQuestions(qs: Array<Pick<IngestedQuestion, 'number'>>): number {
  return new Set(qs.map(q => q.number)).size;
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
  /** Header lines the student fills in (Name, Date, Counselor …). Not questions: never graded or counted. */
  detailFields?: string[];
  /** Bumped when the importer's reading of a source changes, so older imports are read again. */
  importVersion?: number;
  /** Who put it in the library (services/lessonLibraryStore): 'admin' lessons are locked for teachers. */
  provisioned?: 'admin' | 'teacher';
  ownerUid?: string;
  /** Set on a teacher's copy of another lesson. */
  copiedFromId?: string;
  /** Set on lessons read from the shared library ('platform' = shared with everyone). */
  tier?: 'org' | 'user' | 'platform';
  remoteUpdatedAt?: number;
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
  // Every org keeps its own library. A demo org or a missing id never shares Great Faith's storage
  // (it used to, which put Great Faith's real course in the Grace Chapel demo).
  return orgId || 'unscoped';
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

    const ownList = readRawStoredUnitsForKey(STORAGE_UNITS_KEY(safeOrgId));
    // Older builds copied every org's lessons into Great Faith's library; those copies also sit in their
    // own org's storage on this device, so leave them out of Great Faith's.
    const primaryList = safeOrgId === GREAT_FAITH_MINISTRIES_DEFAULT_ID ? withoutOtherOrgsCopies(ownList) : ownList;
    const secondaryList = isStandaloneTeacher
      ? safeOrgId !== 'teacher-personal-hq'
        ? readRawStoredUnitsForKey(STORAGE_UNITS_KEY('teacher-personal-hq'))
        : []
      : []; // A real org's library holds only its own lessons; the sample course lives on the demo org.

    // The Revelation 2 sample course is demo content. Older builds seeded it into every org's library;
    // a real org shows only what its own people added.
    const demoOrg = !isStandaloneTeacher && isRevelationCourseOrg(safeOrgId);
    const byKey = new Map<string, IngestedCurriculumUnit>();
    for (const u of [...primaryList, ...secondaryList]) {
      if (!u || !u.title) continue;
      if (isFabricatedSampleUnit(u)) continue;
      if (!demoOrg && isSampleCourseUnit(u)) continue;
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
          // Only the demo org's items came from the sample course hub; real items keep their own source.
          extractedFromHubTitle:
            u.extractedFromHubTitle ||
            (demoOrg ? 'Revelation 2: Course Connection (Master Google Doc)' : undefined),
          extractedFromHubUrl:
            u.extractedFromHubUrl ||
            (demoOrg ? REVELATION_2_COURSE_CONNECTION_PRESET.hubUrl : undefined),
        });
      }
    }

    // The Revelation 2 course is imported for real by ensureAllDetectedLinksOnboarded (each link downloaded
    // and read); nothing is seeded here from built-in text.

    const list = Array.from(byKey.values());
    const filtered = programId ? list.filter(u => !u.programId || u.programId === programId) : list;
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function withoutOtherOrgsCopies(list: IngestedCurriculumUnit[]): IngestedCurriculumUnit[] {
  const elsewhere = new Set<string>();
  try {
    const gfKey = STORAGE_UNITS_KEY(GREAT_FAITH_MINISTRIES_DEFAULT_ID);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key === gfKey || !key.startsWith('plajah_ingested_curriculum_units_v1_')) continue;
      for (const u of readRawStoredUnitsForKey(key)) if (u?.id) elsewhere.add(u.id);
    }
  } catch {
    return list;
  }
  return list.filter(u => !elsewhere.has(u.id));
}

/**
 * The orgs the Revelation 2 course belongs to, by exact org id. It is Great Faith Ministries' own
 * curriculum and no other org gets it, whatever it's called:
 *   • ssmj9GnjxGnE7lJoPmWH — "Great Faith Ministries International" (@greatfaithministries), the live org;
 *   • 'great-faith-ministries' — the same org's pre-Firestore local scope (services/orgAssets).
 * (A second, near-empty "Great Faith Ministries Int'L" org, n7FDgEg1m3JDAsYuY19o, is deliberately not listed.)
 */
export const REVELATION_2_COURSE_ORG_IDS: ReadonlySet<string> = new Set(['ssmj9GnjxGnE7lJoPmWH', GREAT_FAITH_MINISTRIES_DEFAULT_ID]);
function isRevelationCourseOrg(safeOrgId: string): boolean {
  return REVELATION_2_COURSE_ORG_IDS.has(safeOrgId);
}

/**
 * Items older builds made up for the Revelation 2 course: built-in text under invented links (the course
 * doc's id with suffixes like `_ephesus_pdf`, and form ids such as `…ScRev2EphesusSmyrnaQuiz`). Hidden
 * everywhere; the real course is re-imported from its actual links.
 */
function isFabricatedSampleUnit(u: IngestedCurriculumUnit): boolean {
  const src = u.sourceUrl || '';
  return src.includes('1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE') || /1FAIpQLScRev2/.test(src);
}

/** A unit imported from the Revelation 2 course links (Great Faith's own course). */
function isSampleCourseUnit(u: IngestedCurriculumUnit): boolean {
  const p = REVELATION_2_COURSE_CONNECTION_PRESET;
  // By its own source link only: older builds also stamped the hub onto real items' provenance.
  return !!u.sourceUrl && (u.sourceUrl === p.hubUrl || p.links.some(l => l.url === u.sourceUrl || l.pairedAnswerKeyUrl === u.sourceUrl));
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
    // The org's own course imports are the org's (admin) lessons, whoever's browser read them in.
    if (!normalizedUnit.provisioned) normalizedUnit.provisioned = isStandaloneTeacher ? 'teacher' : isSampleCourseUnit(unit) || libraryActorIsAdmin(safeOrgId) ? 'admin' : 'teacher';
    if (!normalizedUnit.ownerUid) normalizedUnit.ownerUid = libraryActorUid() || undefined;
    const existing = readRawStoredUnitsForKey(STORAGE_UNITS_KEY(safeOrgId)).filter(
      u => u.id !== unit.id && u.title.toLowerCase() !== unit.title.toLowerCase()
    );
    localStorage.setItem(STORAGE_UNITS_KEY(safeOrgId), JSON.stringify([normalizedUnit, ...existing]));
    // …and in the shared library, so the org's teachers (or the teacher's other devices) have it too.
    if (normalizedUnit.tier !== 'platform') {
      const uid = libraryActorUid();
      if (uid) void pushLibraryUnit(normalizedUnit, isStandaloneTeacher ? 'user' : 'org', isStandaloneTeacher ? uid : safeOrgId);
    }
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
    }
    // An org's lessons stay in that org's library only (older builds also copied every one into Great Faith's).
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plajah:lessonLibraryUpdated', { detail: { orgId: safeOrgId } }));
    }
  } catch {
    // ignore storage quota
  }
}

export function deleteIngestedUnit(orgId: string, unitId: string, opts: { shared?: boolean } = {}): void {
  try {
    const existing = readRawStoredUnitsForKey(STORAGE_UNITS_KEY(orgId)).filter(u => u.id !== unitId);
    localStorage.setItem(STORAGE_UNITS_KEY(orgId), JSON.stringify(existing));
    if (opts.shared) void removeLibraryUnit(unitId);
  } catch {
    // ignore
  }
}

/**
 * Brings lessons from the shared library into this device's copy of a scope's library. A shared lesson
 * replaces the local one with the same id; lessons only on this device stay (they upload on next save).
 */
export function mergeSharedUnits(orgId: string, shared: IngestedCurriculumUnit[]): void {
  if (!shared.length) return;
  try {
    const key = STORAGE_UNITS_KEY(orgId);
    const byId = new Map(readRawStoredUnitsForKey(key).map(u => [u.id, u] as const));
    for (const u of shared) {
      if (isSampleCourseUnit(u) && (u.importVersion || 1) < IMPORT_VERSION) continue; // read again by the importer
      const mine = byId.get(u.id);
      // Same lesson imported on two devices (different ids, same link): keep the shared one.
      if (!mine && u.sourceUrl) for (const [id, x] of byId) if (x.sourceUrl === u.sourceUrl && !x.remoteUpdatedAt) byId.delete(id);
      byId.set(u.id, { ...mine, ...u });
    }
    localStorage.setItem(key, JSON.stringify(Array.from(byId.values())));
  } catch {
    /* storage full: the shared copy is still read next time */
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

/**
 * Reads a Google Drive / Docs / Forms link through our own server (routes/curriculumFetch.ts) — browsers
 * can't read those hosts directly, and org documents must not be relayed through public CORS proxies.
 * Returns null when the server refuses or can't be reached; throws PRIVATE_LINK for files that
 * aren't shared by link.
 */
export async function fetchCurriculumLink(url: string): Promise<Response | null> {
  const { auth } = await import('./firebase');
  const user = auth.currentUser;
  try {
    // Signed out, the server answers 401 and the caller falls back (the dev lab's stand-in server answers).
    const resp = await fetch('/api/curriculum/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}) },
      body: JSON.stringify({ url }),
    });
    if (resp.status === 403) throw new Error('PRIVATE_LINK: That file is private. Share it as “Anyone with the link → Viewer”, then import again.');
    return resp.ok ? resp : null;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('PRIVATE_LINK')) throw e;
    return null;
  }
}

async function fetchTextWithCorsFallback(targetUrl: string): Promise<string> {
  const viaServer = await fetchCurriculumLink(targetUrl);
  if (viaServer) {
    const text = await viaServer.text();
    if (text && text.trim().length > 15 && !isGoogleLoginWallHtml(text)) return text;
  }
  // Signed out / offline: a direct read only works for hosts that allow it. No third-party relays.
  const attempts = [targetUrl];
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
/** A question read from a structured source (a Google Form), numbered as the source prints it. */
export interface StructuredQuestion {
  prompt: string;
  type: IngestedQuestion['type'];
  options?: string[];
  points?: number;
  correctAnswer?: string;
  explanation?: string;
  number?: number;
  label?: string;
  group?: string;
}

/** Version of the importer's reading of sources; units imported by an older one are read again. */
export const IMPORT_VERSION = 5;

/** Header fields on a test or worksheet — who and when, not questions. */
const DETAIL_FIELD = /^(?:student'?s?\s+)?(?:full\s+)?(name|first\s+name|last\s+name|counsel(?:l)?or|teacher|instructor|date|class|course|section|period|grade|email|e-mail|phone|id|student\s+id|church|campus|mentor|group|cohort|semester|term)\s*[:#.\-]?\s*_*\s*$/i;
export const isDetailField = (label: string) => DETAIL_FIELD.test(label.trim());

const NUMBERED = /^\s*(?:Q(?:uestion)?\s*#?\s*)?(\d{1,3})\s*[.):]\s*(.*)$/is;
const LETTERED = /^\s*\(?([a-z])\s*[.)]\s+(.*)$/is;

export async function extractGoogleForm(urlOrHtml: string): Promise<{
  title: string;
  description: string;
  rawText: string;
  /** Only the form's own reading text (description, section text), without its questions. */
  readingText: string;
  detailFields: string[];
  structuredQuestions: StructuredQuestion[];
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

      // The form is read the way it is printed: its own numbers ("1." … "9."), lettered parts ("a." …)
      // under the numbered question before them, a grid's rows as parts of its question, and the
      // who/when header (NAME, DATE, COUNSELOR) as detail fields rather than questions.
      const structuredQuestions: StructuredQuestion[] = [];
      const detailFields: string[] = [];
      const textLines: string[] = [`# ${formTitle}`];
      // The title is the page's heading already; the reading is only the form's own description and sections.
      const readingLines: string[] = [];
      if (formDesc) { textLines.push(formDesc, ''); readingLines.push(formDesc, ''); }
      // `stem`: a numbered heading whose parts follow as their own items ("5. Fill in the blanks" then
      // "1." … "10."); `sub`: the last part number seen under it, while its own list counts up.
      let current: { number: number; text: string; parts: number; stem?: boolean; sub?: number } | null = null;
      let unnumbered = 0;
      const letter = (n: number) => String.fromCharCode(97 + (n % 26));
      const typeFor = (code: number, options: string[]): IngestedQuestion['type'] =>
        code === 2 || code === 3 || code === 4 || code === 7 || options.length >= 2
          ? options.length === 2 && options.every(o => /^(true|false|yes|no)$/i.test(o.trim())) ? 'true-false' : 'multiple-choice'
          : code === 1 ? 'essay' : 'short-answer';
      const addPart = (prompt: string, type: IngestedQuestion['type'], options: string[], printed?: string) => {
        if (!current) return false;
        const l = printed || letter(current.parts);
        current.parts++;
        // Lettered parts print as 7a; a numbered list inside a question as 5.1, 5.2 …
        const label = /^\d+$/.test(l) ? `${current.number}.${l}` : `${current.number}${l}`;
        structuredQuestions.push({ prompt, type, options: options.length ? options : undefined, points: 1, number: current.number, label, group: current.text || undefined });
        textLines.push(`   ${l}. ${prompt}`);
        options.forEach((o, k) => textLines.push(`      ${String.fromCharCode(65 + k)}) ${o}`));
        return true;
      };

      for (const item of items) {
        const itemTitle = String(item?.[1] || '').trim();
        const itemDesc = String(item?.[2] || '').trim();
        const itemType = Number(item?.[3]);
        const rows: any[] = Array.isArray(item?.[4]) ? item[4] : [];
        const questionData = rows[0];

        // Section header / text block / image / video (8, 6, 11, 12): reading text, unless it is a numbered
        // question's stem ("7. Fill in the Blanks:"), whose parts follow as their own items.
        if (!questionData || itemType === 8 || itemType === 6 || itemType === 11 || itemType === 12) {
          const n = itemTitle.match(NUMBERED);
          if (n) {
            // The stem's own text (e.g. the A–I definitions a matching question uses) stays with it.
            current = { number: Number(n[1]), text: itemDesc ? `${n[2].trim()}\n\n${itemDesc}` : n[2].trim(), parts: 0, stem: true };
            textLines.push(`${n[1]}. ${n[2].trim()}`);
            if (itemDesc) textLines.push(itemDesc);
          } else {
            if (itemTitle) { textLines.push(`## ${itemTitle}`); readingLines.push(`## ${itemTitle}`); }
            if (itemDesc) { textLines.push(itemDesc, ''); readingLines.push(itemDesc, ''); }
          }
          continue;
        }

        // Date / time pickers and who-is-this fields are the header, not questions.
        if (itemType === 9 || itemType === 10 || isDetailField(itemTitle)) {
          detailFields.push(itemTitle.replace(/[:\s_]+$/, ''));
          textLines.push(`${itemTitle} ____`);
          continue;
        }

        const options = (Array.isArray(questionData?.[1]) ? questionData[1] : []).map((c: any) => String(c?.[0] || '').trim()).filter(Boolean);
        const qType = typeFor(itemType, options);
        const promptOf = (t: string) => (itemDesc ? `${t} (${itemDesc})` : t);
        const numbered = itemTitle.match(NUMBERED);
        const lettered = itemTitle.match(LETTERED);

        const gridRows = () => {
          for (const row of rows) {
            const rowText = String(row?.[3]?.[0] || '').trim();
            const rowOpts = (Array.isArray(row?.[1]) ? row[1] : []).map((c: any) => String(c?.[0] || '').trim()).filter(Boolean);
            // A row keeps its own printed mark: "a. …" → 7a, "1) …" → 1.1; unmarked rows are lettered.
            const lm = rowText.match(LETTERED);
            const nm = lm ? null : rowText.match(NUMBERED);
            addPart(lm ? lm[2].trim() : nm ? nm[2].trim() : rowText || itemTitle, typeFor(7, rowOpts), rowOpts.length ? rowOpts : options, lm ? lm[1].toLowerCase() : nm ? nm[1] : undefined);
          }
        };

        // A numbered list inside a stem ("5. Fill in the blanks" → "1." … "10."): parts 5.1 … 5.10,
        // for as long as the list counts up from 1.
        if (numbered && current?.stem && (current.sub === undefined ? Number(numbered[1]) === 1 && current.parts === 0 : Number(numbered[1]) === current.sub + 1)) {
          current.sub = Number(numbered[1]);
          if (itemType === 7 && rows.length > 1) gridRows();
          else addPart(promptOf(numbered[2].trim()), qType, options, numbered[1]);
          continue;
        }
        // An unnumbered item straight under a stem ("1. Choose the definition…" → "Match the gift…") is that question's part.
        if (!numbered && !lettered && current?.stem && current.sub === undefined) {
          if (itemType === 7 && rows.length > 1) gridRows();
          else addPart(promptOf(itemTitle), qType, options);
          continue;
        }

        if (numbered) {
          const number = Number(numbered[1]);
          const text = numbered[2].trim();
          current = { number, text, parts: 0 };
          textLines.push(`${number}. ${promptOf(text)}`);
          // A grid (multiple-choice / checkbox grid, code 7): each row is its own part of the question.
          if (itemType === 7 && rows.length > 1) { gridRows(); continue; }
          structuredQuestions.push({ prompt: promptOf(text), type: qType, options: options.length ? options : undefined, points: 1, number });
          options.forEach((o, k) => textLines.push(`   ${String.fromCharCode(65 + k)}) ${o}`));
          continue;
        }
        if (lettered && current && addPart(promptOf(lettered[2].trim()), qType, options, lettered[1].toLowerCase())) continue;

        // An unnumbered question (some forms don't number theirs): number it after the last one.
        unnumbered++;
        const number = (current?.number || structuredQuestions.reduce((m, q) => Math.max(m, q.number || 0), 0)) + 1;
        current = { number, text: itemTitle, parts: 0 };
        textLines.push(`${number}. ${promptOf(itemTitle)}`);
        structuredQuestions.push({ prompt: promptOf(itemTitle), type: qType, options: options.length ? options : undefined, points: 1, number });
      }
      void unnumbered;

      if (structuredQuestions.length > 0) {
        return {
          title: formTitle,
          description: formDesc,
          rawText: textLines.join('\n'),
          readingText: readingLines.join('\n'),
          detailFields,
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
    readingText: stripped,
    detailFields: [],
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
      const resp = (await fetchCurriculumLink(downloadUrl)) || (await fetch(downloadUrl));
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const pdfFile = new File([buf], `drive_${driveFileId}.pdf`, { type: 'application/pdf' });
        const pdfText = await extractTextFromPdfFile(pdfFile);
        // A scanned PDF has no text layer: say so instead of importing an empty lesson.
        if (pdfText.replace(/\s/g, '').length < 20) throw new Error('SCANNED_PDF: This PDF is a scan with no readable text. Open the original, or upload a text PDF / Word copy.');
        return {
          title: `Google Drive PDF (${driveFileId.slice(0, 8)})`,
          text: pdfText,
        };
      }
    } catch (e) {
      if (e instanceof Error && /^(SCANNED_PDF|PRIVATE_LINK)/.test(e.message)) throw e;
      // otherwise fall through to a text fetch
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
  // pdf.js reads real-world PDFs (Google/Word exports, embedded CID fonts); the quick parser below is the
  // fallback for environments without it.
  try {
    const { extractDocument } = await import('./documentImport');
    const doc = await extractDocument(file);
    if (doc.plainText.replace(/\s/g, '').length >= 20) return doc.plainText;
  } catch {
    /* pdf.js unavailable: try the quick parser */
  }
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

  // Nothing readable (a scan, or fonts the quick parser can't decode). Return nothing rather than
  // inventing questions from the file name: callers treat empty text as "couldn't read this".
  return '';
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

/** Openers that make a numbered line a prompt to answer rather than a list item. */
const QUESTION_PROMPT = /^(who|what|when|where|why|how|which|whom|whose|explain|describe|discuss|list|name|identify|define|compare|contrast|summari[sz]e|write|give|state|tell|fill|complete|circle|match|choose|select|read\s+.+\s+and|true\s+or\s+false|t\s*\/\s*f)\b/i;
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
  preParsedQuestions?: StructuredQuestion[];
  /** The text to read the lesson from when it differs from the original (a form: its text without its questions). */
  readingText?: string;
  detailFields?: string[];
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
  const detailFields: string[] = [...(params.detailFields || [])];
  const lines = (params.readingText ?? rawCurriculumText)
    .split(/\r?\n/)
    .map(l => l.trim());

  let detectedTitle = params.title?.trim() || '';
  const lessonBlocks: IngestedCurriculumUnit['lessonBlocks'] = [];
  const syllabusWeeks: PlanWeek[] = [];
  const questions: IngestedQuestion[] = [];

  // A test numbers its questions once through (1, 2, 3 …). Lists that start over at 1 in each section
  // (a study-method guide, an outline, class rules) are the document's text, so they stay reading.
  const printedNumbers = lines.map(l => l.match(/^(?:Q(?:uestion)?\s*#?)?(\d{1,3})\s*[.):]\s+/i)?.[1]).filter(Boolean).map(Number);
  const numberedAreQuestions = printedNumbers.every((n, k) => k === 0 || n > printedNumbers[k - 1]);

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
    if (qMatch && preParsedQuestions.length === 0 && numberedAreQuestions) {
      const qNum = Number(qMatch[1]) || questions.length + 1;
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

      // A numbered line is a question only when it reads like one. Numbered class rules, memory verses
      // and outlines stay reading text (they were being turned into "questions" before).
      const questionLike =
        /\?\s*$/.test(prompt) ||
        QUESTION_PROMPT.test(prompt) ||
        options.length >= 2 ||
        Boolean(inlineAnswer) ||
        Boolean(ptMatch) ||
        /_{3,}|\(\s*\)/.test(prompt);
      if (!questionLike) {
        lessonBlocks.push({ id: `lblk_${lessonBlocks.length + 1}`, kind: 'p', text: line, scripturePassage: prompt.match(SCRIPTURE_REGEX)?.[1] });
        i++;
        continue;
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
      // As written: a line that cites scripture stays a paragraph (the reference is kept as data).
      kind: 'p',
      text: line,
      scripturePassage: scMatch ? scMatch[1] : undefined,
    });
    i++;
  }

  // If Google Forms provided pre-parsed structured questions, hydrate them
  if (preParsedQuestions.length > 0 && questions.length === 0) {
    const skill = ensureSkill(currentSkillId, currentSkillTitle);
    preParsedQuestions.forEach((pq, idx) => {
      // The source's own numbering; parts keep their question's number and a letter.
      const qNum = pq.number ?? idx + 1;
      const qId = `q_${pq.label || qNum}${preParsedQuestions.some((o, k) => k < idx && (o.label || o.number) === (pq.label || pq.number)) ? `_${idx}` : ''}`;
      skill.questionIds.push(qId);
      skill.targetQuestions = skill.questionIds.length;
      const scMatch = pq.prompt.match(SCRIPTURE_REGEX);
      questions.push({
        id: qId,
        number: qNum,
        ...(pq.label ? { label: pq.label } : {}),
        ...(pq.group ? { group: pq.group } : {}),
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

  // A document with no questions in it (a handout, syllabus, reading) stays a reading: no questions are
  // invented for it. Teachers add their own in Tela Classwork.

  // Merge embedded Answer Key + separate Answer Key doc into questions
  const embeddedKey = parseAnswerKeyText(embeddedKeyLines.join('\n'));
  for (const q of questions) {
    const fromSeparate = q.label ? undefined : parsedKey.byNumber[q.number];
    const fromEmbedded = q.label ? undefined : embeddedKey.byNumber[q.number];
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
      worksheetPrompt: `Complete the ${countQuestions(questions)}-question interactive Tela check.`,
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
      prompt: `${q.label || q.number}. ${q.prompt}`,
      options: q.options,
      correctAnswer: q.correctAnswer,
      points: q.points,
      bbox: [0.06, Math.min(0.92, 0.12 + idx * 0.09), 0.94, Math.min(0.98, 0.19 + idx * 0.09)],
      // Current WorksheetField shape (percent of page) — worksheetToTelaDoc and WorksheetFillable read these.
      label: q.prompt,
      ordinal: q.label || String(q.number),
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
      questionNumber: q.label || String(q.number),
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
    instructions: '',
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
  // The reading page reproduces the original's own text and nothing else: no source/point summaries, no
  // added study material (Sacred Library supplements stay on the unit and show beside it as "Dig deeper"),
  // no repeat of the questions (they live on the worksheet pages) and never the answer key.
  const writerBlocks: TelaWriterBlock[] = [
    { id: `${lessonWriterId}_h1`, kind: 'h1', text: finalTitle },
    ...lessonBlocks.filter(b => !(b.kind === 'h1' && b.text.trim() === finalTitle.trim())).map((b, idx) => ({
      id: `${lessonWriterId}_b_${idx}`,
      kind: (b.kind === 'h1' || b.kind === 'h2' || b.kind === 'quote' || b.kind === 'callout' ? b.kind : 'p') as TelaWriterBlock['kind'],
      text: b.text,
    })),
  ];
  const hasReading = writerBlocks.length > 1;

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
    label: finalTitle,
  };

  const telaDoc: TelaDoc = {
    ...baseTelaDoc,
    id: `tela_${unitId}`,
    title: finalTitle,
    // A reading page only when the original has reading text of its own (a form/test is just its questions).
    frames: hasReading || questions.length === 0 ? [lessonFrame, ...baseTelaDoc.frames] : baseTelaDoc.frames,
    devices: hasReading || questions.length === 0 ? { ...baseTelaDoc.devices, [lessonWriterId]: lessonWriterDevice } : baseTelaDoc.devices,
  };

  const masterySkills = Array.from(skillsMap.values());
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

  const unit: IngestedCurriculumUnit = {
    id: unitId,
    orgId,
    programId,
    title: finalTitle,
    subtitle: `${sourceKind.replace('_', ' ')} · ${questions.length ? `${countQuestions(questions)} questions` : 'Reading'}${sacredLibrarySupplements.length ? ` · ${sacredLibrarySupplements.length} Sacred Library supplements` : ''}`,
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
    ...(detailFields.length ? { detailFields } : {}),
    importVersion: IMPORT_VERSION,
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
  let preParsedQuestions: StructuredQuestion[] = [];
  let formTitle: string | undefined;
  let readingText: string | undefined;
  let detailFields: string[] = [];

  // 1. Extract Lesson Source
  if (params.lessonFile) {
    const f = params.lessonFile;
    sourceLabel = f.name;
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.pdf')) {
      sourceKind = 'PDF_DOCUMENT';
      rawCurriculumText = await extractTextFromPdfFile(f);
      if (!rawCurriculumText.trim()) throw new Error(`SCANNED_PDF: “${f.name}” is a scan with no readable text. Upload a text PDF or Word copy, or a photo of each page.`);
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
        // The form's questions become the page's questions; only its own text is reading.
        if (preParsedQuestions.length) readingText = formRes.readingText;
        detailFields = formRes.detailFields;
        // The form's own title, as its students see it.
        if (formRes.title && formRes.structuredQuestions.length) formTitle = formRes.title;
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
    title: formTitle || params.title,
    rawCurriculumText,
    rawAnswerKeyText,
    sourceKind,
    sourceLabel,
    sourceUrl: params.lessonUrl?.trim() || undefined,
    answerKeySourceLabel,
    unitKind: params.unitKind,
    preParsedQuestions,
    readingText,
    detailFields,
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
  /** A link that couldn't be read (private, scanned, offline). It is skipped, not filled in. */
  onFailed?: (link: ExtractedCourseResourceLink, reason: string) => void;
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
    } catch (e) {
      // Nothing is invented for a link we couldn't read: report it and move on.
      params.onFailed?.(item, e instanceof Error ? e.message.replace(/^[A-Z_]+:\s*/, '') : 'Couldn’t read this link.');
    }
  }

  return results;
}

/**
 * Ensures every document detected in `REVELATION_2_COURSE_CONNECTION_PRESET` is onboarded into
 * `<Org Name> Education` for organization accounts (and repairs any earlier cached unit that had 0 questions
 * or was missing Sacred Library supplements). Standalone teachers outside an organization are not seeded with church presets.
 */
export interface CourseImportReport {
  hubTitle: string;
  at: number;
  total: number;
  imported: Array<{ label: string; url: string; title: string; questions: number; words: number }>;
  failed: Array<{ label: string; url: string; reason: string }>;
}
const IMPORT_REPORT_KEY = (orgId: string) => `plajah_course_import_report_v1_${orgId}`;
let importing: Promise<IngestedCurriculumUnit[]> | null = null;

/** What the last Revelation 2 import read, and what it couldn't (shown in the Lesson Library). */
export function getCourseImportReport(orgId: string): CourseImportReport | null {
  try {
    const raw = localStorage.getItem(IMPORT_REPORT_KEY(normalizeToGreatFaithOrgId(orgId)));
    return raw ? (JSON.parse(raw) as CourseImportReport) : null;
  } catch {
    return null;
  }
}

/**
 * Great Faith's Revelation 2 course: downloads and reads every link in the course doc that isn't in the
 * library yet, one separate item (and Tela document) per link. Links that fail are reported and retried
 * on a later visit; nothing is filled in for them. Other orgs: just lists their library.
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
  if (!isRevelationCourseOrg(safeOrgId)) return listIngestedUnits(orgId, programId, orgName);
  if (importing) return importing;
  importing = (async () => {
    // Drop the made-up items older builds stored, so only real imports remain.
    for (const u of readRawStoredUnitsForKey(STORAGE_UNITS_KEY(safeOrgId))) if (u && isFabricatedSampleUnit(u)) deleteIngestedUnit(safeOrgId, u.id);
    // Units read by an older importer (forms counted NAME/DATE and every lettered part as its own question,
    // and doubled every question into the reading) are read again from their links.
    const isAdmin = libraryActorIsAdmin(safeOrgId);
    for (const u of listIngestedUnits(safeOrgId, undefined, orgName)) {
      if (u.sourceUrl && isSampleCourseUnit(u) && (u.importVersion || 1) < IMPORT_VERSION) deleteIngestedUnit(safeOrgId, u.id, { shared: isAdmin });
    }
    const existing = listIngestedUnits(safeOrgId, undefined, orgName);
    const missing = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(link => !existing.some(u => u.sourceUrl === link.url));
    if (missing.length) {
      const failed: CourseImportReport['failed'] = [];
      const built = await batchIngestExtractedLinksToTela({
        orgId: safeOrgId,
        orgName,
        scopeKind: 'org',
        programId,
        links: missing,
        includeAnswerKeyDocs: true,
        onFailed: (link, reason) => failed.push({ label: link.label, url: link.url, reason }),
      });
      const prior = getCourseImportReport(safeOrgId);
      const imported = [
        ...(prior?.imported || []).filter(x => existing.some(u => u.sourceUrl === x.url)),
        ...built.map(b => ({ label: b.unit.sourceLabel, url: b.unit.sourceUrl || '', title: b.unit.title, questions: countQuestions(b.unit.questions), words: (b.unit.rawCurriculumText || '').split(/\s+/).filter(Boolean).length })),
      ];
      const report: CourseImportReport = { hubTitle: REVELATION_2_COURSE_CONNECTION_PRESET.hubTitle, at: Date.now(), total: REVELATION_2_COURSE_CONNECTION_PRESET.links.length, imported, failed };
      try { localStorage.setItem(IMPORT_REPORT_KEY(safeOrgId), JSON.stringify(report)); } catch { /* storage full */ }
      try { window.dispatchEvent(new CustomEvent('plajah:lessonLibraryUpdated')); } catch { /* not a browser */ }
    }
    return listIngestedUnits(safeOrgId, programId, orgName);
  })().finally(() => { importing = null; });
  return importing;
}

/**
 * Great Faith Ministries' Revelation 2 course, as listed in its "Revelation 2: Course Connection" Google Doc
 * (read from the doc's Word export, 2026-10-29): 9 course handouts on Google Drive (PDF) and 8 exams as
 * Google Forms. The doc's "Tests Responses" sheets hold students' answers and are deliberately left out.
 * Nothing here carries text: each link is downloaded and read by the importer (routes/curriculumFetch.ts),
 * and a link that can't be read is reported, never filled in.
 */
const REVELATION_2_LINKS: ExtractedCourseResourceLink[] = [
  { id: 'rev2_requirements', label: 'Revelation 2 Course Requirements', url: 'https://drive.google.com/file/d/11EYZuvQ74v_NMPNsdxcP0VWv0zHnTFjv/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_syllabus', label: 'Syllabus 2026/27', url: 'https://drive.google.com/file/d/1_QA5CWUNP8vIMK5v1yyLq9NLlDxBGwlP/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_exam_schedule', label: 'Revelation 2 Exam Schedule', url: 'https://drive.google.com/file/d/1KTFlIlthhdyw6isgxfJZAKHjxJ0BxdlZ/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_grading_scale', label: 'Inductive Bible Study Grading Scale', url: 'https://drive.google.com/file/d/1q-d8CHjcHAKx8rEAdUlrcOHnrW6OOv03/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_what_we_believe', label: 'What We Believe', url: 'https://drive.google.com/file/d/13Ns05pTgVBQjVPPKA8zV7YsPyqbBx5NH/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_memory_work', label: 'Memory Work', url: 'https://drive.google.com/file/d/1mNxmj8RJBWauOU6ZyZGiV2oRw2y_WgX6/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_study_outline', label: 'Bible Study Outline', url: 'https://drive.google.com/file/d/1QCE0muikXb9MGRllC8VBRX_Bvzu-Vuqt/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_reference_books', label: 'How To Study Bible Reference Books', url: 'https://drive.google.com/file/d/1PO3w5PxSqdWR9PpM4mEYrXNPTPPkPBxm/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_essay_format', label: 'Essay Paper Format', url: 'https://drive.google.com/file/d/1WHWBFLqcEJ0sCsrRrJ-XahkUIHCHbIzw/view?usp=sharing', category: 'PDF_DOCUMENT', sectionHeading: 'Links', isAnswerKey: false },
  { id: 'rev2_exam_1', label: 'Revelation 2 · Exam 1', url: 'https://docs.google.com/forms/d/e/1FAIpQLScAs2Gkj1Vv_rDmvGp0TQm-s10PZkaqPsBoEW3ClDgLHdDSMA/viewform', category: 'GOOGLE_FORM', sectionHeading: 'Tests', isAnswerKey: false },
  { id: 'rev2_exam_2', label: 'Revelation 2 · Exam 2', url: 'https://docs.google.com/forms/d/e/1FAIpQLScWcqUZi-bGBFpC3VgbOAhHVcJWQYjzE7TFIZ6qd9Re0Npeng/viewform', category: 'GOOGLE_FORM', sectionHeading: 'Tests', isAnswerKey: false },
  { id: 'rev2_exam_3', label: 'Revelation 2 · Exam 3', url: 'https://docs.google.com/forms/d/e/1FAIpQLSdHiaKnZrl05dDzgjeHt5fwcSY4y132w4xAXz3E8Ah5mHrH5Q/viewform', category: 'GOOGLE_FORM', sectionHeading: 'Tests', isAnswerKey: false },
  { id: 'rev2_exam_4', label: 'Revelation 2 · Exam 4', url: 'https://docs.google.com/forms/d/e/1FAIpQLSdECArsYanmhXUDLZEE6PdrDVb9xxaj0qS_fbCHZTYZtK5crA/viewform', category: 'GOOGLE_FORM', sectionHeading: 'Tests', isAnswerKey: false },
  { id: 'rev2_exam_5', label: 'Revelation 2 · Exam 5', url: 'https://docs.google.com/forms/d/e/1FAIpQLSe9KRP9kP3e710gh3yxkMeRkIhw5ibhzxCkE8C5lna4Jtn81g/viewform', category: 'GOOGLE_FORM', sectionHeading: 'Tests', isAnswerKey: false },
  { id: 'rev2_exam_6', label: 'Revelation 2 · Exam 6', url: 'https://docs.google.com/forms/d/e/1FAIpQLSe03FMQBb-icsX-FqrVQH41duVUHYgba15qizUZKdpY_b6EMg/viewform', category: 'GOOGLE_FORM', sectionHeading: 'Tests', isAnswerKey: false },
  { id: 'rev2_exam_7', label: 'Revelation 2 · Exam 7', url: 'https://docs.google.com/forms/d/e/1FAIpQLSdTYzE6J--UIzhTtVjCOB22pxebCT4vrvUDb5YNAxkyYW-p8A/viewform', category: 'GOOGLE_FORM', sectionHeading: 'Tests', isAnswerKey: false },
  { id: 'rev2_final_exam', label: 'Revelation 2 · Final Exam', url: 'https://docs.google.com/forms/d/e/1FAIpQLScvHHBTa4DE6yfq1mdM-cd6Gwst7ejhTD5EC4djhbT_B-jaDg/viewform', category: 'GOOGLE_FORM', sectionHeading: 'Tests', isAnswerKey: false },
];

export const REVELATION_2_COURSE_CONNECTION_PRESET: CourseHubLinkExtractionResult = {
  hubTitle: 'Revelation 2: Course Connection',
  hubUrl: 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?pli=1&tab=t.qo6bykb5zkh7',
  docId: '1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE',
  tabId: 't.qo6bykb5zkh7',
  rawPlainTextSummary: 'Revelation 2 course: requirements, 2026/27 syllabus, exam schedule, grading scale, statement of belief, memory work, study outline, reference-book guide, essay format, Exams 1–7 and the Final Exam.',
  links: REVELATION_2_LINKS,
  pdfLinks: REVELATION_2_LINKS.filter(l => l.category === 'PDF_DOCUMENT'),
  googleDocLinks: [],
  googleFormLinks: REVELATION_2_LINKS.filter(l => l.category === 'GOOGLE_FORM'),
  answerKeyLinks: [],
};
REVELATION_2_COURSE_CONNECTION_PRESET.pdfLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(l => l.category === 'PDF_DOCUMENT');
REVELATION_2_COURSE_CONNECTION_PRESET.googleDocLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(l => l.category === 'GOOGLE_DOC');
REVELATION_2_COURSE_CONNECTION_PRESET.googleFormLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(l => l.category === 'GOOGLE_FORM');
REVELATION_2_COURSE_CONNECTION_PRESET.answerKeyLinks = REVELATION_2_COURSE_CONNECTION_PRESET.links.filter(l => l.isAnswerKey);



/**
 * Makes sure this device has the lesson's Tela document (a lesson shared from another device arrives
 * without one), then opens it in Tela. `fromTelaDocId` seeds a copy from the original's page.
 */
export async function openUnitInTela(unit: IngestedCurriculumUnit, opts: { fromTelaDocId?: string; ownerUid?: string } = {}): Promise<void> {
  let have: TelaDoc | null = null;
  try { have = await loadTelaDoc(unit.telaDocId); } catch { have = null; }
  if (!have) {
    let base: TelaDoc | null = null;
    if (opts.fromTelaDocId) { try { base = await loadTelaDoc(opts.fromTelaDocId); } catch { base = null; } }
    const doc = base || worksheetToTelaDoc(unit.worksheet, opts.ownerUid || unit.ownerUid || '');
    await saveTelaDoc({ ...doc, id: unit.telaDocId, title: `${unit.title} (Interactive Tela)`, ownerId: opts.ownerUid || doc.ownerId, editedBy: undefined });
  }
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: unit.telaDocId, returnTo: { label: 'Lesson Library' } } }));
}
