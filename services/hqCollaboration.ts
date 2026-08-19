import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import { createNotification } from './backendService';
import type {
  HqActivityEvent, HqAssetStatus, HqAssetVersion, HqComment, HqReviewDecision,
  HqReviewRequest, HqShareLink,
} from '../types';
import type { OrgAsset, OwnerScope } from './orgAssets';

const now = () => Date.now();
const clean = <T extends Record<string, any>>(value: T): T => Object.fromEntries(
  Object.entries(value).filter(([, v]) => v !== undefined),
) as T;

async function actor() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to collaborate in Content HQ.');
  return { uid: user.uid, name: user.displayName || user.email || 'Plajah member', photo: user.photoURL || '' };
}

export async function recordHqActivity(
  asset: Pick<OrgAsset, 'id' | 'scopeKind' | 'scopeId'>,
  action: HqActivityEvent['action'],
  meta?: HqActivityEvent['meta'],
): Promise<void> {
  const a = await actor();
  const out = doc(collection(db, 'hqActivity'));
  await setDoc(out, clean({ id: out.id, assetId: asset.id, scopeKind: asset.scopeKind, scopeId: asset.scopeId,
    actorUid: a.uid, actorName: a.name, action, meta, createdAt: now() }));
}

export async function listHqVersions(assetId: string): Promise<HqAssetVersion[]> {
  const snap = await getDocs(query(collection(db, 'hqAssetVersions'), where('assetId', '==', assetId), orderBy('version', 'desc')));
  return snap.docs.map(d => d.data() as HqAssetVersion);
}

export async function addHqVersion(asset: OrgAsset, file: File, changeNote?: string, onProgress?: (n: number) => void): Promise<HqAssetVersion> {
  const a = await actor();
  const versions = await listHqVersions(asset.id);
  const number = (versions[0]?.version || asset.versionCount || 0) + 1;
  const versionRef = doc(collection(db, 'hqAssetVersions'));
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const storagePath = `protected-hq/${asset.scopeKind}/${asset.scopeId}/${asset.id}/v${number}_${safe}`;
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: file.type || 'application/octet-stream' });
    task.on('state_changed', s => onProgress?.((s.bytesTransferred / s.totalBytes) * 100), reject, () => resolve());
  });
  const version: HqAssetVersion = clean({ id: versionRef.id, assetId: asset.id, version: number, storagePath,
    name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size,
    uploadedByUid: a.uid, uploadedByName: a.name, createdAt: now(), changeNote });
  await setDoc(versionRef, version);
  await updateDoc(doc(db, 'orgAssets', asset.id), { currentVersionId: version.id, versionCount: number,
    status: 'DRAFT', sizeBytes: file.size, mimeType: version.mimeType, name: file.name });
  await recordHqActivity(asset, 'NEW_VERSION', { version: number, name: file.name });
  return version;
}

export async function listHqComments(assetId: string): Promise<HqComment[]> {
  const snap = await getDocs(query(collection(db, 'hqComments'), where('assetId', '==', assetId), orderBy('createdAt', 'asc')));
  return snap.docs.map(d => d.data() as HqComment);
}

export async function addHqComment(input: Omit<HqComment, 'id' | 'authorUid' | 'authorName' | 'authorPhoto' | 'resolved' | 'createdAt'>, asset: OrgAsset): Promise<HqComment> {
  const a = await actor();
  if (!input.body.trim()) throw new Error('Write a comment first.');
  const out = doc(collection(db, 'hqComments'));
  const comment = clean({ ...input, id: out.id, authorUid: a.uid, authorName: a.name, authorPhoto: a.photo,
    body: input.body.trim().slice(0, 4000), resolved: false, createdAt: now() }) as HqComment;
  await setDoc(out, comment);
  await recordHqActivity(asset, 'COMMENTED', { versionId: input.versionId, timeStartSeconds: input.timeStartSeconds ?? null });
  return comment;
}

export async function resolveHqComment(comment: HqComment, asset: OrgAsset): Promise<void> {
  const a = await actor();
  await updateDoc(doc(db, 'hqComments', comment.id), { resolved: true, resolvedAt: now(), resolvedByUid: a.uid });
  await recordHqActivity(asset, 'COMMENT_RESOLVED', { commentId: comment.id });
}

export async function listHqReviews(assetId: string): Promise<HqReviewRequest[]> {
  const snap = await getDocs(query(collection(db, 'hqReviewRequests'), where('assetId', '==', assetId), orderBy('createdAt', 'desc'), limit(25)));
  return snap.docs.map(d => d.data() as HqReviewRequest);
}

