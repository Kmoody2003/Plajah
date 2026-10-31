import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { db, opsDb, auth, storage } from './firebase';
import type { Organization, Ministry, TelaDoc } from '../types';
import { defaultMinistries, ensureChurchMusicAndEducationDepartments } from './elevateTemplates';

// ─────────────────────────────────────────────────────────────────────────
// Org / per-account private Digital Asset Manager (Content HQ).
//
// Arbitrary files (brand specs, documents, PDFs, images, media, and paired
// Original + Interactive Tela Documents) held privately for an ORG
// (scopeKind 'org', scopeId = organization id, e.g. Great Faith Ministries)
// or a single ACCOUNT (scopeKind 'user', scopeId = uid).
// Each department of the organization has its own Folder Scope inside
// Content HQ (e.g., "Christian Education", "Music Department", "Media", etc.).
// ─────────────────────────────────────────────────────────────────────────

export const GREAT_FAITH_MINISTRIES_DEFAULT_ID = 'great-faith-ministries';
export const GREAT_FAITH_MINISTRIES_NAME = 'Great Faith Ministries';

export const GREAT_FAITH_MINISTRIES_ORG: Organization = {
  id: GREAT_FAITH_MINISTRIES_DEFAULT_ID,
  orgType: 'CHURCH',
  name: GREAT_FAITH_MINISTRIES_NAME,
  handle: 'greatfaithministries',
  tagline: 'Walking by Faith, Teaching the Word, Equipping the Saints.',
  about:
    'Great Faith Ministries — Official Plajah Elevate Organization Account, Christian Education Classrooms, Interactive Tela Curriculum Library, and Department Operations.',
  accentColor: '#8B5CF6',
  creatorId: 'great-faith-admin',
  admins: ['great-faith-admin'],
  category: 'Christian Ministry',
  denomination: 'Christian Ministry',
  isDemo: false,
  isPublic: true,
  isVerified: true,
  ministries: defaultMinistries('CHURCH'),
  createdAt: 1_725_000_000_000,
  updatedAt: 1_725_000_000_000,
};

export type OwnerScope =
  | { kind: 'org'; id: string; ownerUid?: string; adminUids?: string[]; label?: string }
  | { kind: 'user'; id: string; label?: string };

export type OrgAssetKind = 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'other';

export interface OrgAsset {
  id: string;
  /** Who may use this file. Missing means open. Server-only (routes/elevateAccess.ts). */
  access?: 'open' | 'restricted' | 'revoked';
  accessSpec?: { departments?: string[]; roles?: string[]; users?: string[] };
  accessUids?: string[];
  scopeKind: 'org' | 'user';
  scopeId: string;
  uploadedByUid: string;
  name: string;
  kind: OrgAssetKind;
  mimeType: string;
  url: string;
  storagePath: string;
  sizeBytes: number;
  folder?: string;
  /** Department scope within the Organization Asset Management System (e.g., "<Org Name> Education"). */
  departmentId?: string;
  departmentName?: string;
  /** Document class folder for education assets ("Lessons & Course Resources", "Assignments & Worksheets", "Quizzes & Assessments", "Syllabi & Master Source Docs", "Answer Keys & Rubrics"). */
  documentClassFolder?: string;
  /** Distinguishes the Original Source document copy from its Interactive Tela Document version. */
  assetVariant?: 'ORIGINAL_SOURCE' | 'TELA_DOCUMENT' | 'ANSWER_KEY';
  /** When assetVariant === 'TELA_DOCUMENT' (or linked), points to the TelaDoc id in telaStore. */
  telaDocId?: string;
  /** Links the Original Source asset and the Interactive Tela Document asset to each other. */
  pairedAssetId?: string;
  /** Original Google Doc / Google Form / PDF URL if ingested from a link. */
  sourceUrl?: string;
  /** Preserved text/markdown snapshot of the original document for instant preview inside Content HQ. */
  rawContentText?: string;
  tags?: string[];
  status?: import('../types').HqAssetStatus;
  scanStatus?: 'PENDING' | 'CLEAN' | 'QUARANTINED';
  scanReason?: string;
  scannedAt?: number;
  currentVersionId?: string;
  versionCount?: number;
  deletedAt?: number;
  deletedByUid?: string;
  retentionDeleteAt?: number;
  rights?: { owner?: string; license?: string; expiresAt?: number; territory?: string; credits?: string };
  brandKit?: boolean;
  approvedAt?: number;
  approvedByUid?: string;
  uploadedAt: number;
}

const COLLECTION = 'orgAssets';

function kindFromMime(mime: string, name: string): OrgAssetKind {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('text/') || mime.includes('word') || mime.includes('document') ||
      ['doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'pages', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'key', 'numbers'].includes(ext)) return 'doc';
  return 'other';
}

/** Fresh token for the ACTIVE account before a Storage write (see UploadContext). */
async function ensureAuthUid(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to manage Content HQ files.');
  try { await u.getIdToken(true); } catch { /* the write below surfaces a real auth error */ }
  return u.uid;
}

function contentTypeFor(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', txt: 'text/plain', csv: 'text/csv',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  } as Record<string, string>)[ext] || 'application/octet-stream';
}

/**
 * Server-authoritative storage-cap check before an upload spends bandwidth. The client also
 * checks the cap for instant UX (ContentHQ.onFiles); this is the gate the server enforces.
 * Throws STORAGE_CAP_EXCEEDED when over cap; a server/network error is non-fatal (fail-open,
 * so an outage never blocks all uploads — the client-side UX check still applies).
 */
async function assertUnderHqCap(scope: OwnerScope, incomingBytes: number): Promise<void> {
  let res: Response;
  try {
    const token = await auth.currentUser?.getIdToken();
    res = await fetch('/api/hq/quota-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ scopeKind: scope.kind, scopeId: scope.id, incomingBytes }),
    });
  } catch { return; /* network/offline — do not block; client UX check already ran */ }
  if (res.status === 413) {
    const d = await res.json().catch(() => ({} as any));
    const gb = d?.capBytes ? Math.round(d.capBytes / 1024 ** 3) : 0;
    throw new Error(`STORAGE_CAP_EXCEEDED${gb ? `:${gb}GB` : ''}`);
  }
}

