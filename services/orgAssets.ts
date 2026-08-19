import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { db, auth, storage } from './firebase';

// ─────────────────────────────────────────────────────────────────────────
// Org / per-account private Digital Asset Manager (Content HQ).
//
// Arbitrary files (brand specs, documents, PDFs, images, media) held privately
// for an ORG (scopeKind 'org', scopeId = organization id) or a single ACCOUNT
// (scopeKind 'user', scopeId = uid). Access control lives on the Firestore
// `orgAssets` docs (rules gate reads/writes to the scope's admins/owner); the
// Storage originals are private and are streamed through the authorized server
// endpoint. Distinct from the cross-service media library (published
// albums/videos) that ContentAssetManager already surfaces.
// ─────────────────────────────────────────────────────────────────────────

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
  tags?: string[];
  status?: import('../types').HqAssetStatus;
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

/** All Content HQ assets for a scope (client-sorted newest-first to avoid a composite index). */
export async function listHqAssets(scope: OwnerScope, includeTrash = false): Promise<OrgAsset[]> {
  const snap = await getDocs(query(collection(db, COLLECTION), where('scopeId', '==', scope.id)));
  const rows = snap.docs.map((d) => d.data() as OrgAsset).filter(a => includeTrash || !a.deletedAt);
  return rows.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
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
  const id = doc(collection(db, COLLECTION)).id;
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const storagePath = `protected-hq/${scope.kind}/${scope.id}/${id}/${safe}`;
  const storageRef = ref(storage, storagePath);
  const mimeType = contentTypeFor(file);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: mimeType });
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
    versionCount: 1,
    uploadedAt: Date.now(),
  };
  const versionRef = doc(collection(db, 'hqAssetVersions'));
  asset.currentVersionId = versionRef.id;
  await setDoc(doc(db, COLLECTION, id), asset);
  await setDoc(versionRef, {
    id: versionRef.id, assetId: id, version: 1, storagePath, name: file.name,
    mimeType, sizeBytes: file.size, uploadedByUid: uid, createdAt: Date.now(),
  });
  return asset;
}

/** Move an asset to a different folder (or clear it). */
export async function setHqAssetFolder(asset: OrgAsset, folder: string | undefined): Promise<void> {
  await setDoc(doc(db, COLLECTION, asset.id), { folder: folder || null }, { merge: true });
}

/** Delete an asset's Firestore record + its Storage object (best-effort). */
export async function deleteHqAsset(asset: OrgAsset): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, asset.id));
  try { await deleteObject(ref(storage, asset.storagePath)); } catch { /* object may already be gone */ }
}

export function humanFileSize(b: number): string {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
