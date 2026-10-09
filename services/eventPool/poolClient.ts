// poolClient — browser side of Event Photo Pools v2: API calls, reading capture time/place from picked files,
// scrubbing location metadata, uploading to Storage (resumable within the session), and posting item metadata.
//
// Files go to `personal/{uid}/event-pools/{poolId}/…` (storage.rules: owner-only read + write). Public items are shown
// to others through their tokenized download URL, which the server only hands out while the item is public.
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, storage } from '../firebase';
import {
  checkMediaFile, mediaKind, normalizeMime, matchesEvent, parseExifDateTime, poolStoragePrefix,
  type MatchResult, type PoolView, type PoolItem, type ItemVisibility, type LatLng, type PoolOverrides, type MatchState,
} from './poolCore';
import { readJpegMeta, scrubJpegLocation, readMp4Meta, mp4LocationPatchOffsets, hasEmbeddedMetadataChunk, FREE_BOX_TYPE, type ReadAt } from './exif';

export type PoolItemView = Omit<PoolItem, 'storagePaths' | 'hiddenBy' | 'hiddenByHost'> & { mine: boolean; storagePaths?: string[]; hiddenByHost?: boolean };
export interface Attendee { uid: string; name?: string; photoURL?: string; at: number; method: 'geo' | 'host' }

// ── API ─────────────────────────────────────────────────────────────────────

export class PoolApiError extends Error {
  constructor(message: string, public status: number, public data: any) { super(message); }
}

async function call<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; auth?: 'optional' | 'required' } = {}): Promise<T> {
  let token: string | undefined;
  try { token = await auth.currentUser?.getIdToken(); } catch { token = undefined; }
  if (opts.auth === 'required' && !token) throw new PoolApiError('Sign in first.', 401, { code: 'SIGNED_OUT' });
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PoolApiError(data?.error || 'Something went wrong. Try again.', res.status, data);
  return data as T;
}

const P = (poolId: string) => `/api/pool/${encodeURIComponent(poolId)}`;
const I = (poolId: string, itemId: string) => `${P(poolId)}/items/${encodeURIComponent(itemId)}`;

export const poolApi = {
  /** Create-or-return the pool for an evite (host / co-host) or a ticketed event (organiser). Idempotent. */
  ensure: (target: { eviteId: string } | { eventId: string }) => call<{ poolId: string; created: boolean }>('/api/pool/ensure', { method: 'POST', body: target, auth: 'required' }),
  get: async (poolId: string) => (await call<{ pool: PoolView }>(P(poolId))).pool,
  items: async (poolId: string, scope: 'public' | 'mine') => (await call<{ items: PoolItemView[] }>(`${P(poolId)}/items?scope=${scope}`, { auth: scope === 'mine' ? 'required' : 'optional' })).items,
  checkIn: (poolId: string, pos: { lat: number; lng: number; accuracy?: number }) =>
    call<{ checkedIn: true; at: number; pool: PoolView }>(`${P(poolId)}/checkin`, { method: 'POST', body: pos, auth: 'required' }),
  check: (poolId: string, hashes: string[]) => call<{ mine: string[]; pool: string[] }>(`${P(poolId)}/check`, { method: 'POST', body: { hashes }, auth: 'required' }),
  addItem: (poolId: string, body: Record<string, unknown>) => call<{ item: PoolItemView; duplicate?: boolean }>(`${P(poolId)}/items`, { method: 'POST', body, auth: 'required' }),
  setVisibility: async (poolId: string, itemId: string, visibility: ItemVisibility) => (await call<{ item: PoolItemView }>(`${I(poolId, itemId)}/visibility`, { method: 'POST', body: { visibility }, auth: 'required' })).item,
  hide: async (poolId: string, itemId: string, hidden: boolean) => (await call<{ item: PoolItemView }>(`${I(poolId, itemId)}/hide`, { method: 'POST', body: { hidden }, auth: 'required' })).item,
  remove: (poolId: string, itemId: string) => call<{ ok: true; storagePaths: string[] }>(`${I(poolId, itemId)}/delete`, { method: 'POST', body: {}, auth: 'required' }),
  attachStream: async (poolId: string, streamId: string, attach = true) => (await call<{ pool: PoolView }>(`${P(poolId)}/streams`, { method: 'POST', body: { streamId, attach }, auth: 'required' })).pool,
  attendance: (poolId: string) => call<{ attendees: Attendee[]; count: number }>(`${P(poolId)}/attendance`, { method: 'POST', body: {}, auth: 'required' }),
  settings: async (poolId: string, patch: { visibility?: PoolView['visibility']; uploadPolicy?: PoolView['uploadPolicy']; overrides?: PoolOverrides & { clearPlace?: boolean; clearTime?: boolean } }) =>
    (await call<{ pool: PoolView }>(`${P(poolId)}/settings`, { method: 'POST', body: patch, auth: 'required' })).pool,
};

