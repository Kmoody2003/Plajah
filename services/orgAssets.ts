import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
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
  /** Department scope within the Organization Asset Management System (e.g., "Christian Education"). */
  departmentId?: string;
  departmentName?: string;
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
 * Returns the canonical Department Folder Scopes for an organization in Content HQ
 * (e.g. Christian Education, Music Department, Worship Teams, Band, Choir, Media, Finance, etc.).
 */
export function getOrgDepartmentFolders(org?: Organization | null): Array<{
  id: string;
  folderName: string;
  iconEmoji: string;
  isChristianEd: boolean;
}> {
  const ministries: Ministry[] = org
    ? ensureChurchMusicAndEducationDepartments(org)
    : GREAT_FAITH_MINISTRIES_ORG.ministries || defaultMinistries('CHURCH');

  const seen = new Set<string>();
  const folders: Array<{ id: string; folderName: string; iconEmoji: string; isChristianEd: boolean }> = [];

  // Ensure Christian Education is always the primary curriculum folder scope at the top
  folders.push({
    id: 'dept-christian-education',
    folderName: 'Christian Education',
    iconEmoji: '🎓',
    isChristianEd: true,
  });
  seen.add('christian education');

  for (const m of ministries) {
    const clean = (m.name || '').trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
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
 * (plus the Companion Answer Key if provided) into Great Faith Ministries' Organization
 * Assets Management System (`orgAssets` in Content HQ) scoped to the `Christian Education`
 * department folder!
 * Never writes to `demo-grace-chapel`.
 */
export async function copyCurriculumPairToOrgAssets(params: {
  orgId?: string;
  orgName?: string;
  departmentFolder?: string;
  unitTitle: string;
  sourceKind: string;
  sourceUrl?: string;
  rawCurriculumText: string;
  rawAnswerKeyText?: string;
  telaDoc: TelaDoc;
}): Promise<{
  targetOrgId: string;
  targetOrgName: string;
  departmentFolder: string;
  originalAsset: OrgAsset;
  telaAsset: OrgAsset;
  answerKeyAsset?: OrgAsset;
}> {
  // Never write to demo-grace-chapel — always route to Great Faith Ministries
  const isDemoId = !params.orgId || params.orgId === 'demo-grace-chapel' || params.orgId.startsWith('demo-');
  const resolvedOrg = isDemoId ? await resolveGreatFaithMinistriesOrg() : null;
  const targetOrgId = isDemoId ? (resolvedOrg?.id || GREAT_FAITH_MINISTRIES_DEFAULT_ID) : params.orgId!;
  const targetOrgName = isDemoId ? (resolvedOrg?.name || GREAT_FAITH_MINISTRIES_NAME) : (params.orgName || GREAT_FAITH_MINISTRIES_NAME);
  const departmentFolder = params.departmentFolder || 'Christian Education';

  const uid = auth.currentUser?.uid || 'great-faith-admin';
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

  // 1. Original Document Asset (in Christian Education department folder)
  const originalAsset: OrgAsset = {
    id: originalAssetId,
    scopeKind: 'org',
    scopeId: targetOrgId,
    uploadedByUid: uid,
    name: `${params.unitTitle} (Original Document).${originalExt}`,
    kind: originalKind,
    mimeType: originalKind === 'pdf' ? 'application/pdf' : 'text/markdown',
    url: params.sourceUrl || `/api/hq/assets/${encodeURIComponent(originalAssetId)}/download`,
    storagePath: `protected-hq/org/${targetOrgId}/${departmentFolder}/${originalAssetId}/${baseSlug}_original.${originalExt}`,
    sizeBytes: Math.max(512, originalBytes),
    folder: departmentFolder,
    departmentId: 'dept-christian-education',
    departmentName: departmentFolder,
    assetVariant: 'ORIGINAL_SOURCE',
    telaDocId: params.telaDoc.id,
    pairedAssetId: telaAssetId,
    sourceUrl: params.sourceUrl,
    rawContentText: params.rawCurriculumText,
    tags: ['Christian Education', 'Original Source', params.sourceKind],
    status: 'APPROVED',
    scanStatus: 'CLEAN',
    versionCount: 1,
    uploadedAt: now,
  };

  // 2. Interactive Tela Document Asset (in Christian Education department folder)
  const telaAsset: OrgAsset = {
    id: telaAssetId,
    scopeKind: 'org',
    scopeId: targetOrgId,
    uploadedByUid: uid,
    name: `${params.unitTitle} (Interactive Tela Document).tela`,
    kind: 'doc',
    mimeType: 'application/vnd.plajah.tela+json',
    url: `/tela/${encodeURIComponent(params.telaDoc.id)}`,
    storagePath: `protected-hq/org/${targetOrgId}/${departmentFolder}/${telaAssetId}/${baseSlug}.tela.json`,
    sizeBytes: Math.max(1024, telaBytes),
    folder: departmentFolder,
    departmentId: 'dept-christian-education',
    departmentName: departmentFolder,
    assetVariant: 'TELA_DOCUMENT',
    telaDocId: params.telaDoc.id,
    pairedAssetId: originalAssetId,
    sourceUrl: params.sourceUrl,
    rawContentText: params.rawCurriculumText,
    tags: ['Christian Education', 'Interactive Tela Document', 'Mastery Enabled'],
    status: 'APPROVED',
    scanStatus: 'CLEAN',
    versionCount: 1,
    uploadedAt: now + 1,
  };

  // 3. Optional Companion Answer Key Asset (in Christian Education department folder)
  let answerKeyAsset: OrgAsset | undefined;
  if (params.rawAnswerKeyText && params.rawAnswerKeyText.trim()) {
    const keyBytes = new TextEncoder().encode(params.rawAnswerKeyText).length;
    answerKeyAsset = {
      id: keyAssetId,
      scopeKind: 'org',
      scopeId: targetOrgId,
      uploadedByUid: uid,
      name: `${params.unitTitle} (Teacher Answer Key).doc`,
      kind: 'doc',
      mimeType: 'text/plain',
      url: `/api/hq/assets/${encodeURIComponent(keyAssetId)}/download`,
      storagePath: `protected-hq/org/${targetOrgId}/${departmentFolder}/${keyAssetId}/${baseSlug}_answer_key.txt`,
      sizeBytes: Math.max(256, keyBytes),
      folder: departmentFolder,
      departmentId: 'dept-christian-education',
      departmentName: departmentFolder,
      assetVariant: 'ANSWER_KEY',
      telaDocId: params.telaDoc.id,
      pairedAssetId: telaAssetId,
      rawContentText: params.rawAnswerKeyText,
      tags: ['Christian Education', 'Answer Key', 'Teacher Only'],
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

  // Also mirror under the canonical Great Faith Ministries ID so opening Great Faith Ministries Content HQ always shows them
  if (targetOrgId !== GREAT_FAITH_MINISTRIES_DEFAULT_ID) {
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
    originalAsset,
    telaAsset,
    answerKeyAsset,
  };
}

/** All Content HQ assets for a scope (client-sorted newest-first, merging Firestore + Great Faith Ministries local mirror + Christian Education ingested units). */
export async function listHqAssets(scope: OwnerScope, includeTrash = false): Promise<OrgAsset[]> {
  const byId = new Map<string, OrgAsset>();

  // 1. Load local mirror for this scope and Great Faith Ministries mirror
  for (const item of readLocalMirrorAssets(scope.id)) {
    if (includeTrash || !item.deletedAt) byId.set(item.id, item);
  }
  for (const item of readLocalMirrorAssets(GREAT_FAITH_MINISTRIES_DEFAULT_ID)) {
    if ((includeTrash || !item.deletedAt) && !byId.has(item.id)) {
      byId.set(item.id, { ...item, scopeId: scope.id });
    }
  }

  // 2. Materialize any ingested Christian Education curriculum units into Content HQ under "Christian Education"
  const unitKeys = Array.from(
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
          const deptFolder = u.departmentFolder || 'Christian Education';
          const origId = u.originalAssetId || `hq_orig_${u.telaDocId}`;
          const telaId = u.telaAssetId || `hq_tela_${u.telaDocId}`;
          const keyId = u.answerKeyAssetId || `hq_key_${u.telaDocId}`;
          const isPdf = u.sourceKind === 'PDF_DOCUMENT';
          const ext = isPdf ? 'pdf' : 'doc';
          const created = Number(u.createdAt) || Date.now();

          if (!byId.has(origId)) {
            byId.set(origId, {
              id: origId,
              scopeKind: 'org',
              scopeId: scope.id,
              uploadedByUid: 'great-faith-admin',
              name: `${u.title} (Original Document).${ext}`,
              kind: isPdf ? 'pdf' : 'doc',
              mimeType: isPdf ? 'application/pdf' : 'text/markdown',
              url: u.sourceUrl || `/api/hq/assets/${encodeURIComponent(origId)}/download`,
              storagePath: `protected-hq/org/${scope.id}/${deptFolder}/${origId}/${u.id}_original.${ext}`,
              sizeBytes: Math.max(1024, (u.rawCurriculumText || u.title).length),
              folder: deptFolder,
              departmentId: 'dept-christian-education',
              departmentName: deptFolder,
              assetVariant: 'ORIGINAL_SOURCE',
              telaDocId: u.telaDocId,
              pairedAssetId: telaId,
              sourceUrl: u.sourceUrl,
              rawContentText: u.rawCurriculumText,
              tags: ['Christian Education', 'Original Source', u.sourceKind || 'DOCUMENT'],
              status: 'APPROVED',
              scanStatus: 'CLEAN',
              versionCount: 1,
              uploadedAt: created,
            });
          }

          if (!byId.has(telaId)) {
            byId.set(telaId, {
              id: telaId,
              scopeKind: 'org',
              scopeId: scope.id,
              uploadedByUid: 'great-faith-admin',
              name: `${u.title} (Interactive Tela Document).tela`,
              kind: 'doc',
              mimeType: 'application/vnd.plajah.tela+json',
              url: `/tela/${encodeURIComponent(u.telaDocId)}`,
              storagePath: `protected-hq/org/${scope.id}/${deptFolder}/${telaId}/${u.id}.tela.json`,
              sizeBytes: Math.max(2048, (u.rawCurriculumText || u.title).length * 2),
              folder: deptFolder,
              departmentId: 'dept-christian-education',
              departmentName: deptFolder,
              assetVariant: 'TELA_DOCUMENT',
              telaDocId: u.telaDocId,
              pairedAssetId: origId,
              sourceUrl: u.sourceUrl,
              rawContentText: u.rawCurriculumText,
              tags: ['Christian Education', 'Interactive Tela Document', 'Mastery Enabled'],
              status: 'APPROVED',
              scanStatus: 'CLEAN',
              versionCount: 1,
              uploadedAt: created + 1,
            });
          }

          if (u.rawAnswerKeyText && !byId.has(keyId)) {
            byId.set(keyId, {
              id: keyId,
              scopeKind: 'org',
              scopeId: scope.id,
              uploadedByUid: 'great-faith-admin',
              name: `${u.title} (Teacher Answer Key).doc`,
              kind: 'doc',
              mimeType: 'text/plain',
              url: `/api/hq/assets/${encodeURIComponent(keyId)}/download`,
              storagePath: `protected-hq/org/${scope.id}/${deptFolder}/${keyId}/${u.id}_answer_key.txt`,
              sizeBytes: Math.max(512, String(u.rawAnswerKeyText).length),
              folder: deptFolder,
              departmentId: 'dept-christian-education',
              departmentName: deptFolder,
              assetVariant: 'ANSWER_KEY',
              telaDocId: u.telaDocId,
              pairedAssetId: telaId,
              rawContentText: u.rawAnswerKeyText,
              tags: ['Christian Education', 'Answer Key', 'Teacher Only'],
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

  // 3. Materialize any volunteer/member department uploads into Content HQ under their department folder
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
            const deptName = up.departmentName || 'Christian Education';
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
              assetVariant: 'ORIGINAL_SOURCE',
              rawContentText: up.notes || up.title,
              tags: [deptName, 'Department Upload'],
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

  // 4. Load Firestore `orgAssets`
  try {
    const snap = await getDocs(query(collection(opsDb, COLLECTION), where('scopeId', '==', scope.id)));
    for (const d of snap.docs) {
      const data = d.data() as OrgAsset;
      if (includeTrash || !data.deletedAt) {
        byId.set(data.id, data);
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