const LOCAL_MIRROR_KEY = (scopeId: string) => `plajah_org_assets_mirror_v1_${scopeId}`;

function readLocalMirrorAssets(scopeId: string): OrgAsset[] {
  try {
    const raw = localStorage.getItem(LOCAL_MIRROR_KEY(scopeId));
    const list: OrgAsset[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveLocalMirrorAssets(scopeId: string, assets: OrgAsset[]): void {
  try {
    localStorage.setItem(LOCAL_MIRROR_KEY(scopeId), JSON.stringify(assets));
  } catch {
    // ignore storage quota
  }
}

/**
 * Resolves the Great Faith Ministries organization account (and NEVER routes to DEMO_CHURCH / 'demo-grace-chapel').
 */
export async function resolveGreatFaithMinistriesOrg(preferredOrg?: Organization | null): Promise<Organization> {
  if (
    preferredOrg &&
    !preferredOrg.isDemo &&
    preferredOrg.id !== 'demo-grace-chapel' &&
    preferredOrg.name?.toLowerCase().includes('great faith')
  ) {
    return {
      ...preferredOrg,
      ministries: ensureChurchMusicAndEducationDepartments(preferredOrg),
    };
  }

  try {
    const snap = await getDocs(collection(db, 'organizations'));
    const allOrgs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Organization));
    const exactGreatFaith = allOrgs.find(
      o =>
        !o.isDemo &&
        o.id !== 'demo-grace-chapel' &&
        (o.name?.toLowerCase().includes('great faith') || o.handle?.toLowerCase().includes('greatfaith'))
    );
    if (exactGreatFaith) {
      return {
        ...exactGreatFaith,
        ministries: ensureChurchMusicAndEducationDepartments(exactGreatFaith),
      };
    }

    if (preferredOrg && !preferredOrg.isDemo && preferredOrg.id !== 'demo-grace-chapel') {
      return {
        ...preferredOrg,
        ministries: ensureChurchMusicAndEducationDepartments(preferredOrg),
      };
    }

    const firstRealChurch = allOrgs.find(
      o => !o.isDemo && o.id !== 'demo-grace-chapel' && (o.orgType === 'CHURCH' || o.orgType === 'RELIGIOUS')
    );
    if (firstRealChurch) {
      return {
        ...firstRealChurch,
        ministries: ensureChurchMusicAndEducationDepartments(firstRealChurch),
      };
    }
  } catch {
    // offline or rules fallback
  }

  if (preferredOrg && !preferredOrg.isDemo && preferredOrg.id !== 'demo-grace-chapel') {
    return {
      ...preferredOrg,
      ministries: ensureChurchMusicAndEducationDepartments(preferredOrg),
    };
  }

  return GREAT_FAITH_MINISTRIES_ORG;
}

/**
 * Builds the organization's education department folder name as `<Organization Name> Education`
 * (e.g., "Great Faith Ministries Education", "Hope Foundation Education", "Civic Youth Alliance Education")
 * so that it works for any non-profit, school, civic, or faith organization structure.
 */
export function getOrgEducationFolderName(orgName?: string | null): string {
  const raw = (orgName || GREAT_FAITH_MINISTRIES_NAME).trim() || GREAT_FAITH_MINISTRIES_NAME;
  const baseName =
    raw
      .split('·')[0]
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim() || GREAT_FAITH_MINISTRIES_NAME;
  if (/\beducation$/i.test(baseName)) {
    return baseName;
  }
  return `${baseName} Education`;
}

/**
 * Checks whether a folder name refers to an organization's education folder
 * (including `<Org Name> Education` or legacy `"Christian Education"`).
 */
export function isOrgEducationFolderName(folderName?: string | null, orgName?: string | null): boolean {
  if (!folderName) return false;
  const clean = folderName.trim().toLowerCase();
  if (clean === 'christian education' || clean === 'education') return true;
  if (orgName && clean === getOrgEducationFolderName(orgName).toLowerCase()) return true;
  if (clean.endsWith(' education')) return true;
  return false;
}

export type EducationDocumentClassId =
  | 'LESSONS_AND_RESOURCES'
  | 'ASSIGNMENTS_AND_WORKSHEETS'
  | 'QUIZZES_AND_ASSESSMENTS'
  | 'SYLLABI_AND_SOURCE_DOCS'
  | 'ANSWER_KEYS_AND_RUBRICS';

export interface EducationDocumentClassFolder {
  id: EducationDocumentClassId;
  folderName: string;
  shortLabel: string;
  iconEmoji: string;
  isAnswerKeyFolder?: boolean;
}

/**
 * Canonical Document Class Folders for standalone teachers' Content HQ
 * (and sub-classification for organization education assets).
 */
export const TEACHER_DOCUMENT_CLASS_FOLDERS: EducationDocumentClassFolder[] = [
  {
    id: 'LESSONS_AND_RESOURCES',
    folderName: 'Lessons & Course Resources',
    shortLabel: 'Lessons & Resources',
    iconEmoji: '📚',
  },
  {
    id: 'ASSIGNMENTS_AND_WORKSHEETS',
    folderName: 'Assignments & Worksheets',
    shortLabel: 'Assignments & Worksheets',
    iconEmoji: '📝',
  },
  {
    id: 'QUIZZES_AND_ASSESSMENTS',
    folderName: 'Quizzes & Assessments',
    shortLabel: 'Quizzes & Assessments',
    iconEmoji: '🎯',
  },
  {
    id: 'SYLLABI_AND_SOURCE_DOCS',
    folderName: 'Syllabi & Master Source Docs',
    shortLabel: 'Syllabi & Source Docs',
    iconEmoji: '📜',
  },
  {
    id: 'ANSWER_KEYS_AND_RUBRICS',
    folderName: 'Answer Keys & Rubrics',
    shortLabel: 'Answer Keys & Rubrics',
    iconEmoji: '🔑',
    isAnswerKeyFolder: true,
  },
];

/**
 * Resolves the canonical Document Class Folder name for any uploaded or extracted
 * education resource (lesson, course resource, assignment, worksheet, quiz, syllabus, or answer key).
 */
export function resolveDocumentClassFolder(params: {
  unitTitle?: string;
  unitKind?: string;
  libraryCategory?: string;
  isAnswerKey?: boolean;
}): string {
  const title = (params.unitTitle || '').toLowerCase();
  const kind = (params.unitKind || '').toUpperCase();
  const cat = (params.libraryCategory || '').toUpperCase();

  if (
    params.isAnswerKey ||
    cat === 'ANSWER_KEY' ||
    /\b(answer\s*key|rubric\s*compendium|master\s*key|grading\s*key)\b/i.test(title)
  ) {
    return 'Answer Keys & Rubrics';
  }
  if (
    cat === 'SYLLABUS' ||
    cat === 'MASTER_SOURCE_DOC' ||
    kind === 'CURRICULUM_MODULE' ||
    /\b(syllabus|course\s*connection|curriculum\s*overview|master\s*source)\b/i.test(title)
  ) {
    return 'Syllabi & Master Source Docs';
  }
  if (
    cat === 'QUIZ_EXAM' ||
    kind === 'QUIZ' ||
    kind === 'TEST' ||
    /\b(quiz|exam|examination|test|formative\s*check|assessment|benchmark)\b/i.test(title)
  ) {
    return 'Quizzes & Assessments';
  }
  if (
    cat === 'ASSIGNMENT' ||
    kind === 'ASSIGNMENT' ||
    /\b(worksheet|assignment|homework|practice\s*sheet|reflection\s*sheet)\b/i.test(title)
  ) {
    return 'Assignments & Worksheets';
  }
  if (
    cat === 'COURSE_RESOURCE' ||
    kind === 'INTERACTIVE_LESSON' ||
    /\b(lesson|lecture|dossier|packet|study\s*guide|reading|supplement|resource|notes)\b/i.test(title)
  ) {
    return 'Lessons & Course Resources';
  }
  return 'Lessons & Course Resources';
}

export function isStandaloneTeacherScopeId(scopeId?: string | null): boolean {
  if (!scopeId) return false;
  const clean = scopeId.trim().toLowerCase();
  return (
    clean === 'teacher-personal-hq' ||
    clean.startsWith('teacher-') ||
    clean.startsWith('teacher_') ||
    clean.startsWith('user-')
  );
}

export function getStandaloneTeacherScopeId(uid?: string | null): string {
  const clean = (uid || '').trim();
  if (!clean || clean === 'demo' || clean === 'demo-teacher' || clean === 'teacher_demo') {
    return 'teacher-personal-hq';
  }
  if (isStandaloneTeacherScopeId(clean)) {
    return clean;
  }
  return `teacher-${clean}`;
}

/**
 * Returns the canonical Department Folder Scopes for an organization in Content HQ
 * (`<Organization Name> Education`, Music Department, Worship Teams, Media, Finance, etc.).
 */
export function getOrgDepartmentFolders(
  org?: Organization | null,
  scopeLabel?: string | null
): Array<{
  id: string;
  folderName: string;
  iconEmoji: string;
  isChristianEd: boolean;
}> {
  const resolvedOrgName = org?.name || scopeLabel || GREAT_FAITH_MINISTRIES_NAME;
  const eduFolderName = getOrgEducationFolderName(resolvedOrgName);
  const ministries: Ministry[] = org
    ? ensureChurchMusicAndEducationDepartments(org)
    : GREAT_FAITH_MINISTRIES_ORG.ministries || defaultMinistries('CHURCH');

  const seen = new Set<string>();
  const folders: Array<{ id: string; folderName: string; iconEmoji: string; isChristianEd: boolean }> = [];

  // Ensure `<Organization Name> Education` is always the primary education folder scope at the top
  folders.push({
    id: 'dept-christian-education',
    folderName: eduFolderName,
    iconEmoji: '🎓',
    isChristianEd: true,
  });
  seen.add(eduFolderName.toLowerCase());
  seen.add('christian education');
  seen.add('education');

  for (const m of ministries) {
    const clean = (m.name || '').trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    if (clean.toLowerCase().includes('christian education')) continue;
    seen.add(clean.toLowerCase());
    folders.push({
      id: m.id,
      folderName: clean,
      iconEmoji: m.iconEmoji || '📁',
      isChristianEd: clean.toLowerCase().includes('education'),
    });
  }

  return folders;
}

/**
 * Copies BOTH the Original Document Version AND the Interactive Tela Document Version
 * (plus the Companion Answer Key if provided) into Content HQ (`orgAssets`):
 * - For teachers NOT in an organization (`scopeKind === 'user'` or standalone teacher scope):
 *   copies into the teacher's OWN Content HQ organized by Document Class Folder
 *   (`Lessons & Course Resources`, `Assignments & Worksheets`, `Quizzes & Assessments`,
 *   `Syllabi & Master Source Docs`, and `Answer Keys & Rubrics`).
 * - For organizations (`scopeKind === 'org'`):
 *   copies into the organization's Content HQ under `<Organization Name> Education`
 *   (and also tags each asset with its `documentClassFolder`).
 */
export async function copyCurriculumPairToOrgAssets(params: {
  orgId?: string;
  orgName?: string;
  scopeKind?: 'org' | 'user';
  departmentFolder?: string;
  unitTitle: string;
  unitKind?: string;
  libraryCategory?: string;
  isAnswerKeyOnly?: boolean;
  sourceKind: string;
  sourceUrl?: string;
  rawCurriculumText: string;
  rawAnswerKeyText?: string;
  telaDoc: TelaDoc;
}): Promise<{
  targetOrgId: string;
  targetOrgName: string;
  departmentFolder: string;
  documentClassFolder: string;
  originalAsset: OrgAsset;
  telaAsset: OrgAsset;
  answerKeyAsset?: OrgAsset;
}> {
  const isStandaloneTeacher =
    params.scopeKind === 'user' || isStandaloneTeacherScopeId(params.orgId);

  const documentClassFolder = resolveDocumentClassFolder({
    unitTitle: params.unitTitle,
    unitKind: params.unitKind,
    libraryCategory: params.libraryCategory,
    isAnswerKey: params.isAnswerKeyOnly,
  });

  let targetOrgId: string;
  let targetOrgName: string;
  let departmentFolder: string;
  const targetScopeKind: 'org' | 'user' = isStandaloneTeacher ? 'user' : 'org';

  if (isStandaloneTeacher) {
    targetOrgId = getStandaloneTeacherScopeId(params.orgId || auth.currentUser?.uid);
    targetOrgName = params.orgName || auth.currentUser?.displayName || 'Teacher Content HQ';
    departmentFolder = params.isAnswerKeyOnly ? 'Answer Keys & Rubrics' : documentClassFolder;
  } else {
    // Organization mode: never write to demo-grace-chapel
    const isDemoId =
      !params.orgId || params.orgId === 'demo-grace-chapel' || params.orgId.startsWith('demo-');
    const resolvedOrg = isDemoId ? await resolveGreatFaithMinistriesOrg() : null;
    targetOrgId = isDemoId
      ? resolvedOrg?.id || GREAT_FAITH_MINISTRIES_DEFAULT_ID
      : params.orgId!;
    targetOrgName = isDemoId
      ? resolvedOrg?.name || GREAT_FAITH_MINISTRIES_NAME
      : params.orgName || GREAT_FAITH_MINISTRIES_NAME;
    const rawDept = params.departmentFolder?.trim();
    departmentFolder =
      !rawDept || isOrgEducationFolderName(rawDept, targetOrgName)
        ? getOrgEducationFolderName(targetOrgName)
        : rawDept;
  }

  const answerKeyFolder = isStandaloneTeacher ? 'Answer Keys & Rubrics' : departmentFolder;
  const uid = auth.currentUser?.uid || (isStandaloneTeacher ? targetOrgId : 'great-faith-admin');
  const now = Date.now();
  const baseSlug = params.unitTitle.replace(/[^\w.\-]+/g, '_').slice(0, 64);

  const originalAssetId = `hq_orig_${params.telaDoc.id}`;
  const telaAssetId = `hq_tela_${params.telaDoc.id}`;
  const keyAssetId = `hq_key_${params.telaDoc.id}`;

  const originalKind: OrgAssetKind =
    params.sourceKind === 'PDF_DOCUMENT' ? 'pdf' : 'doc';
  const originalExt = originalKind === 'pdf' ? 'pdf' : 'doc';

  const originalBytes = new TextEncoder().encode(params.rawCurriculumText || params.unitTitle).length;
  const telaJsonString = JSON.stringify(params.telaDoc, null, 2);
  const telaBytes = new TextEncoder().encode(telaJsonString).length;

  // 1. Original Document Asset
  const originalAsset: OrgAsset = {
    id: originalAssetId,
    scopeKind: targetScopeKind,
    scopeId: targetOrgId,
    uploadedByUid: uid,
    name: `${params.unitTitle} (Original Document).${originalExt}`,
    kind: originalKind,
    mimeType: originalKind === 'pdf' ? 'application/pdf' : 'text/markdown',
    url: params.sourceUrl || `/api/hq/assets/${encodeURIComponent(originalAssetId)}/download`,
    storagePath: `protected-hq/${targetScopeKind}/${targetOrgId}/${departmentFolder}/${originalAssetId}/${baseSlug}_original.${originalExt}`,
    sizeBytes: Math.max(512, originalBytes),
    folder: departmentFolder,
    departmentId: isStandaloneTeacher ? `class-${documentClassFolder}` : 'dept-christian-education',
    departmentName: departmentFolder,
    documentClassFolder,
    assetVariant: 'ORIGINAL_SOURCE',
    telaDocId: params.telaDoc.id,
    pairedAssetId: telaAssetId,
    sourceUrl: params.sourceUrl,
    rawContentText: params.rawCurriculumText,
    tags: [departmentFolder, documentClassFolder, 'Original Source', params.sourceKind],
    status: 'APPROVED',
    scanStatus: 'CLEAN',
    versionCount: 1,
    uploadedAt: now,
  };

  // 2. Interactive Tela Document Asset
  const telaAsset: OrgAsset = {
    id: telaAssetId,
    scopeKind: targetScopeKind,
    scopeId: targetOrgId,
    uploadedByUid: uid,
    name: `${params.unitTitle} (Interactive Tela Document).tela`,
    kind: 'doc',
    mimeType: 'application/vnd.plajah.tela+json',
    url: `/tela/${encodeURIComponent(params.telaDoc.id)}`,
    storagePath: `protected-hq/${targetScopeKind}/${targetOrgId}/${departmentFolder}/${telaAssetId}/${baseSlug}.tela.json`,
    sizeBytes: Math.max(1024, telaBytes),
    folder: departmentFolder,
    departmentId: isStandaloneTeacher ? `class-${documentClassFolder}` : 'dept-christian-education',
    departmentName: departmentFolder,
    documentClassFolder,
    assetVariant: 'TELA_DOCUMENT',
    telaDocId: params.telaDoc.id,
    pairedAssetId: originalAssetId,
    sourceUrl: params.sourceUrl,
    rawContentText: params.rawCurriculumText,
    tags: [departmentFolder, documentClassFolder, 'Interactive Tela Document', 'Mastery Enabled'],
    status: 'APPROVED',
    scanStatus: 'CLEAN',
    versionCount: 1,
    uploadedAt: now + 1,
  };

  // 3. Optional Companion Answer Key Asset (placed in 'Answer Keys & Rubrics' for standalone teachers, or `<Org Name> Education` for orgs)
  let answerKeyAsset: OrgAsset | undefined;
  if (params.rawAnswerKeyText && params.rawAnswerKeyText.trim()) {
    const keyBytes = new TextEncoder().encode(params.rawAnswerKeyText).length;
    answerKeyAsset = {
      id: keyAssetId,
      scopeKind: targetScopeKind,
      scopeId: targetOrgId,
      uploadedByUid: uid,
      name: `${params.unitTitle} (Teacher Answer Key).doc`,
      kind: 'doc',
      mimeType: 'text/plain',
      url: `/api/hq/assets/${encodeURIComponent(keyAssetId)}/download`,
      storagePath: `protected-hq/${targetScopeKind}/${targetOrgId}/${answerKeyFolder}/${keyAssetId}/${baseSlug}_answer_key.txt`,
      sizeBytes: Math.max(256, keyBytes),
      folder: answerKeyFolder,
      departmentId: isStandaloneTeacher ? 'class-Answer Keys & Rubrics' : 'dept-christian-education',
      departmentName: answerKeyFolder,
      documentClassFolder: 'Answer Keys & Rubrics',
      assetVariant: 'ANSWER_KEY',
      telaDocId: params.telaDoc.id,
      pairedAssetId: telaAssetId,
      rawContentText: params.rawAnswerKeyText,
      tags: [answerKeyFolder, 'Answer Keys & Rubrics', 'Answer Key', 'Teacher Only'],
      status: 'APPROVED',
      scanStatus: 'CLEAN',
      versionCount: 1,
      uploadedAt: now + 2,
    };
  }

  // Save to local mirror for instant zero-latency access in Content HQ
  const existingLocal = readLocalMirrorAssets(targetOrgId).filter(
    a => a.id !== originalAssetId && a.id !== telaAssetId && a.id !== keyAssetId
  );
  const newMirrorList = [
    telaAsset,
    originalAsset,
    ...(answerKeyAsset ? [answerKeyAsset] : []),
    ...existingLocal,
  ];
  saveLocalMirrorAssets(targetOrgId, newMirrorList);

  if (isStandaloneTeacher) {
    // Also mirror under raw auth uid and 'teacher-personal-hq' so personal Content HQ always sees it
    const rawUid = auth.currentUser?.uid;
    const mirrorKeys = new Set<string>(['teacher-personal-hq']);
    if (rawUid) mirrorKeys.add(rawUid);
    for (const mKey of mirrorKeys) {
      if (mKey === targetOrgId) continue;
      const mExisting = readLocalMirrorAssets(mKey).filter(
        a => a.id !== originalAssetId && a.id !== telaAssetId && a.id !== keyAssetId
      );
      saveLocalMirrorAssets(mKey, [
        { ...telaAsset, scopeId: mKey },
        { ...originalAsset, scopeId: mKey },
        ...(answerKeyAsset ? [{ ...answerKeyAsset, scopeId: mKey }] : []),
        ...mExisting,
      ]);
    }
  } else if (
    targetOrgId !== GREAT_FAITH_MINISTRIES_DEFAULT_ID &&
    targetOrgName.toLowerCase().includes('great faith')
  ) {
    // Mirror under the canonical Great Faith Ministries ID when operating on Great Faith Ministries
    const gfExisting = readLocalMirrorAssets(GREAT_FAITH_MINISTRIES_DEFAULT_ID).filter(
      a => a.id !== originalAssetId && a.id !== telaAssetId && a.id !== keyAssetId
    );
    saveLocalMirrorAssets(GREAT_FAITH_MINISTRIES_DEFAULT_ID, [
      { ...telaAsset, scopeId: GREAT_FAITH_MINISTRIES_DEFAULT_ID },
      { ...originalAsset, scopeId: GREAT_FAITH_MINISTRIES_DEFAULT_ID },
      ...(answerKeyAsset ? [{ ...answerKeyAsset, scopeId: GREAT_FAITH_MINISTRIES_DEFAULT_ID }] : []),
      ...gfExisting,
    ]);
  }

  // Persist to Firestore `orgAssets` collection (best-effort)
  try {
    await setDoc(doc(opsDb, COLLECTION, originalAsset.id), originalAsset);
    await setDoc(doc(opsDb, COLLECTION, telaAsset.id), telaAsset);
    if (answerKeyAsset) {
      await setDoc(doc(opsDb, COLLECTION, answerKeyAsset.id), answerKeyAsset);
    }
  } catch {
    // Local mirror is already updated if Firestore ops rules or offline mode is active
  }

  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plajah:orgAssetsUpdated'));
    }
  } catch {
    // ignore
  }

  return {
    targetOrgId,
    targetOrgName,
    departmentFolder,
    documentClassFolder,
    originalAsset,
    telaAsset,
    answerKeyAsset,
  };
}