/** Delete an item: the server drops the record and returns its storage paths, which only the owner can delete. */
export async function deletePoolItem(poolId: string, itemId: string): Promise<void> {
  const { storagePaths } = await poolApi.remove(poolId, itemId);
  await Promise.all((storagePaths || []).map(p => deleteObject(ref(storage, p)).catch(() => undefined)));
}

// ── reading picked files ────────────────────────────────────────────────────

export interface PreparedMedia {
  key: string;
  file: File;
  name: string;
  kind: 'photo' | 'video' | null;
  mime: string;
  size: number;
  error?: string;
  takenAt?: number;
  takenAtSource: PoolItem['takenAtSource'];
  gps?: LatLng | null;
  match: MatchResult;
  /** Object URL for a quick preview (photos only); revoke with releasePrepared. */
  previewUrl?: string;
}

const readAtOf = (blob: Blob): ReadAt => async (o, n) => new Uint8Array(await blob.slice(o, o + n).arrayBuffer());
/** iOS Safari stamps photo-library picks with "now"; treat a lastModified that close to now as unknown. */
const FRESH_FILE_MS = 5 * 60 * 1000;

export async function prepareFile(file: File, pool: Pick<PoolView, 'window' | 'fence' | 'timezone'>, now = Date.now()): Promise<PreparedMedia> {
  const mime = normalizeMime(file.type, file.name);
  const kind = mediaKind(mime, file.name);
  const base: PreparedMedia = { key: `${file.name}:${file.size}:${file.lastModified}`, file, name: file.name, kind, mime, size: file.size, takenAtSource: 'none', match: { match: false, time: 'unknown', place: 'unknown', why: '' } };
  const err = checkMediaFile({ type: mime, size: file.size, name: file.name });
  if (err) return { ...base, error: err, match: { ...base.match, why: err } };
  let takenAt: number | undefined, src: PoolItem['takenAtSource'] = 'none', gps: LatLng | undefined;
  try {
    if (mime === 'image/jpeg') {
      const m = readJpegMeta(new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer()));
      takenAt = parseExifDateTime(m.dateTimeOriginal, m.offsetTimeOriginal, pool.timezone);
      if (takenAt) src = 'exif';
      gps = m.gps;
    } else if (mime === 'video/mp4' || mime === 'video/quicktime') {
      const m = await readMp4Meta(readAtOf(file), file.size);
      if (m.createdAt) { takenAt = m.createdAt; src = 'video'; }
      gps = m.gps;
    }
  } catch { /* unreadable metadata is just "unknown" */ }
  if (!takenAt && file.lastModified && Math.abs(now - file.lastModified) > FRESH_FILE_MS) { takenAt = file.lastModified; src = 'file'; }
  const match = matchesEvent({ takenAt, takenAtSource: src, gps }, { window: pool.window, fence: pool.fence });
  return { ...base, takenAt, takenAtSource: src, gps: gps || null, match, previewUrl: kind === 'photo' ? URL.createObjectURL(file) : undefined };
}

