// stageInbox — the Announcements row in Stage (in-app name for Ambo).
//
// Departments, leadership, volunteers and guest musicians push an image, video or audio track
// from their phone (or the web app) straight into the operator's Announcements strip, with a
// sticky-note instruction attached. The operator opens/closes the inbox, decides per item
// whether the person who sent it may trigger it remotely, and plays it (visuals → program,
// audio → DJ deck). Every arrival is pulled down and copied into the Stage media folder.
//
//   organizations/{orgId}/stageInbox/{itemId}   one uploaded asset + note + status + remote command
//   organizations/{orgId}/stageControl/inbox     { accepting, remoteDefault } — the operator's switch
//   stage-inbox/{orgId}/{uid}/{itemId}/{file}    Storage original (private; bytes stream through
//                                                GET /api/stage/inbox/:orgId/:itemId/file)

import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit,
} from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { db, auth, storage } from '../firebase';

export type StageInboxKind = 'image' | 'video' | 'audio';
export type StageInboxStatus = 'uploading' | 'ready' | 'live' | 'played' | 'dismissed' | 'failed';

export interface StageRemoteCommand {
  action: 'play' | 'stop';
  /** Monotonic per item; the operator only acts on a seq it has not handled yet. */
  seq: number;
  at: number;
  byUid: string;
}

export interface StageInboxItem {
  id: string;
  orgId: string;
  kind: StageInboxKind;
  title: string;
  /** Sticky-note instruction for the operator ("Play right after the offering", "Loop muted"). */
  note?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  /** Department / ministry it came from, or 'leadership' / 'guest'. */
  sourceId: string;
  sourceName: string;
  uploaderUid: string;
  uploaderName: string;
  status: StageInboxStatus;
  progress?: number;
  /** Operator-granted: the uploader may play/stop THIS item from their phone. */
  remoteAllowed: boolean;
  remoteCommand?: StageRemoteCommand;
  createdAt: number;
  updatedAt: number;
}

export interface StageInboxControl {
  accepting: boolean;
  /** New arrivals start with remote control already granted. */
  remoteDefault: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

export const STAGE_INBOX_MAX_BYTES = 4 * 1024 ** 3;
export const LEADERSHIP_SOURCE = { id: 'leadership', name: 'Leadership' };
export const GUEST_SOURCE = { id: 'guest', name: 'Guest musician / speaker' };

const inboxCol = (orgId: string) => collection(db, 'organizations', orgId, 'stageInbox');
const controlDoc = (orgId: string) => doc(db, 'organizations', orgId, 'stageControl', 'inbox');

export function kindForFile(file: { name: string; type: string }): StageInboxKind | null {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/') && !t.includes('svg')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'aif', 'aiff'].includes(ext)) return 'audio';
  return null;
}

/** Storage rules only accept media types, so fill in a sensible one when the phone leaves it blank. */
function mimeFor(file: File, kind: StageInboxKind): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const table: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', aif: 'audio/aiff', aiff: 'audio/aiff',
  };
  return table[ext] || (kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'audio/mpeg');
}

// ── Operator switch ────────────────────────────────────────────────────────

export function listenToStageInboxControl(orgId: string, cb: (c: StageInboxControl) => void): () => void {
  return onSnapshot(controlDoc(orgId),
    snap => cb({ accepting: false, remoteDefault: false, ...(snap.data() as Partial<StageInboxControl> | undefined) }),
    () => cb({ accepting: false, remoteDefault: false }));
}

export async function setStageInboxControl(orgId: string, patch: Partial<StageInboxControl>): Promise<void> {
  await setDoc(controlDoc(orgId), { ...patch, updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || '' }, { merge: true });
}

// ── Items ──────────────────────────────────────────────────────────────────

