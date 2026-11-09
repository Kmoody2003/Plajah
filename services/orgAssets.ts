import { userScopedKey } from './userScope';
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { db, opsDb, auth, storage } from './firebase';
import type { Ministry, TelaDoc } from '../types';
import { hqCacheKey, isStandaloneTeacherScopeId, onlyRowsInScope, ownUnitStorageIds, resolveHqReadScope, type HqReadScope } from './hqScopeWall';

export { isStandaloneTeacherScopeId } from './hqScopeWall';

// ─────────────────────────────────────────────────────────────────────────
// Org / per-account private Digital Asset Manager (Content HQ).
//
// Arbitrary files (brand specs, documents, PDFs, images, media, and paired
// Original + Interactive Tela Documents) held privately for an ORG
// (scopeKind 'org', scopeId = organization id)
// or a single ACCOUNT (scopeKind 'user', scopeId = uid).
// Each department of the organization has its own Folder Scope inside
// Content HQ (e.g., "Christian Education", "Music Department", "Media", etc.).
// ─────────────────────────────────────────────────────────────────────────

export type OwnerScope =
  | { kind: 'org'; id: string; ownerUid?: string; adminUids?: string[]; label?: string; departments?: Ministry[] }
  | { kind: 'user'; id: string; label?: string }
  /** id is the businessPages doc id. Its owner and staff seats share these files. */
  | { kind: 'business'; id: string; ownerUid?: string; label?: string };

export type OrgAssetKind = 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'other';