export function releasePrepared(list: PreparedMedia[]) { for (const p of list) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); }

/** SHA-256 of the file (≤ 64 MB) or of its size + three 4 MB samples (larger videos), as lowercase hex. */
export async function hashFile(file: Blob): Promise<string> {
  const LIMIT = 64 * 1024 * 1024, SAMPLE = 4 * 1024 * 1024;
  let data: ArrayBuffer;
  if (file.size <= LIMIT) data = await file.arrayBuffer();
  else {
    const mid = Math.floor(file.size / 2 - SAMPLE / 2);
    const parts = await Promise.all([file.slice(0, SAMPLE), file.slice(mid, mid + SAMPLE), file.slice(file.size - SAMPLE)].map(b => b.arrayBuffer()));
    const head = new TextEncoder().encode(`plajah-pool-sample:${file.size}:`);
    const all = new Uint8Array(head.length + parts.reduce((n, p) => n + p.byteLength, 0));
    let o = 0; all.set(head, o); o += head.length;
    for (const p of parts) { all.set(new Uint8Array(p), o); o += p.byteLength; }
    data = all.buffer;
  }
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── location scrubbing ──────────────────────────────────────────────────────

const toBlob = (bytes: Uint8Array, type: string) => new Blob([bytes as unknown as BlobPart], { type });

async function reencodeJpeg(file: Blob): Promise<Blob | null> {
  let bmp: ImageBitmap | null = null;
  try {
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); } catch { bmp = await createImageBitmap(file); }
    const scale = Math.min(1, 8192 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>(r => c.toBlob(b => r(b), 'image/jpeg', 0.92));
  } catch { return null; } finally { try { bmp?.close(); } catch { /* */ } }
}

/** A copy of the photo without location metadata. `scrubbed: false` means we could not (it then stays private-only). */
export async function scrubPhoto(file: File, mime: string): Promise<{ blob: Blob; mime: string; ext: string; scrubbed: boolean }> {
  if (mime === 'image/jpeg') {
    const { bytes } = scrubJpegLocation(new Uint8Array(await file.arrayBuffer()));
    const ok = !readJpegMeta(bytes).gps;
    return { blob: toBlob(bytes, 'image/jpeg'), mime: 'image/jpeg', ext: 'jpg', scrubbed: ok };
  }
  const extOf: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  if (extOf[mime]) {
    if (!hasEmbeddedMetadataChunk(new Uint8Array(await file.arrayBuffer()))) return { blob: file, mime, ext: extOf[mime], scrubbed: true };
    const re = await reencodeJpeg(file);
    return re ? { blob: re, mime: 'image/jpeg', ext: 'jpg', scrubbed: true } : { blob: file, mime, ext: extOf[mime], scrubbed: false };
  }
  // HEIC/HEIF: only browsers that decode it (Safari) can convert; elsewhere it stays private-only.
  const re = await reencodeJpeg(file);
  return re ? { blob: re, mime: 'image/jpeg', ext: 'jpg', scrubbed: true } : { blob: file, mime, ext: mime === 'image/heif' ? 'heif' : 'heic', scrubbed: false };
}

/** MP4/MOV: rename moov/trak `udta` + `meta` boxes to `free` (4-byte in-place patches; nothing is re-muxed). */
export async function scrubVideo(file: File, mime: string): Promise<{ blob: Blob; scrubbed: boolean }> {
  if (mime === 'video/webm') return { blob: file, scrubbed: true };
  const offsets = (await mp4LocationPatchOffsets(readAtOf(file), file.size).catch(() => [] as number[])).sort((a, b) => a - b);
  const parts: BlobPart[] = [];
  let at = 0;
  for (const o of offsets) { parts.push(file.slice(at, o), FREE_BOX_TYPE as unknown as BlobPart); at = o + 4; }
  parts.push(file.slice(at));
  const blob = offsets.length ? new Blob(parts, { type: mime }) : file;
  const after = await readMp4Meta(readAtOf(blob), blob.size).catch(() => ({ gps: undefined }));
  return { blob, scrubbed: !after.gps };
}

