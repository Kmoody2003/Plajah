// Reello background upload queue — one queue for the whole app session, so uploads keep going after
// the uploader closes and the creator moves on.
//
// Three ways in:
//   • 'direct' — up to MAX_DIRECT_FILES picked or dropped. YouTube-style: the bytes start moving the
//     moment the file is chosen (as a PRIVATE draft), while the creator fills in details; Publish
//     applies the details + visibility (waiting for the upload to land if it hasn't yet).
//   • 'folder' — a folder chosen for a batch: details from its template, visibility from the template
//     or the account default, published as each finishes.
//   • 'watch'  — files that appeared in a watch folder: same as 'folder'.
// Two uploads run at a time; the rest wait their turn. Story Intelligence is requested per video
// once it's published (the server waits for the transcode on its own).

import { uploadVideo, updateVideoSettings, uploadImageWithDerivatives, notifyFollowers, auth } from '../backendService';
import { requestIntel } from './reelloApi';
import type { IntelOptions } from './intel/types';
import type { UploadVisibility } from './uploadPrefs';

export type QueueSource = 'direct' | 'folder' | 'watch';
export type QueueStatus = 'QUEUED' | 'UPLOADING' | 'AWAITING_DETAILS' | 'PUBLISHING' | 'DONE' | 'ERROR' | 'CANCELLED';

export interface UploadDetails {
  title: string;
  description: string;
  tags: string[];
  genre: string;
  visibility: UploadVisibility;
  thumbnail?: Blob | null;
  storyIntel: boolean;
  intel: IntelOptions;
}

export interface QueueItem {
  id: string;
  file: File;
  source: QueueSource;
  /** Watch/batch folder this came from, and the file's dedupe key there. */
  folderId?: string;
  folderName?: string;
  fileKey?: string;
  details: UploadDetails;
  /** direct uploads hold for Publish; folder/watch uploads publish as they finish. */
  committed: boolean;
  status: QueueStatus;
  progress: number;
  videoId?: string;
  intelRequested?: boolean;
  error?: string;
  addedAt: number;
}

const CONCURRENCY = 2;
const items: QueueItem[] = [];
const listeners = new Set<(items: QueueItem[]) => void>();
const doneHooks = new Set<(item: QueueItem) => void>();
let active = 0;

const emit = () => { const snap = items.map(i => ({ ...i })); listeners.forEach(l => { try { l(snap); } catch { /* */ } }); };
const patch = (id: string, p: Partial<QueueItem>) => { const it = items.find(i => i.id === id); if (it) { Object.assign(it, p); emit(); } };

export function subscribeQueue(fn: (items: QueueItem[]) => void): () => void {
  listeners.add(fn); fn(items.map(i => ({ ...i })));
  return () => { listeners.delete(fn); };
}
/** Called once per item when it's fully done (folder runners mark the file seen here). */
export function onItemDone(fn: (item: QueueItem) => void): () => void { doneHooks.add(fn); return () => { doneHooks.delete(fn); }; }

export const queueItems = () => items.map(i => ({ ...i }));
/** Already handled this session — including failed or cancelled ones, which wait for a manual retry
 *  rather than being re-taken every scan. */
export const isQueued = (folderId: string, fileKey: string) => items.some(i => i.folderId === folderId && i.fileKey === fileKey);