export interface OrgAsset {
  id: string;
  /** Who may use this file. Missing means open. Server-only (routes/elevateAccess.ts). */
  access?: 'open' | 'restricted' | 'revoked';
  accessSpec?: { departments?: string[]; roles?: string[]; users?: string[] };
  accessUids?: string[];
  scopeKind: 'org' | 'user' | 'business';
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
  /** The server holds document text for this file. Read it with getHqAssetText. */
  hasText?: boolean;
  tags?: string[];
  status?: import('../types').HqAssetStatus;
  scanStatus?: 'PENDING' | 'CLEAN' | 'QUARANTINED';
  scanReason?: string;
  scannedAt?: number;
  /** Which checks really ran. Server-only. A file says "antivirus" only if ClamAV read it. */
  scanEngine?: 'clamav' | 'heuristics';
  scanEngineNote?: string;
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
async function assertUnderHqCap(scope: { kind: 'org' | 'user' | 'business'; id: string }, incomingBytes: number): Promise<void> {
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

/**
 * Builds the organization's education department folder name as `<Organization Name> Education`
 * (e.g., "Great Faith Ministries Education", "Hope Foundation Education", "Civic Youth Alliance Education")
 * so that it works for any non-profit, school, civic, or faith organization structure.
 */
export function getOrgEducationFolderName(orgName?: string | null): string {
  const baseName = (orgName || '').trim().split('·')[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!baseName) return 'Education';
  if (/\beducation$/i.test(baseName)) return baseName;
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

/** An org's folders are its own departments. An org with none has none: nothing is borrowed from another org. */
export function getOrgDepartmentFolders(
  departments: Ministry[] | undefined,
  orgName?: string | null
): Array<{ id: string; folderName: string; iconEmoji: string; isChristianEd: boolean }> {
  const eduFolderName = getOrgEducationFolderName(orgName);
  const seen = new Set<string>();
  const folders: Array<{ id: string; folderName: string; iconEmoji: string; isChristianEd: boolean }> = [];
  for (const m of departments || []) {
    const clean = (m.name || '').trim();
    if (!clean) continue;
    const isEducation = isOrgEducationFolderName(clean, orgName);
    const folderName = isEducation ? eduFolderName : clean;
    if (seen.has(folderName.toLowerCase())) continue;
    seen.add(folderName.toLowerCase());
    folders.push({ id: m.id, folderName, iconEmoji: isEducation ? '🎓' : m.iconEmoji || '📁', isChristianEd: isEducation });
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
  // No org named means it's this person's own: it never lands in some other org.
  const isStandaloneTeacher =
    params.scopeKind === 'user' || !params.orgId || isStandaloneTeacherScopeId(params.orgId);

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
    targetOrgId = params.orgId!;
    targetOrgName = params.orgName || '';
    const rawDept = params.departmentFolder?.trim();
    departmentFolder =
      !rawDept || isOrgEducationFolderName(rawDept, targetOrgName)
        ? getOrgEducationFolderName(targetOrgName)
        : rawDept;
  }

  const answerKeyFolder = isStandaloneTeacher ? 'Answer Keys & Rubrics' : departmentFolder;
  const uid = auth.currentUser?.uid || '';
  // A person's files are stored under their uid, which is what the rules and the server check.
  const assetScopeId = isStandaloneTeacher ? uid : targetOrgId;
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
    scopeId: assetScopeId,
    uploadedByUid: uid,
    name: `${params.unitTitle} (Original Document).${originalExt}`,
    kind: originalKind,
    mimeType: originalKind === 'pdf' ? 'application/pdf' : 'text/markdown',
    url: params.sourceUrl || `/api/hq/assets/${encodeURIComponent(originalAssetId)}/download`,
    storagePath: `protected-hq/${targetScopeKind}/${assetScopeId}/${departmentFolder}/${originalAssetId}/${baseSlug}_original.${originalExt}`,
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
    scopeId: assetScopeId,
    uploadedByUid: uid,
    name: `${params.unitTitle} (Interactive Tela Document).tela`,
    kind: 'doc',
    mimeType: 'application/vnd.plajah.tela+json',
    url: `/tela/${encodeURIComponent(params.telaDoc.id)}`,
    storagePath: `protected-hq/${targetScopeKind}/${assetScopeId}/${departmentFolder}/${telaAssetId}/${baseSlug}.tela.json`,
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
      scopeId: assetScopeId,
      uploadedByUid: uid,
      name: `${params.unitTitle} (Teacher Answer Key).doc`,
      kind: 'doc',
      mimeType: 'text/plain',
      url: `/api/hq/assets/${encodeURIComponent(keyAssetId)}/download`,
      storagePath: `protected-hq/${targetScopeKind}/${assetScopeId}/${answerKeyFolder}/${keyAssetId}/${baseSlug}_answer_key.txt`,
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

  // Signed out there is no account to file these under; the lesson itself stays in its own local list.
  if (uid) {
    try {
      // The text goes through the server, which holds it behind the department check. A record never carries it.
      for (const asset of [originalAsset, telaAsset, ...(answerKeyAsset ? [answerKeyAsset] : [])]) {
        const { rawContentText: text, ...record } = asset;
        await setDoc(doc(opsDb, COLLECTION, asset.id), record);
        if (text) await saveHqAssetText(asset.id, text);
      }
    } catch (err) {
      // The lesson still lists from its local unit until this can be written.
      console.warn('[Content HQ] could not save curriculum assets:', err);
    }
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

async function hqFileHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function saveHqAssetText(assetId: string, text: string): Promise<void> {
  const res = await fetch(`/api/hq/file/${encodeURIComponent(assetId)}/text`, { method: 'PUT', headers: await hqFileHeaders(), body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Could not save the document text (${res.status}).`);
}

/** The text behind a file's preview. Files held only on this device already carry theirs. */
export async function getHqAssetText(asset: Pick<OrgAsset, 'id' | 'rawContentText' | 'hasText'>): Promise<string> {
  if (asset.rawContentText) return asset.rawContentText;
  if (!asset.hasText) return '';
  try {
    const res = await fetch(`/api/hq/file/${encodeURIComponent(asset.id)}/text`, { headers: await hqFileHeaders() });
    return res.ok ? String((await res.json()).text || '') : '';
  } catch { return ''; }
}

export type HqListStatus = 'ok' | 'offline' | 'denied';

function readHqCache(uid: string, scopeId: string): OrgAsset[] {
  try {
    const rows = JSON.parse(localStorage.getItem(hqCacheKey(uid, scopeId)) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeHqCache(uid: string, scopeId: string, rows: OrgAsset[]): void {
  try {
    localStorage.setItem(hqCacheKey(uid, scopeId), JSON.stringify(rows.map(({ rawContentText: _text, ...row }) => row)));
  } catch {
    // ignore storage quota
  }
}

function normalizeAssetFolder(item: OrgAsset, read: HqReadScope, orgName: string): OrgAsset {
  const isEducationDoc = !!item.assetVariant || !!item.documentClassFolder;
  const docClass = item.documentClassFolder || (read.teacher || isEducationDoc
    ? resolveDocumentClassFolder({ unitTitle: item.name, isAnswerKey: item.assetVariant === 'ANSWER_KEY' })
    : undefined);
  if (read.kind === 'user') {
    const targetFolder = !read.teacher
      ? item.folder
      : item.assetVariant === 'ANSWER_KEY'
        ? 'Answer Keys & Rubrics'
        : !item.folder || isOrgEducationFolderName(item.folder, orgName) ? docClass : item.folder;
    return { ...item, folder: targetFolder, departmentName: targetFolder, documentClassFolder: docClass };
  }
  const folder = item.folder && isOrgEducationFolderName(item.folder, orgName) ? getOrgEducationFolderName(orgName) : item.folder;
  return { ...item, folder, departmentName: folder, documentClassFolder: docClass };
}

/** The lessons and department uploads this device holds for this scope, shown until they reach the server. */
function localOnlyAssets(read: HqReadScope, orgName: string, known: Set<string>): OrgAsset[] {
  const out: OrgAsset[] = [];
  const add = (a: OrgAsset) => { if (!known.has(a.id)) { known.add(a.id); out.push(a); } };
  const uid = auth.currentUser?.uid || '';
  const orgEduFolder = getOrgEducationFolderName(orgName);
  const isUserScope = read.kind === 'user';

  // A business has no lessons on this device.
  for (const storageId of read.kind === 'business' ? [] : ownUnitStorageIds(read)) {
    try {
      const raw = localStorage.getItem(userScopedKey(uid, `plajah_ingested_curriculum_units_v1_${storageId}`));
      const units: any[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(units)) continue;
      for (const u of units) {
        if (!u || !u.telaDocId || !u.title) continue;
        const docClass = resolveDocumentClassFolder({ unitTitle: u.title, unitKind: u.kind, libraryCategory: u.libraryCategory, isAnswerKey: u.isAnswerKeyOnly });
        const primaryFolder = isUserScope
          ? u.isAnswerKeyOnly ? 'Answer Keys & Rubrics' : docClass
          : !u.departmentFolder || isOrgEducationFolderName(u.departmentFolder, orgName) ? orgEduFolder : u.departmentFolder;
        const answerKeyFolder = isUserScope ? 'Answer Keys & Rubrics' : primaryFolder;
        const origId = u.originalAssetId || `hq_orig_${u.telaDocId}`;
        const telaId = u.telaAssetId || `hq_tela_${u.telaDocId}`;
        const keyId = u.answerKeyAssetId || `hq_key_${u.telaDocId}`;
        const isPdf = u.sourceKind === 'PDF_DOCUMENT';
        const ext = isPdf ? 'pdf' : 'doc';
        const created = Number(u.createdAt) || Date.now();
        const shared = {
          scopeKind: read.kind, scopeId: read.id, uploadedByUid: u.ownerUid || uid,
          departmentId: isUserScope ? `class-${docClass}` : 'dept-christian-education',
          telaDocId: u.telaDocId, status: 'APPROVED' as const, scanStatus: 'CLEAN' as const, versionCount: 1,
        };
        add({
          ...shared, id: origId, name: `${u.title} (Original Document).${ext}`, kind: isPdf ? 'pdf' : 'doc',
          mimeType: isPdf ? 'application/pdf' : 'text/markdown',
          url: u.sourceUrl || `/api/hq/assets/${encodeURIComponent(origId)}/download`,
          storagePath: `protected-hq/${read.kind}/${read.id}/${primaryFolder}/${origId}/${u.id}_original.${ext}`,
          sizeBytes: Math.max(1024, (u.rawCurriculumText || u.title).length),
          folder: primaryFolder, departmentName: primaryFolder, documentClassFolder: docClass,
          assetVariant: 'ORIGINAL_SOURCE', pairedAssetId: telaId, sourceUrl: u.sourceUrl, rawContentText: u.rawCurriculumText,
          tags: [primaryFolder, docClass, 'Original Source', u.sourceKind || 'DOCUMENT'], uploadedAt: created,
        });
        add({
          ...shared, id: telaId, name: `${u.title} (Interactive Tela Document).tela`, kind: 'doc',
          mimeType: 'application/vnd.plajah.tela+json', url: `/tela/${encodeURIComponent(u.telaDocId)}`,
          storagePath: `protected-hq/${read.kind}/${read.id}/${primaryFolder}/${telaId}/${u.id}.tela.json`,
          sizeBytes: Math.max(2048, (u.rawCurriculumText || u.title).length * 2),
          folder: primaryFolder, departmentName: primaryFolder, documentClassFolder: docClass,
          assetVariant: 'TELA_DOCUMENT', pairedAssetId: origId, sourceUrl: u.sourceUrl, rawContentText: u.rawCurriculumText,
          tags: [primaryFolder, docClass, 'Interactive Tela Document', 'Mastery Enabled'], uploadedAt: created + 1,
        });
        if (u.rawAnswerKeyText) add({
          ...shared, id: keyId, name: `${u.title} (Teacher Answer Key).doc`, kind: 'doc', mimeType: 'text/plain',
          url: `/api/hq/assets/${encodeURIComponent(keyId)}/download`,
          storagePath: `protected-hq/${read.kind}/${read.id}/${answerKeyFolder}/${keyId}/${u.id}_answer_key.txt`,
          sizeBytes: Math.max(512, String(u.rawAnswerKeyText).length),
          folder: answerKeyFolder, departmentName: answerKeyFolder, documentClassFolder: 'Answer Keys & Rubrics',
          assetVariant: 'ANSWER_KEY', pairedAssetId: telaId, rawContentText: u.rawAnswerKeyText,
          tags: [answerKeyFolder, 'Answer Keys & Rubrics', 'Answer Key', 'Teacher Only'], uploadedAt: created + 2,
        });
      }
    } catch {
      // ignore parse errors
    }
  }

  if (read.kind === 'org') {
    try {
      const raw = localStorage.getItem(`plajah_vol_dept_uploads_v1_${read.id}`);
      const uploads: any[] = raw ? JSON.parse(raw) : [];
      if (Array.isArray(uploads)) {
        for (const up of uploads) {
          if (!up || !up.id) continue;
          const hqId = `hq_dept_up_${up.id}`;
          const rawDeptName = up.departmentName || orgEduFolder;
          const deptName = isOrgEducationFolderName(rawDeptName, orgName) ? orgEduFolder : rawDeptName;
          add({
            id: hqId, scopeKind: 'org', scopeId: read.id, uploadedByUid: up.uploadedByUid || 'member',
            name: up.fileName || up.title || 'Department Upload',
            kind: kindFromMime(up.mimeType || 'application/pdf', up.fileName || up.title || 'doc.pdf'),
            mimeType: up.mimeType || 'application/pdf',
            url: up.dataUrl || `/api/hq/assets/${encodeURIComponent(hqId)}/download`,
            storagePath: `protected-hq/org/${read.id}/${deptName}/${hqId}/${up.fileName || 'upload'}`,
            sizeBytes: Number(up.sizeBytes) || 2048, folder: deptName, departmentId: up.departmentId,
            departmentName: deptName, assetVariant: 'ORIGINAL_SOURCE', rawContentText: up.notes || up.title,
            tags: [deptName, 'Department Upload'], status: 'APPROVED', scanStatus: 'CLEAN', versionCount: 1,
            uploadedAt: Number(up.createdAt) || Date.now(),
          });
        }
      }
    } catch {
      // ignore
    }
  }
  return out;
}

/**
 * The Content HQ files this person may see in this scope, and whether the server could be reached.
 * The server decides. Files held on this device are added only once the server has confirmed the
 * person belongs to the scope, so nothing on a shared computer can cross between accounts.
 */
export async function listHqAssetsDetailed(scope: OwnerScope, includeTrash = false): Promise<{ assets: OrgAsset[]; status: HqListStatus }> {
  const uid = auth.currentUser?.uid;
  const read = resolveHqReadScope(scope, uid);
  if (!read || !uid) return { assets: [], status: 'denied' };
  const orgName = scope.label || '';
  let rows: OrgAsset[] = [];
  let status: HqListStatus = 'ok';
  let belongs = read.kind === 'user';
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/elevate/access/assets?scopeId=${encodeURIComponent(read.id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) return { assets: [], status: 'denied' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    rows = onlyRowsInScope(payload.assets as OrgAsset[], read);
    belongs = belongs || payload.inScope === true;
    writeHqCache(uid, read.id, rows);
  } catch {
    status = 'offline';
    rows = onlyRowsInScope(readHqCache(uid, read.id), read);
    belongs = belongs || rows.length > 0;
  }
  // Every id the server knows, trashed ones too, so a deleted lesson isn't brought back from local copies.
  const known = new Set(rows.map(r => r.id));
  const assets = rows.filter(r => includeTrash || !r.deletedAt).map(r => normalizeAssetFolder(r, read, orgName));
  if (belongs) assets.push(...localOnlyAssets(read, orgName, known));
  return { assets: assets.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0)), status };
}

/** The storage allowance the server enforces for a scope, in GB. */
export async function fetchHqScopeCapGb(scope: { kind: string; id: string }): Promise<number> {
  const res = await fetch('/api/hq/quota-check', { method: 'POST', headers: await hqFileHeaders(), body: JSON.stringify({ scopeKind: scope.kind, scopeId: scope.id, incomingBytes: 0 }) });
  if (!res.ok) throw new Error(String(res.status));
  return Math.round(Number((await res.json()).capBytes || 0) / 1024 ** 3);
}

/** Org files deliberately shared with this person. Each stays the org's; access ends when the org revokes it. */
export async function listHqSharedWithMe(): Promise<OrgAsset[]> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const res = await fetch('/api/elevate/access/shared-with-me', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    return res.ok ? ((await res.json()).assets as OrgAsset[]) : [];
  } catch {
    return [];
  }
}

/** Files other orgs shared with this org. Each stays theirs, read-only, until they take it back. */
export async function listHqSharedWithOrg(orgId: string): Promise<OrgAsset[]> {
  try {
    const res = await fetch(`/api/elevate/access/shared-with-org?orgId=${encodeURIComponent(orgId)}`, { headers: await hqFileHeaders() });
    return res.ok ? ((await res.json()).assets as OrgAsset[]) : [];
  } catch { return []; }
}

export async function listHqOrgShares(assetId: string): Promise<{ id: string; name: string }[] | null> {
  const res = await fetch(`/api/elevate/access/org-share?assetId=${encodeURIComponent(assetId)}`, { headers: await hqFileHeaders() });
  return res.ok ? (await res.json()).orgs : null;
}

export async function setHqOrgShare(assetId: string, targetOrgId: string, on: boolean): Promise<void> {
  const res = await fetch('/api/elevate/access/org-share', { method: 'POST', headers: await hqFileHeaders(), body: JSON.stringify({ assetId, targetOrgId, on }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not save.');
}

export async function listHqAssets(scope: OwnerScope, includeTrash = false): Promise<OrgAsset[]> {
  return (await listHqAssetsDetailed(scope, includeTrash)).assets;
}

// ── Large-file storage on B2 (routes/hqB2.ts) ─────────────────────────────
// Off until the server sets HQ_B2_ENABLED=1; the first "off" answer is remembered for the session.
let hqB2Off = false;
const isB2StoragePath = (p: unknown) => typeof p === 'string' && p.startsWith('b2:');

async function uploadHqToB2(
  target: { kind: 'org' | 'user' | 'business'; id: string },
  file: File, folder: string | undefined, mimeType: string, onProgress?: (pct: number) => void,
): Promise<OrgAsset | null> {
  if (hqB2Off) return null;
  const token = await auth.currentUser?.getIdToken();
  if (!token) return null;
  const call = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    const r = await fetch(`/api/hq/b2${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) { const e: any = new Error(j.error || `HTTP ${r.status}`); e.code = j.code; e.status = r.status; throw e; }
    return j as T;
  };
  let begin: any;
  try {
    begin = await call('POST', '/uploads', { scopeKind: target.kind, scopeId: target.id, name: file.name, size: file.size, mime: mimeType, folder });
  } catch (e: any) {
    if (e?.code === 'b2_off' || e?.code === 'not_configured' || e?.status === 404) { hqB2Off = true; return null; }
    if (e?.code === 'over_cap') throw new Error('STORAGE_CAP_EXCEEDED');
    throw e;
  }
  const { runSignedUpload } = await import('./drive/client');
  const done = await runSignedUpload<{ asset: OrgAsset }>(begin, file, {
    signParts: async nums => (await call<{ parts: Array<{ partNumber: number; url: string }> }>('POST', `/uploads/${begin.uploadId}/parts`, { partNumbers: nums })).parts,
    complete: parts => call('POST', `/uploads/${begin.uploadId}/complete`, parts ? { parts } : {}),
    abort: () => call('DELETE', `/uploads/${begin.uploadId}`),
  }, sent => onProgress?.(file.size ? (sent / file.size) * 100 : 100), new AbortController().signal);
  return done.asset;
}

/** Upload a file into a scope's DAM and write its Firestore record. */
export async function addHqAsset(
  scope: OwnerScope,
  file: File,
  folder: string | undefined,
  onProgress?: (pct: number) => void,
): Promise<OrgAsset> {
  const uid = await ensureAuthUid();
  const target = resolveHqReadScope(scope, uid);
  if (!target) throw new Error('You can only add files to your own Content HQ or your organization\'s.');
  await assertUnderHqCap(target, file.size);
  // Large-file storage (B2, resumable). Null = switched off on this server → Firebase Storage below.
  const viaB2 = await uploadHqToB2(target, file, folder, contentTypeFor(file), onProgress);
  if (viaB2) {
    const scan = await requestHqScan(viaB2.id).catch(() => null);
    if (scan?.scanStatus) { viaB2.scanStatus = scan.scanStatus; if (scan.scanReason) viaB2.scanReason = scan.scanReason; }
    return viaB2;
  }
  const id = doc(collection(opsDb, COLLECTION)).id;
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const storagePath = `protected-hq/${target.kind}/${target.id}/${id}/${safe}`;
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
    scopeKind: target.kind,
    scopeId: target.id,
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

/**
 * Extra copies of imported course files. Older importers gave each re-import new ids, so every run
 * added another Original + Tela (+ Answer Key) set for the same link. For each link and variant the
 * copy the library's lesson points at is kept (`keepIds`); without one, the newest. Everything else
 * from that link is a duplicate. Files people uploaded themselves (no link) are never counted.
 */
export function findDuplicateImportCopies(assets: OrgAsset[], courseUrls: ReadonlySet<string>, keepIds: ReadonlySet<string>): OrgAsset[] {
  const groups = new Map<string, OrgAsset[]>();
  for (const a of assets) {
    if (a.deletedAt || !a.sourceUrl || !courseUrls.has(a.sourceUrl) || !/^hq_(orig|tela|key)_/.test(a.id)) continue;
    const k = `${a.sourceUrl}\u0000${a.assetVariant || a.id.split('_')[1]}`;
    const g = groups.get(k);
    if (g) g.push(a); else groups.set(k, [a]);
  }
  const dupes: OrgAsset[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const keep = g.find(a => keepIds.has(a.id)) || [...g].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))[0];
    for (const a of g) if (a !== keep) dupes.push(a);
  }
  return dupes;
}

/** Delete an asset's Firestore record + its Storage object (best-effort). */
export async function deleteHqAsset(asset: OrgAsset): Promise<void> {
  if (isB2StoragePath(asset.storagePath)) {
    // B2 objects have no client delete; the server checks write access and erases objects + record.
    const res = await fetch(`/api/hq/b2/assets/${encodeURIComponent(asset.id)}`, { method: 'DELETE', headers: await hqFileHeaders() });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not delete this file.');
    return;
  }
  await fetch(`/api/hq/file/${encodeURIComponent(asset.id)}/text`, { method: 'DELETE', headers: await hqFileHeaders() }).catch(() => {});
  await deleteDoc(doc(opsDb, COLLECTION, asset.id));
  try { await deleteObject(ref(storage, asset.storagePath)); } catch { /* object may already be gone */ }
}

export function humanFileSize(b: number): string {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