/** A JPEG poster frame (about half a second in) plus the video's size and duration. Best-effort. */
export function videoPoster(blob: Blob, timeoutMs = 12_000): Promise<{ poster: Blob | null; width?: number; height?: number; durationSec?: number }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    let done = false;
    const finish = (r: { poster: Blob | null; width?: number; height?: number; durationSec?: number }) => { if (done) return; done = true; URL.revokeObjectURL(url); v.removeAttribute('src'); try { v.load(); } catch { /* */ } resolve(r); };
    const timer = setTimeout(() => finish({ poster: null }), timeoutMs);
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    v.onerror = () => { clearTimeout(timer); finish({ poster: null }); };
    v.onloadedmetadata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch { /* */ } };
    v.onseeked = () => {
      const w = v.videoWidth, h = v.videoHeight;
      const meta = { width: w || undefined, height: h || undefined, durationSec: Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : undefined };
      if (!w || !h) { clearTimeout(timer); return finish({ poster: null, ...meta }); }
      const scale = Math.min(1, 1280 / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      try { c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height); } catch { clearTimeout(timer); return finish({ poster: null, ...meta }); }
      c.toBlob(b => { clearTimeout(timer); finish({ poster: b, ...meta }); }, 'image/jpeg', 0.8);
    };
  });
}

// ── upload ──────────────────────────────────────────────────────────────────

export type UploadHandle = { cancel: () => void };

/** Resumable upload (the SDK retries chunks through network blips within the session). */
function putFile(path: string, blob: Blob, contentType: string, onProgress?: (fraction: number) => void, onTask?: (cancel: () => void) => void): Promise<string> {
  const task = uploadBytesResumable(ref(storage, path), blob, { contentType, cacheControl: 'private,max-age=31536000,immutable' });
  onTask?.(() => task.cancel());
  return new Promise((resolve, reject) => {
    task.on('state_changed',
      s => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      e => reject(e),
      async () => { try { resolve(await getDownloadURL(task.snapshot.ref)); } catch (e) { reject(e); } });
  });
}

export interface UploadOptions {
  visibility: ItemVisibility;
  onProgress?: (fraction: number, stage: 'preparing' | 'uploading' | 'saving') => void;
  /** Receives a cancel function for the in-flight upload. */
  onCancelable?: (cancel: () => void) => void;
  /** Precomputed hashFile() result (the sync sheet hashes first to skip files already in the pool). */
  hash?: string;
}

/**
 * Scrub, upload and register one prepared file. Returns the stored item (or the existing one when it was a duplicate).
 * Photos: scrubbed original + display + thumb (via services/imageDerivatives). Videos: scrubbed file + poster frame.
 */