export function enqueueUpload(input: { file: File; source: QueueSource; details: UploadDetails; folderId?: string; folderName?: string; fileKey?: string }): string {
  const id = `ru_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  items.push({ ...input, id, committed: input.source !== 'direct', status: 'QUEUED', progress: 0, addedAt: Date.now() });
  emit(); pump();
  return id;
}

/** Edit a waiting/uploading item's details (the direct-upload details form writes through here). */
export function updateDetails(id: string, d: Partial<UploadDetails>) {
  const it = items.find(i => i.id === id); if (!it) return;
  it.details = { ...it.details, ...d }; emit();
}

/** Publish a direct upload with its details. If the bytes are still moving it publishes on landing. */
export function commitUpload(id: string, d?: Partial<UploadDetails>) {
  const it = items.find(i => i.id === id); if (!it) return;
  if (d) it.details = { ...it.details, ...d };
  it.committed = true; emit();
  if (it.status === 'AWAITING_DETAILS') void finalize(it);
}

export function cancelUpload(id: string) {
  const it = items.find(i => i.id === id); if (!it) return;
  if (it.status === 'QUEUED') { it.status = 'CANCELLED'; emit(); }
}
export function retryUpload(id: string) {
  const it = items.find(i => i.id === id); if (!it || it.status !== 'ERROR') return;
  Object.assign(it, { status: it.videoId ? 'AWAITING_DETAILS' : 'QUEUED', error: undefined, progress: it.videoId ? 100 : 0 });
  emit();
  if (it.videoId) { if (it.committed) void finalize(it); } else pump();
}
export function clearFinished() {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].status === 'DONE' || items[i].status === 'CANCELLED') items.splice(i, 1);
  emit();
}

function pump() {
  while (active < CONCURRENCY) {
    const next = items.find(i => i.status === 'QUEUED');
    if (!next) return;
    active++;
    void run(next).finally(() => { active--; pump(); });
  }
}

async function run(it: QueueItem) {
  patch(it.id, { status: 'UPLOADING', progress: 0 });
  try {
    // A direct upload lands PRIVATE until Publish; folder/watch uploads land with their real visibility.
    const goPublicNow = it.committed && it.details.visibility === 'PUBLIC';
    const v = await uploadVideo({
      title: it.details.title || it.file.name, description: it.details.description, genre: it.details.genre || 'General',
      tags: it.details.tags, isRello: true, isPrivate: !goPublicNow, file: it.file,
      ...(it.committed && it.details.thumbnail ? { thumbnailFile: new File([it.details.thumbnail], 'thumb.jpg', { type: 'image/jpeg' }) } : {}),
    } as any, p => patch(it.id, { progress: Math.round(p) }));
    patch(it.id, { videoId: v.id, progress: 100, status: 'AWAITING_DETAILS' });
    if (it.committed) await finalize(it, { alreadyApplied: true });
  } catch (e: any) {
    patch(it.id, { status: 'ERROR', error: e?.message || 'Upload failed' });
  }
}

async function finalize(it: QueueItem, o: { alreadyApplied?: boolean } = {}) {
  if (!it.videoId) return;
  patch(it.id, { status: 'PUBLISHING' });
  try {
    if (!o.alreadyApplied) {
      let thumbnailUrl: string | undefined;
      if (it.details.thumbnail) {
        const img = await uploadImageWithDerivatives(`videos/${it.videoId}/thumb_${Date.now().toString(36)}`, new File([it.details.thumbnail], 'thumb.jpg', { type: 'image/jpeg' }));
        thumbnailUrl = img.display;
      }
      const isPrivate = it.details.visibility !== 'PUBLIC';
      await updateVideoSettings(it.videoId, {
        title: it.details.title.slice(0, 180) || it.file.name, description: it.details.description, tags: it.details.tags,
        genre: it.details.genre || 'General', isPrivate, ...(thumbnailUrl ? { thumbnailUrl } : {}),
      } as any);
      // Went public on Publish, so uploadVideo's own follower notice (skipped for the private draft) goes out here.
      const u = auth.currentUser;
      if (!isPrivate && u) void Promise.resolve(notifyFollowers(u.uid, 'CONTENT', 'New Video', `${u.displayName || 'A creator'} posted a new video: ${it.details.title}`, 'FEED', it.videoId, { highlight: true })).catch(() => {});
    }
    if (it.details.storyIntel && !it.intelRequested) {
      await requestIntel(it.videoId, it.details.intel).then(() => patch(it.id, { intelRequested: true })).catch(e => patch(it.id, { error: `Story Intelligence: ${e?.message || e}` }));
    }
    patch(it.id, { status: 'DONE' });
    const done = items.find(i => i.id === it.id);
    if (done) doneHooks.forEach(h => { try { h({ ...done }); } catch { /* */ } });
  } catch (e: any) {
    patch(it.id, { status: 'ERROR', error: e?.message || 'Publish failed' });
  }
}