export async function requestHqReview(asset: OrgAsset, reviewerUids: string[], deadlineAt?: number, message?: string): Promise<HqReviewRequest> {
  const a = await actor();
  if (!asset.currentVersionId) throw new Error('This asset has no reviewable version.');
  const ids = [...new Set(reviewerUids.map(x => x.trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Add at least one reviewer.');
  const out = doc(collection(db, 'hqReviewRequests'));
  const decisions = Object.fromEntries(ids.map(id => [id, 'PENDING' as HqReviewDecision]));
  const review = clean({ id: out.id, assetId: asset.id, versionId: asset.currentVersionId,
    requestedByUid: a.uid, reviewerUids: ids, decisions, deadlineAt, message, status: 'OPEN', createdAt: now() }) as HqReviewRequest;
  await setDoc(out, review);
  await updateDoc(doc(db, 'orgAssets', asset.id), { status: 'IN_REVIEW' satisfies HqAssetStatus });
  await recordHqActivity(asset, 'REVIEW_REQUESTED', { reviewId: out.id, reviewerCount: ids.length });
  await Promise.all(ids.filter(id => id !== a.uid).map(userId => createNotification({ userId, senderId: a.uid,
    senderName: a.name, senderPhoto: a.photo, type: 'CONTENT', title: 'Review requested',
    message: `${a.name} asked you to review ${asset.name}.`, targetId: asset.id, link: `content-hq:${asset.id}` })));
  return review;
}

export async function decideHqReview(review: HqReviewRequest, asset: OrgAsset, decision: Exclude<HqReviewDecision, 'PENDING'>): Promise<void> {
  const a = await actor();
  if (!review.reviewerUids.includes(a.uid) && review.requestedByUid !== a.uid) throw new Error('You are not a reviewer.');
  const decisions = { ...review.decisions, [a.uid]: decision };
  const values = Object.values(decisions);
  const status = values.includes('CHANGES_REQUESTED') ? 'CHANGES_REQUESTED'
    : values.every(x => x === 'APPROVED') ? 'APPROVED' : 'OPEN';
  await updateDoc(doc(db, 'hqReviewRequests', review.id), clean({ decisions, status,
    completedAt: status === 'OPEN' ? undefined : now() }));
  if (status !== 'OPEN') await updateDoc(doc(db, 'orgAssets', asset.id), clean({ status,
    approvedAt: status === 'APPROVED' ? now() : undefined, approvedByUid: status === 'APPROVED' ? a.uid : undefined }));
  await recordHqActivity(asset, decision === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED', { reviewId: review.id });
}

export async function setHqAssetStatus(asset: OrgAsset, status: HqAssetStatus): Promise<void> {
  await updateDoc(doc(db, 'orgAssets', asset.id), { status });
  if (status === 'DELIVERED') await recordHqActivity(asset, 'DELIVERED');
}

export async function trashHqAsset(asset: OrgAsset): Promise<void> {
  const a = await actor();
  await updateDoc(doc(db, 'orgAssets', asset.id), { deletedAt: now(), deletedByUid: a.uid,
    retentionDeleteAt: now() + 30 * 24 * 60 * 60 * 1000 });
  await recordHqActivity(asset, 'TRASHED');
}

export async function restoreHqAsset(asset: OrgAsset): Promise<void> {
  await updateDoc(doc(db, 'orgAssets', asset.id), { deletedAt: null, deletedByUid: null, retentionDeleteAt: null });
  await recordHqActivity(asset, 'RESTORED');
}

export async function listHqActivity(assetId: string): Promise<HqActivityEvent[]> {
  const snap = await getDocs(query(collection(db, 'hqActivity'), where('assetId', '==', assetId), orderBy('createdAt', 'desc'), limit(100)));
  return snap.docs.map(d => d.data() as HqActivityEvent);
}

export async function updateHqRights(asset: OrgAsset, rights: OrgAsset['rights']): Promise<void> {
  await updateDoc(doc(db, 'orgAssets', asset.id), { rights: clean(rights || {}) });
  await recordHqActivity(asset, 'RIGHTS_UPDATED');
}

export async function createHqShareLink(asset: OrgAsset, options?: Partial<Pick<HqShareLink, 'allowComments' | 'allowApproval' | 'allowDownload' | 'requireEmail' | 'expiresAt' | 'label'>>): Promise<{ share: HqShareLink; token: string }> {
  const a = await actor();
  const raw = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(raw, b => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const out = doc(collection(db, 'hqShareLinks'));
  const share: HqShareLink = clean({ id: out.id, assetId: asset.id, scopeKind: asset.scopeKind, scopeId: asset.scopeId,
    tokenHash, createdByUid: a.uid, allowComments: options?.allowComments ?? true,
    allowApproval: options?.allowApproval ?? true,
    allowDownload: options?.allowDownload ?? false, requireEmail: options?.requireEmail ?? false,
    expiresAt: options?.expiresAt, label: options?.label, createdAt: now() });
  await setDoc(out, share);
  await recordHqActivity(asset, 'SHARED', { shareId: out.id });
  return { share, token };
}

/** Owner-only: revoke a share/review link. Every guest endpoint re-checks `revokedAt` server-side. */
export async function revokeHqShareLink(asset: OrgAsset, shareId: string): Promise<void> {
  await updateDoc(doc(db, 'hqShareLinks', shareId), { revokedAt: now() });
  await recordHqActivity(asset, 'SHARED', { shareId, revoked: true });
}

/** List a scope's share links so the owner can copy or revoke them. */
export async function listHqShareLinks(assetId: string): Promise<HqShareLink[]> {
  const snap = await getDocs(query(collection(db, 'hqShareLinks'), where('assetId', '==', assetId), orderBy('createdAt', 'desc'), limit(25)));
  return snap.docs.map(d => d.data() as HqShareLink);
}

export async function fetchHqAsset(assetId: string): Promise<OrgAsset | null> {
  const snap = await getDoc(doc(db, 'orgAssets', assetId));
  return snap.exists() ? snap.data() as OrgAsset : null;
}

export function authenticatedHqDownloadUrl(assetId: string, versionId?: string): string {
  const query = versionId ? `?version=${encodeURIComponent(versionId)}` : '';
  return `/api/hq/assets/${encodeURIComponent(assetId)}/download${query}`;
}