export async function uploadPrepared(poolId: string, p: PreparedMedia, opts: UploadOptions): Promise<{ item: PoolItemView; duplicate: boolean; hash: string }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new PoolApiError('Sign in to add photos.', 401, {});
  if (p.error || !p.kind) throw new PoolApiError(p.error || 'This file can’t go in the pool.', 400, {});
  const say = opts.onProgress || (() => {});
  say(0, 'preparing');
  const hash = opts.hash || await hashFile(p.file);
  const base = `${poolStoragePrefix(uid, poolId)}${hash.slice(0, 24)}`;
  const cancel = opts.onCancelable;
  const matched: { time: MatchState; place: MatchState } = { time: p.match.time, place: p.match.place };
  const common = { hash, name: p.name, bytes: p.size, takenAt: p.takenAt, takenAtSource: p.takenAtSource, matched, visibility: opts.visibility };

  if (p.kind === 'photo') {
    const clean = await scrubPhoto(p.file, p.mime);
    let set: import('../imageDerivatives').DerivativeSet | null = null;
    try { const m = await import('../imageDerivatives'); set = await m.makeDerivatives(clean.blob); } catch { set = null; }
    say(0, 'uploading');
    const originalUrl = await putFile(`${base}_original.${clean.ext}`, clean.blob, clean.mime, f => say(f * 0.85, 'uploading'), cancel);
    let url = originalUrl, thumbUrl: string | undefined;
    if (set?.display) url = await putFile(`${base}.${set.display.ext}`, set.display.blob, set.display.ext === 'webp' ? 'image/webp' : 'image/jpeg', f => say(0.85 + f * 0.1, 'uploading')).catch(() => originalUrl);
    if (set?.thumb) thumbUrl = await putFile(`${base}_thumb.${set.thumb.ext}`, set.thumb.blob, set.thumb.ext === 'webp' ? 'image/webp' : 'image/jpeg').catch(() => undefined);
    say(0.97, 'saving');
    const r = await poolApi.addItem(poolId, {
      ...common, mime: clean.mime, bytes: clean.blob.size, url, originalUrl, thumbUrl,
      width: set?.srcWidth, height: set?.srcHeight, locationScrubbed: clean.scrubbed,
    });
    say(1, 'saving');
    return { item: r.item, duplicate: !!r.duplicate, hash };
  }

  const clean = await scrubVideo(p.file, p.mime);
  const poster = await videoPoster(clean.blob);
  say(0, 'uploading');
  const ext = p.mime === 'video/quicktime' ? 'mov' : p.mime === 'video/webm' ? 'webm' : 'mp4';
  const url = await putFile(`${base}.${ext}`, clean.blob, p.mime, f => say(f * 0.95, 'uploading'), cancel);
  const posterUrl = poster.poster ? await putFile(`${base}_poster.jpg`, poster.poster, 'image/jpeg').catch(() => undefined) : undefined;
  say(0.97, 'saving');
  const r = await poolApi.addItem(poolId, {
    ...common, mime: p.mime, bytes: clean.blob.size, url, posterUrl, thumbUrl: posterUrl,
    width: poster.width, height: poster.height, durationSec: poster.durationSec, locationScrubbed: clean.scrubbed,
  });
  say(1, 'saving');
  return { item: r.item, duplicate: !!r.duplicate, hash };
}

// ── geolocation consent (per device; never silent) ──────────────────────────

const CONSENT_KEY = 'plajah.pool.geoConsent.v1';
const DISMISS_KEY = 'plajah.pool.checkinDismissed.v1';
export type GeoConsent = 'granted' | 'declined' | null;

export function readGeoConsent(): GeoConsent {
  try { const v = localStorage.getItem(CONSENT_KEY); return v === 'granted' || v === 'declined' ? v : null; } catch { return null; }
}
export function writeGeoConsent(v: GeoConsent) {
  try { if (v) localStorage.setItem(CONSENT_KEY, v); else localStorage.removeItem(CONSENT_KEY); } catch { /* private mode */ }
}
export function isCheckInDismissed(poolId: string): boolean {
  try { return (JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') as string[]).includes(poolId); } catch { return false; }
}
export function dismissCheckIn(poolId: string) {
  try { const list = (JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') as string[]).filter(x => x !== poolId); localStorage.setItem(DISMISS_KEY, JSON.stringify([...list, poolId].slice(-50))); } catch { /* */ }
}

/** One position reading (no watch, no trail). */
export function currentPosition(timeoutMs = 15_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(Object.assign(new Error('Location isn’t available on this device.'), { code: 2 }));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 60_000, timeout: timeoutMs });
  });
}

export async function geoPermissionState(): Promise<PermissionState | 'unsupported'> {
  try {
    if (!navigator.permissions?.query) return 'unsupported';
    return (await navigator.permissions.query({ name: 'geolocation' as PermissionName })).state;
  } catch { return 'unsupported'; }
}