/**
 * All Content HQ assets for a scope:
 * - For `scope.kind === 'user'` (standalone teacher / personal Content HQ):
 *   organizes education assets into Document Class Folders (`Lessons & Course Resources`,
 *   `Assignments & Worksheets`, `Quizzes & Assessments`, `Syllabi & Master Source Docs`, `Answer Keys & Rubrics`).
 * - For `scope.kind === 'org'` (organization Content HQ):
 *   organizes education assets into `<Organization Name> Education` (normalizing any legacy `"Christian Education"` folder).
 */
export async function listHqAssets(scope: OwnerScope, includeTrash = false): Promise<OrgAsset[]> {
  const byId = new Map<string, OrgAsset>();
  const isUserScope = scope.kind === 'user' || isStandaloneTeacherScopeId(scope.id);
  const resolvedOrgName = scope.label || GREAT_FAITH_MINISTRIES_NAME;
  const orgEduFolder = getOrgEducationFolderName(resolvedOrgName);

  const normalizeAssetFolder = (item: OrgAsset): OrgAsset => {
    const docClass =
      item.documentClassFolder ||
      resolveDocumentClassFolder({
        unitTitle: item.name,
        isAnswerKey: item.assetVariant === 'ANSWER_KEY',
      });
    if (isUserScope) {
      const targetFolder =
        item.assetVariant === 'ANSWER_KEY'
          ? 'Answer Keys & Rubrics'
          : !item.folder || isOrgEducationFolderName(item.folder, resolvedOrgName)
            ? docClass
            : item.folder;
      return {
        ...item,
        scopeKind: 'user',
        scopeId: scope.id,
        folder: targetFolder,
        departmentName: targetFolder,
        documentClassFolder: docClass,
      };
    }
    const normalizedOrgFolder =
      !item.folder || isOrgEducationFolderName(item.folder, resolvedOrgName)
        ? orgEduFolder
        : item.folder;
    return {
      ...item,
      scopeKind: 'org',
      scopeId: scope.id,
      folder: normalizedOrgFolder,
      departmentName: normalizedOrgFolder,
      documentClassFolder: docClass,
    };
  };

  // 1. Load local mirror for this scope
  const mirrorScopeIds = isUserScope
    ? Array.from(
        new Set([
          scope.id,
          getStandaloneTeacherScopeId(scope.id),
          'teacher-personal-hq',
        ])
      )
    : Array.from(
        new Set([
          scope.id,
          GREAT_FAITH_MINISTRIES_DEFAULT_ID,
        ])
      );

  for (const mId of mirrorScopeIds) {
    for (const item of readLocalMirrorAssets(mId)) {
      if ((includeTrash || !item.deletedAt) && !byId.has(item.id)) {
        byId.set(item.id, normalizeAssetFolder(item));
      }
    }
  }

  // 2. Materialize any ingested curriculum units into Content HQ
  const unitKeys = isUserScope
    ? Array.from(
        new Set([
          `plajah_ingested_curriculum_units_v1_${scope.id}`,
          `plajah_ingested_curriculum_units_v1_${getStandaloneTeacherScopeId(scope.id)}`,
          `plajah_ingested_curriculum_units_v1_teacher-personal-hq`,
        ])
      )
    : Array.from(
        new Set([
          `plajah_ingested_curriculum_units_v1_${scope.id}`,
          `plajah_ingested_curriculum_units_v1_${GREAT_FAITH_MINISTRIES_DEFAULT_ID}`,
        ])
      );

  for (const key of unitKeys) {
    try {
      const raw = localStorage.getItem(key);
      const units: any[] = raw ? JSON.parse(raw) : [];
      if (Array.isArray(units)) {
        for (const u of units) {
          if (!u || !u.telaDocId || !u.title) continue;
          const docClass = resolveDocumentClassFolder({
            unitTitle: u.title,
            unitKind: u.kind,
            libraryCategory: u.libraryCategory,
            isAnswerKey: u.isAnswerKeyOnly,
          });
          const primaryFolder = isUserScope
            ? u.isAnswerKeyOnly
              ? 'Answer Keys & Rubrics'
              : docClass
            : !u.departmentFolder || isOrgEducationFolderName(u.departmentFolder, resolvedOrgName)
              ? orgEduFolder
              : u.departmentFolder;
          const answerKeyFolder = isUserScope ? 'Answer Keys & Rubrics' : primaryFolder;

          const origId = u.originalAssetId || `hq_orig_${u.telaDocId}`;
          const telaId = u.telaAssetId || `hq_tela_${u.telaDocId}`;
          const keyId = u.answerKeyAssetId || `hq_key_${u.telaDocId}`;
          const isPdf = u.sourceKind === 'PDF_DOCUMENT';
          const ext = isPdf ? 'pdf' : 'doc';
          const created = Number(u.createdAt) || Date.now();

          if (!byId.has(origId)) {
            byId.set(origId, {
              id: origId,
              scopeKind: isUserScope ? 'user' : 'org',
              scopeId: scope.id,
              uploadedByUid: isUserScope ? scope.id : 'great-faith-admin',
              name: `${u.title} (Original Document).${ext}`,
              kind: isPdf ? 'pdf' : 'doc',
              mimeType: isPdf ? 'application/pdf' : 'text/markdown',
              url: u.sourceUrl || `/api/hq/assets/${encodeURIComponent(origId)}/download`,
              storagePath: `protected-hq/${isUserScope ? 'user' : 'org'}/${scope.id}/${primaryFolder}/${origId}/${u.id}_original.${ext}`,
              sizeBytes: Math.max(1024, (u.rawCurriculumText || u.title).length),
              folder: primaryFolder,
              departmentId: isUserScope ? `class-${docClass}` : 'dept-christian-education',
              departmentName: primaryFolder,
              documentClassFolder: docClass,
              assetVariant: 'ORIGINAL_SOURCE',
              telaDocId: u.telaDocId,
              pairedAssetId: telaId,
              sourceUrl: u.sourceUrl,
              rawContentText: u.rawCurriculumText,
              tags: [primaryFolder, docClass, 'Original Source', u.sourceKind || 'DOCUMENT'],
              status: 'APPROVED',
              scanStatus: 'CLEAN',
              versionCount: 1,
              uploadedAt: created,
            });
          }

          if (!byId.has(telaId)) {
            byId.set(telaId, {
              id: telaId,
              scopeKind: isUserScope ? 'user' : 'org',
              scopeId: scope.id,
              uploadedByUid: isUserScope ? scope.id : 'great-faith-admin',
              name: `${u.title} (Interactive Tela Document).tela`,
              kind: 'doc',
              mimeType: 'application/vnd.plajah.tela+json',
              url: `/tela/${encodeURIComponent(u.telaDocId)}`,
              storagePath: `protected-hq/${isUserScope ? 'user' : 'org'}/${scope.id}/${primaryFolder}/${telaId}/${u.id}.tela.json`,
              sizeBytes: Math.max(2048, (u.rawCurriculumText || u.title).length * 2),
              folder: primaryFolder,
              departmentId: isUserScope ? `class-${docClass}` : 'dept-christian-education',
              departmentName: primaryFolder,
              documentClassFolder: docClass,
              assetVariant: 'TELA_DOCUMENT',
              telaDocId: u.telaDocId,
              pairedAssetId: origId,
              sourceUrl: u.sourceUrl,
              rawContentText: u.rawCurriculumText,
              tags: [primaryFolder, docClass, 'Interactive Tela Document', 'Mastery Enabled'],
              status: 'APPROVED',
              scanStatus: 'CLEAN',
              versionCount: 1,
              uploadedAt: created + 1,
            });
          }

          if (u.rawAnswerKeyText && !byId.has(keyId)) {
            byId.set(keyId, {
              id: keyId,
              scopeKind: isUserScope ? 'user' : 'org',
              scopeId: scope.id,
              uploadedByUid: isUserScope ? scope.id : 'great-faith-admin',
              name: `${u.title} (Teacher Answer Key).doc`,
              kind: 'doc',
              mimeType: 'text/plain',
              url: `/api/hq/assets/${encodeURIComponent(keyId)}/download`,
              storagePath: `protected-hq/${isUserScope ? 'user' : 'org'}/${scope.id}/${answerKeyFolder}/${keyId}/${u.id}_answer_key.txt`,
              sizeBytes: Math.max(512, String(u.rawAnswerKeyText).length),
              folder: answerKeyFolder,
              departmentId: isUserScope ? 'class-Answer Keys & Rubrics' : 'dept-christian-education',
              departmentName: answerKeyFolder,
              documentClassFolder: 'Answer Keys & Rubrics',
              assetVariant: 'ANSWER_KEY',
              telaDocId: u.telaDocId,
              pairedAssetId: telaId,
              rawContentText: u.rawAnswerKeyText,
              tags: [answerKeyFolder, 'Answer Keys & Rubrics', 'Answer Key', 'Teacher Only'],
              status: 'APPROVED',
              scanStatus: 'CLEAN',
              versionCount: 1,
              uploadedAt: created + 2,
            });
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // 3. Materialize any volunteer/member department uploads into Content HQ under their department folder (for org scopes)
  if (!isUserScope) {
    const uploadKeys = Array.from(
      new Set([
        `plajah_vol_dept_uploads_v1_${scope.id}`,
        `plajah_vol_dept_uploads_v1_${GREAT_FAITH_MINISTRIES_DEFAULT_ID}`,
      ])
    );
    for (const uKey of uploadKeys) {
      try {
        const raw = localStorage.getItem(uKey);
        const uploads: any[] = raw ? JSON.parse(raw) : [];
        if (Array.isArray(uploads)) {
          for (const up of uploads) {
            if (!up || !up.id) continue;
            const hqId = `hq_dept_up_${up.id}`;
            if (!byId.has(hqId)) {
              const rawDeptName = up.departmentName || orgEduFolder;
              const deptName = isOrgEducationFolderName(rawDeptName, resolvedOrgName)
                ? orgEduFolder
                : rawDeptName;
              const docClass = resolveDocumentClassFolder({ unitTitle: up.fileName || up.title });
              byId.set(hqId, {
                id: hqId,
                scopeKind: 'org',
                scopeId: scope.id,
                uploadedByUid: up.uploadedByUid || 'member',
                name: up.fileName || up.title || 'Department Upload',
                kind: kindFromMime(up.mimeType || 'application/pdf', up.fileName || up.title || 'doc.pdf'),
                mimeType: up.mimeType || 'application/pdf',
                url: up.dataUrl || `/api/hq/assets/${encodeURIComponent(hqId)}/download`,
                storagePath: `protected-hq/org/${scope.id}/${deptName}/${hqId}/${up.fileName || 'upload'}`,
                sizeBytes: Number(up.sizeBytes) || 2048,
                folder: deptName,
                departmentId: up.departmentId || 'dept-christian-education',
                departmentName: deptName,
                documentClassFolder: docClass,
                assetVariant: 'ORIGINAL_SOURCE',
                rawContentText: up.notes || up.title,
                tags: [deptName, docClass, 'Department Upload'],
                status: 'APPROVED',
                scanStatus: 'CLEAN',
                versionCount: 1,
                uploadedAt: Number(up.createdAt) || Date.now(),
              });
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Load Firestore `orgAssets`
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/elevate/access/assets?scopeId=${encodeURIComponent(scope.id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    for (const data of (await res.json()).assets as OrgAsset[]) {
      if (includeTrash || !data.deletedAt) {
        byId.set(data.id, normalizeAssetFolder(data));
      }
    }
  } catch {
    // fallback to local mirror
  }

  return Array.from(byId.values()).sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
}

/** Upload a file into a scope's DAM and write its Firestore record. */
export async function addHqAsset(
  scope: OwnerScope,
  file: File,
  folder: string | undefined,
  onProgress?: (pct: number) => void,
): Promise<OrgAsset> {
  const uid = await ensureAuthUid();
  await assertUnderHqCap(scope, file.size);
  const id = doc(collection(opsDb, COLLECTION)).id;
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const storagePath = `protected-hq/${scope.kind}/${scope.id}/${id}/${safe}`;
  const storageRef = ref(storage, storagePath);
  const mimeType = contentTypeFor(file);

  await new Promise<void>((resolve, reject) => {
    // ownerUid: storage rules scope protected-hq writes to the stamped uploader.
    const task = uploadBytesResumable(storageRef, file, { contentType: mimeType, customMetadata: { ownerUid: uid } });
    task.on('state_changed',
      (s) => onProgress?.((s.bytesTransferred / s.totalBytes) * 100),
      (err) => reject(err),
      () => resolve(),
    );
  });

  const asset: OrgAsset = {
    id,
    scopeKind: scope.kind,
    scopeId: scope.id,
    uploadedByUid: uid,
    name: file.name,
    kind: kindFromMime(mimeType, file.name),
    mimeType,
    url: `/api/hq/assets/${encodeURIComponent(id)}/download`,
    storagePath,
    sizeBytes: file.size,
    ...(folder ? { folder } : {}),
    status: 'DRAFT',
    // Quarantined until the server-side scan clears it (see requestHqScan below).
    scanStatus: 'PENDING',
    versionCount: 1,
    uploadedAt: Date.now(),
  };
  const versionRef = doc(collection(opsDb, 'hqAssetVersions'));
  asset.currentVersionId = versionRef.id;
  await setDoc(doc(opsDb, COLLECTION, id), asset);
  await setDoc(versionRef, {
    id: versionRef.id, assetId: id, version: 1, storagePath, name: file.name,
    mimeType, sizeBytes: file.size, uploadedByUid: uid, createdAt: Date.now(),
  });
  // Trigger the server-side MIME/allowlist/malware scan right after registration.
  // Best-effort and awaited so the returned asset reflects the verdict for instant
  // UX; a scan-endpoint outage leaves the asset PENDING (still gated) to be rescanned.
  const scan = await requestHqScan(id).catch(() => null);
  if (scan?.scanStatus) { asset.scanStatus = scan.scanStatus; if (scan.scanReason) asset.scanReason = scan.scanReason; }
  return asset;
}

/**
 * Ask the server to scan an asset's stored object: it verifies the REAL MIME
 * (magic bytes, not the client-declared type) against a type + size allowlist and
 * a malware heuristic, then flips scanStatus to CLEAN or QUARANTINED server-side.
 * Returns the verdict, or null when the endpoint is unreachable (asset stays PENDING).
 */
export async function setHqAssetAccess(assetId: string, access: 'open' | 'restricted' | 'revoked', spec: { departments: string[]; roles: string[]; users: string[] }): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/elevate/access/asset', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ assetId, access, ...spec }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not change who can use this file.');
}

export async function requestHqScan(assetId: string): Promise<{ scanStatus: 'PENDING' | 'CLEAN' | 'QUARANTINED'; scanReason?: string } | null> {
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/hq/scan/${encodeURIComponent(assetId)}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/** Move an asset to a different folder (or clear it). */
export async function setHqAssetFolder(asset: OrgAsset, folder: string | undefined): Promise<void> {
  await setDoc(doc(opsDb, COLLECTION, asset.id), { folder: folder || null }, { merge: true });
}

/** Delete an asset's Firestore record + its Storage object (best-effort). */
export async function deleteHqAsset(asset: OrgAsset): Promise<void> {
  await deleteDoc(doc(opsDb, COLLECTION, asset.id));
  try { await deleteObject(ref(storage, asset.storagePath)); } catch { /* object may already be gone */ }
}

export function humanFileSize(b: number): string {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