/** Everything that is still actionable in the operator's row (newest first). */
export function listenToStageInbox(orgId: string, cb: (items: StageInboxItem[]) => void): () => void {
  const q = query(inboxCol(orgId), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(q,
    snap => cb(snap.docs.map(d => d.data() as StageInboxItem).filter(i => i.status !== 'dismissed')),
    () => cb([]));
}

/** The sender's own submissions (their phone view). */
export function listenToMyStageUploads(orgId: string, uid: string, cb: (items: StageInboxItem[]) => void): () => void {
  const q = query(inboxCol(orgId), where('uploaderUid', '==', uid), limit(40));
  return onSnapshot(q,
    snap => cb(snap.docs.map(d => d.data() as StageInboxItem).sort((a, b) => b.createdAt - a.createdAt)),
    () => cb([]));
}

export interface StageUploadInput {
  orgId: string;
  file: File;
  title: string;
  note?: string;
  source: { id: string; name: string };
  remoteDefault?: boolean;
}

/**
 * Create the item (status 'uploading', so the operator's row lights up immediately), stream the
 * file to Storage, then flip it to 'ready'. Returns the item id; progress is mirrored onto the doc
 * at most every ~10% so the operator sees it fill without a write per chunk.
 */
export async function uploadToStageInbox(input: StageUploadInput, onProgress?: (pct: number) => void): Promise<string> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to send media to Stage.');
  const kind = kindForFile(input.file);
  if (!kind) throw new Error('Only images, videos and audio tracks can be sent to Stage.');
  if (input.file.size > STAGE_INBOX_MAX_BYTES) throw new Error('That file is over the 4 GB limit.');

  const itemRef = doc(inboxCol(input.orgId));
  const safe = input.file.name.replace(/[^\w.\-]+/g, '_') || `${kind}`;
  const storagePath = `stage-inbox/${input.orgId}/${user.uid}/${itemRef.id}/${safe}`;
  const mimeType = mimeFor(input.file, kind);
  const now = Date.now();
  const item: StageInboxItem = {
    id: itemRef.id, orgId: input.orgId, kind,
    title: input.title.trim().slice(0, 120) || input.file.name.replace(/\.[^.]+$/, ''),
    ...(input.note?.trim() ? { note: input.note.trim().slice(0, 600) } : {}),
    fileName: input.file.name, mimeType, sizeBytes: input.file.size, storagePath,
    sourceId: input.source.id, sourceName: input.source.name,
    uploaderUid: user.uid, uploaderName: user.displayName || user.email?.split('@')[0] || 'Member',
    status: 'uploading', progress: 0, remoteAllowed: !!input.remoteDefault,
    createdAt: now, updatedAt: now,
  };
  await setDoc(itemRef, item);

  let lastMirrored = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, storagePath), input.file, { contentType: mimeType, customMetadata: { ownerUid: user.uid } });
      task.on('state_changed', s => {
        const pct = s.totalBytes ? (s.bytesTransferred / s.totalBytes) * 100 : 0;
        onProgress?.(pct);
        if (pct - lastMirrored >= 10 && pct < 100) {
          lastMirrored = pct;
          updateDoc(itemRef, { progress: Math.round(pct), updatedAt: Date.now() }).catch(() => {});
        }
      }, reject, () => resolve());
    });
  } catch (e) {
    await updateDoc(itemRef, { status: 'failed', updatedAt: Date.now() }).catch(() => {});
    throw e;
  }
  await updateDoc(itemRef, { status: 'ready', progress: 100, updatedAt: Date.now() });
  return itemRef.id;
}

/** Operator-side status / permission changes. */
export async function updateStageInboxItem(orgId: string, id: string, patch: Partial<Pick<StageInboxItem, 'status' | 'remoteAllowed'>>): Promise<void> {
  await updateDoc(doc(inboxCol(orgId), id), { ...patch, updatedAt: Date.now() });
}

/** Presenter's phone: play / stop the one item they were granted. */
export async function sendStageRemoteCommand(item: StageInboxItem, action: StageRemoteCommand['action']): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  if (!item.remoteAllowed) throw new Error('The Stage operator has not given you control of this item.');
  const cmd: StageRemoteCommand = { action, seq: (item.remoteCommand?.seq || 0) + 1, at: Date.now(), byUid: uid };
  await updateDoc(doc(inboxCol(item.orgId), item.id), { remoteCommand: cmd, updatedAt: Date.now() });
}

/** The sender can withdraw their own item (the operator dismisses instead). */
export async function withdrawStageUpload(item: StageInboxItem): Promise<void> {
  await deleteDoc(doc(inboxCol(item.orgId), item.id));
}

/** Pull the original through the authorized server route (Storage stays private, no bucket CORS needed). */
export async function fetchStageInboxBlob(item: StageInboxItem, signal?: AbortSignal): Promise<Blob> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/stage/inbox/${encodeURIComponent(item.orgId)}/${encodeURIComponent(item.id)}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!res.ok) throw new Error(res.status === 403 ? 'Not allowed to open this upload.' : `Download failed (${res.status}).`);
  return res.blob();
}

/** Link + QR target for phones: opens the uploader for this org. */
export function stageUploadLink(orgId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com';
  return `${origin}/?stageUpload=${encodeURIComponent(orgId)}`;
}
