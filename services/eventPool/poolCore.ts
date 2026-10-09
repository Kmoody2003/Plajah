// poolCore — pure rules for Event Photo Pools v2 (no Firebase, no DOM, no network). Shared by the server
// (poolServer.ts), the client (poolClient.ts) and the tests.
//
//  Event window   start − 60 min  →  (end, or start + 5 h)  + 2 h
//  Geofence       venue lat/lng, radius default 250 m, clamped to 75 m … 2 km
//  Check-in       inside the window AND inside the fence (GPS accuracy allowance capped at 150 m)
//  Media match    EXIF/container capture time inside the window and, when known, GPS inside the fence
//  Visibility     every item is `private` (uploader only) until its uploader makes it `public`;
//                 hosts can hide any public item (it stays visible to its uploader and to hosts);
//                 nobody, including hosts, ever sees another person's private items.
//  Dedupe         one item per (pool, uploader, content hash); the public view also collapses
//                 identical content shared by different people (earliest upload wins).

export type ItemVisibility = 'private' | 'public';
/** 'guests' = anyone with the link (unlisted, the default); 'public' = may also be listed / previewed. */
export type PoolVisibility = 'guests' | 'public';
/** Who may add media: anyone signed in with the link, or only people checked in (hosts always can). */
export type UploadPolicy = 'link' | 'checked_in';
export type MatchState = 'in' | 'out' | 'unknown';
export type PoolPhase = 'unscheduled' | 'upcoming' | 'open' | 'closed';

export interface LatLng { lat: number; lng: number }
export interface Geofence extends LatLng { radiusM: number }
export interface EventWindow {
  /** Check-in / capture window. */
  start: number; end: number;
  /** The event's own times, kept for display. */
  eventStart: number; eventEnd: number;
}

export interface PoolOverrides { lat?: number; lng?: number; radiusM?: number; start?: number; end?: number }

/** Server-side pool record (`pool_meta/{poolId}`), derived from event_photo_pools + the linked evite / event. */
export interface PoolMeta {
  poolId: string;
  title: string;
  description?: string;
  /** Pool creator + event creator + evite co-hosts. */
  hostUids: string[];
  source: { kind: 'evite' | 'event' | 'ppv' | 'none'; id?: string };
  timezone?: string;
  window: EventWindow | null;
  fence: Geofence | null;
  fenceSource?: 'event' | 'geocode' | 'host';
  /** Venue name only — never the street address. */
  placeLabel?: string;
  /** The host asked to keep the address private (evite "reveal address after yes"). */
  addressPrivate: boolean;
  /** Last address string we geocoded, so we only re-geocode when it changes. */
  geocodeQuery?: string;
  geocoded?: LatLng | null;
  /** When `geocoded` was fetched: provider terms (Google Maps) allow caching coordinates for at most 30 days. */
  geocodedAt?: number;
  visibility: PoolVisibility;
  uploadPolicy: UploadPolicy;
  /** Live streams the host (or a contributing participant) attached. */
  streamIds: string[];
  overrides?: PoolOverrides;
  resolvedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface PoolItem {
  id: string;
  poolId: string;
  ownerUid: string;
  ownerName?: string;
  kind: 'photo' | 'video';
  mime: string;
  bytes: number;
  /** What grids and the lightbox render (optimised derivative for photos, the file for videos). */
  url: string;
  thumbUrl?: string;
  posterUrl?: string;
  /** Full-resolution original (location metadata already scrubbed). */
  originalUrl?: string;
  /** Storage object paths, so the uploader's client can delete the files. Never shown to others. */
  storagePaths: string[];
  width?: number;
  height?: number;
  durationSec?: number;
  takenAt?: number;
  takenAtSource: 'exif' | 'video' | 'file' | 'none';
  hash: string;
  matched: { time: MatchState; place: MatchState };
  /** False when the client could not strip GPS from the file (e.g. HEIC in a browser that cannot decode it): private only. */
  locationScrubbed: boolean;
  visibility: ItemVisibility;
  hiddenByHost: boolean;
  hiddenAt?: number;
  hiddenBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CheckIn {
  id: string;
  poolId: string;
  uid: string;
  name?: string;
  photoURL?: string;
  at: number;
  method: 'geo' | 'host';
}

export interface PoolStreamView { id: string; title: string; ownerName?: string; ownerUid?: string; isLive: boolean; startedAt?: number }

/** What the pool page receives. `fence` is null when the address is private and the viewer has not checked in. */
export interface PoolView {
  id: string;
  title: string;
  description?: string;
  source: PoolMeta['source'];
  timezone?: string;
  window: EventWindow | null;
  phase: PoolPhase;
  fence: Geofence | null;
  hasFence: boolean;
  fenceRadiusM: number | null;
  placeLabel?: string;
  visibility: PoolVisibility;
  uploadPolicy: UploadPolicy;
  isHost: boolean;
  signedIn: boolean;
  me: { checkedIn: boolean; checkedInAt?: number } | null;
  canContribute: boolean;
  uploadsOpen: boolean;
  counts: { publicItems: number; attendees: number };
  streams: PoolStreamView[];
  /** host only */
  overrides?: PoolOverrides;
  fenceSource?: PoolMeta['fenceSource'];
}

// ── constants ───────────────────────────────────────────────────────────────

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const WINDOW_LEAD_MS = 60 * MIN;
export const DEFAULT_EVENT_LENGTH_MS = 5 * HOUR;
export const WINDOW_TAIL_MS = 2 * HOUR;
/** People keep sharing for a while after the party; uploads stay open this long after the window. */
export const UPLOAD_GRACE_MS = 30 * DAY;
export const RADIUS_DEFAULT_M = 250;
export const RADIUS_MIN_M = 75;
export const RADIUS_MAX_M = 2000;
/** We never let poor GPS accuracy widen the fence by more than this. */
export const ACCURACY_ALLOWANCE_MAX_M = 150;
/** Readings worse than this are refused outright ("move near a window and try again"). */
export const ACCURACY_REJECT_M = 1000;
/** Photo GPS has no accuracy figure; allow a fixed slack. */
export const PHOTO_GPS_SLACK_M = 75;

export const IMAGE_MAX_BYTES = 40 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

// ── small helpers ───────────────────────────────────────────────────────────

const num = (v: any): number | undefined => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : undefined; };
export const clampStr = (v: any, n: number): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
export const isPoolId = (id: any): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(id);
export const isSha256Hex = (h: any): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h);
export const isUid = (u: any): u is string => typeof u === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(u);

export function isLatLng(p: any): p is LatLng {
  return !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);
}

export function clampRadius(r?: number | null): number {
  const n = num(r);
  if (n === undefined || n <= 0) return RADIUS_DEFAULT_M;
  return Math.round(Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, n)));
}

// ── window ──────────────────────────────────────────────────────────────────

/** null when the event has no start time (then the pool behaves as an always-open shared album without check-in). */
export function eventWindow(startsAt?: number | null, endsAt?: number | null): EventWindow | null {
  const s = num(startsAt);
  if (!s || s <= 0) return null;
  let e = num(endsAt);
  if (!e || e <= s) e = s + DEFAULT_EVENT_LENGTH_MS;
  // A runaway "ends next month" should not leave check-in open for weeks.
  if (e - s > 3 * DAY) e = s + 3 * DAY;
  return { start: s - WINDOW_LEAD_MS, end: e + WINDOW_TAIL_MS, eventStart: s, eventEnd: e };
}

export const isInWindow = (w: EventWindow | null | undefined, t: number): boolean => !!w && t >= w.start && t <= w.end;

export function poolPhase(w: EventWindow | null | undefined, now: number): PoolPhase {
  if (!w) return 'unscheduled';
  if (now < w.start) return 'upcoming';
  if (now <= w.end) return 'open';
  return 'closed';
}

/** Hosts can always add. Others: from the window start until the grace period after it closes (or any time when unscheduled). */
export function uploadsOpen(w: EventWindow | null | undefined, now: number, isHostViewer = false): boolean {
  if (isHostViewer || !w) return true;
  return now >= w.start && now <= w.end + UPLOAD_GRACE_MS;
}

// ── geofence ────────────────────────────────────────────────────────────────

/** Great-circle distance in metres (haversine, mean Earth radius). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInsideFence(f: Geofence | null | undefined, p: LatLng | null | undefined, slackM = 0): boolean {
  if (!f || !p || !isLatLng(p)) return false;
  return distanceMeters(f, p) <= f.radiusM + Math.max(0, slackM);
}

export type CheckInRefusal = 'no_schedule' | 'not_open' | 'closed' | 'no_place' | 'outside' | 'inaccurate' | 'bad_position';
export type CheckInDecision = { ok: true; distanceM: number } | { ok: false; reason: CheckInRefusal; distanceM?: number };

/**
 * The single check-in rule. The position is used for this decision only and is never stored.
 * `accuracy` is the browser's 68% radius in metres; it may widen the fence by at most 150 m.
 */
export function isCheckInEligible(pool: { window: EventWindow | null; fence: Geofence | null }, pos: { lat: number; lng: number; accuracy?: number }, now: number): CheckInDecision {
  if (!pool.window) return { ok: false, reason: 'no_schedule' };
  const phase = poolPhase(pool.window, now);
  if (phase === 'upcoming') return { ok: false, reason: 'not_open' };
  if (phase === 'closed') return { ok: false, reason: 'closed' };
  if (!pool.fence) return { ok: false, reason: 'no_place' };
  if (!isLatLng(pos)) return { ok: false, reason: 'bad_position' };
  const acc = num(pos.accuracy) ?? 0;
  if (acc > ACCURACY_REJECT_M) return { ok: false, reason: 'inaccurate' };
  const d = distanceMeters(pool.fence, pos);
  if (d <= pool.fence.radiusM + Math.min(Math.max(0, acc), ACCURACY_ALLOWANCE_MAX_M)) return { ok: true, distanceM: Math.round(d) };
  return { ok: false, reason: 'outside', distanceM: Math.round(d) };
}

export const CHECKIN_MESSAGES: Record<CheckInRefusal, string> = {
  no_schedule: 'This pool has no event time, so there is nothing to check in to.',
  not_open: 'Check-in opens an hour before the event starts.',
  closed: 'Check-in for this event has closed.',
  no_place: 'The host has not set a location for this event yet.',
  outside: 'You don’t seem to be at the event yet.',
  inaccurate: 'Your location is too rough right now. Try again in a moment.',
  bad_position: 'We couldn’t read your location.',
};

// ── media matching ──────────────────────────────────────────────────────────

/** What we could learn about a picked file before uploading it. */
export interface MediaMeta {
  takenAt?: number;
  takenAtSource: PoolItem['takenAtSource'];
  gps?: LatLng | null;
}

export interface MatchResult {
  /** Pre-select this file in the sync sheet. */
  match: boolean;
  time: MatchState;
  place: MatchState;
  /** Short human reason for the sheet ("Taken during the event", "Taken 3 days before"). */
  why: string;
}

/**
 * Should a picked file be pre-selected? Evidence against (time or place outside) always wins; time inside
 * is enough; place inside is enough when the time is unknown. With no schedule and no place, everything
 * matches (the pool is a plain shared album). When the fence is hidden from this viewer, place is unknown.
 */
export function matchesEvent(meta: MediaMeta, pool: { window: EventWindow | null; fence: Geofence | null }): MatchResult {
  const time: MatchState = !pool.window || meta.takenAt === undefined || meta.takenAtSource === 'none' ? 'unknown'
    : isInWindow(pool.window, meta.takenAt) ? 'in' : 'out';
  const place: MatchState = !pool.fence || !meta.gps || !isLatLng(meta.gps) ? 'unknown'
    : isInsideFence(pool.fence, meta.gps, PHOTO_GPS_SLACK_M) ? 'in' : 'out';
  if (!pool.window && !pool.fence) return { match: true, time, place, why: 'Added to this album' };
  if (time === 'out') return { match: false, time, place, why: describeOffset(meta.takenAt!, pool.window!) };
  if (place === 'out') return { match: false, time, place, why: 'Taken somewhere else' };
  if (time === 'in') return { match: true, time, place, why: place === 'in' ? 'Taken at the event' : 'Taken during the event' };
  if (place === 'in') return { match: true, time, place, why: 'Taken at the venue' };
  return { match: false, time, place, why: 'No date on this file' };
}

function describeOffset(t: number, w: EventWindow): string {
  const gap = t < w.start ? w.start - t : t - w.end;
  const when = t < w.start ? 'before' : 'after';
  if (gap < HOUR) return `Taken ${Math.max(1, Math.round(gap / MIN))} min ${when} the event`;
  if (gap < 2 * DAY) return `Taken ${Math.round(gap / HOUR)} h ${when} the event`;
  return `Taken ${Math.round(gap / DAY)} days ${when} the event`;
}

// ── time zones (EXIF times are wall-clock without a zone) ────────────────────

/** Offset of `timeZone` from UTC at instant `t`, in ms (positive east of UTC). Unknown zone → device zone. */
export function tzOffsetMs(t: number, timeZone?: string): number {
  if (!timeZone) return -new Date(t).getTimezoneOffset() * MIN;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t));
    const g = (k: string) => Number(parts.find(p => p.type === k)?.value);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
    return asUtc - Math.floor(t / 1000) * 1000;
  } catch { return -new Date(t).getTimezoneOffset() * MIN; }
}

/** Wall-clock parts [y, m(1-12), d, h, mi, s] in `timeZone` → epoch ms. Handles DST by re-checking the offset once. */
export function wallTimeToEpoch(p: number[], timeZone?: string): number {
  const guess = Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1, p[3] || 0, p[4] || 0, p[5] || 0);
  const first = guess - tzOffsetMs(guess, timeZone);
  const second = guess - tzOffsetMs(first, timeZone);
  return second;
}

/** "2026:10:24 18:30:05" (+ optional "+02:00" / "-0400") → epoch ms. Without an offset, the event's zone is assumed. */
export function parseExifDateTime(s: string | undefined, offset?: string, fallbackZone?: string): number | undefined {
  const m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || '').trim());
  if (!m) return undefined;
  const p = m.slice(1).map(Number);
  if (p[0] < 1990 || p[1] < 1 || p[1] > 12 || p[2] < 1 || p[2] > 31 || p[3] > 23 || p[4] > 59 || p[5] > 60) return undefined;
  const o = /^([+-])(\d{2}):?(\d{2})$/.exec(String(offset || '').trim());
  if (o) {
    const sign = o[1] === '-' ? -1 : 1;
    return Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5]) - sign * (Number(o[2]) * 60 + Number(o[3])) * MIN;
  }
  return wallTimeToEpoch(p, fallbackZone);
}

// ── visibility ──────────────────────────────────────────────────────────────

export const isHost = (meta: Pick<PoolMeta, 'hostUids'>, uid?: string | null): boolean => !!uid && meta.hostUids.includes(uid);

export interface Viewer { uid?: string | null; isHost: boolean }

/** The one visibility rule: owners see their own; private is owner-only; hidden public items are owner + host only. */
export function canSeeItem(item: Pick<PoolItem, 'ownerUid' | 'visibility' | 'hiddenByHost'>, viewer: Viewer): boolean {
  if (viewer.uid && item.ownerUid === viewer.uid) return true;
  if (item.visibility !== 'public') return false;
  if (item.hiddenByHost) return viewer.isHost;
  return true;
}

/** Keep the earliest upload of each content hash. */
export function dedupeByHash<T extends Pick<PoolItem, 'hash' | 'createdAt'>>(items: T[]): T[] {
  const best = new Map<string, T>();
  for (const it of items) { const prev = best.get(it.hash); if (!prev || it.createdAt < prev.createdAt) best.set(it.hash, it); }
  return items.filter(it => best.get(it.hash) === it);
}

const byCapture = (a: PoolItem, b: PoolItem) => (a.takenAt ?? a.createdAt) - (b.takenAt ?? b.createdAt) || a.createdAt - b.createdAt;

/**
 * Items for one tab. 'public': everyone's public items (hosts also see hidden ones, flagged), deduped.
 * 'mine': the viewer's own items, private and public.
 */
export function listForViewer(items: PoolItem[], viewer: Viewer, scope: 'public' | 'mine'): PoolItem[] {
  if (scope === 'mine') return viewer.uid ? items.filter(i => i.ownerUid === viewer.uid).sort(byCapture) : [];
  const pub = items.filter(i => i.visibility === 'public' && canSeeItem(i, viewer));
  // Dedupe among items everyone can see; hidden ones don't block a visible duplicate.
  const visible = dedupeByHash(pub.filter(i => !i.hiddenByHost));
  const hidden = viewer.isHost ? pub.filter(i => i.hiddenByHost) : [];
  return [...visible, ...hidden].sort(byCapture);
}

/** What leaves the server for a given viewer: storage paths only for the owner; moderation detail only for owner + host. */
export function toItemView(item: PoolItem, viewer: Viewer): Partial<PoolItem> & { mine: boolean } {
  const mine = !!viewer.uid && item.ownerUid === viewer.uid;
  const { storagePaths, hiddenBy, ...rest } = item;
  const out: any = { ...rest, mine };
  if (mine) out.storagePaths = storagePaths;
  if (!mine && !viewer.isHost) { delete out.hiddenByHost; delete out.hiddenAt; }
  return out;
}

/** null = allowed; otherwise a plain-language refusal. */
export function canChangeVisibility(item: Pick<PoolItem, 'ownerUid' | 'locationScrubbed'>, uid: string | null | undefined, to: ItemVisibility): string | null {
  if (!uid || item.ownerUid !== uid) return 'Only the person who added this can change who sees it.';
  if (to === 'public' && item.locationScrubbed === false) return 'This file still carries its location, so it can only stay in your private photos.';
  return null;
}

export function canHide(meta: Pick<PoolMeta, 'hostUids'>, item: Pick<PoolItem, 'visibility'>, uid: string | null | undefined): string | null {
  if (!isHost(meta, uid)) return 'Only the host can hide photos from the pool.';
  if (item.visibility !== 'public') return 'Only public photos can be hidden.';
  return null;
}

export function canContribute(meta: Pick<PoolMeta, 'hostUids' | 'uploadPolicy' | 'window'>, uid: string | null | undefined, checkedIn: boolean, now: number): string | null {
  if (!uid) return 'Sign in to add photos.';
  const host = isHost(meta, uid);
  if (!uploadsOpen(meta.window, now, host)) return meta.window && now < meta.window.start ? 'Adding photos opens when the event starts.' : 'This pool is closed to new photos.';
  if (!host && meta.uploadPolicy === 'checked_in' && !checkedIn) return 'The host only takes photos from people checked in at the event.';
  return null;
}

// ── files and storage paths ─────────────────────────────────────────────────

export function mediaKind(mime: string, name = ''): 'photo' | 'video' | null {
  const t = (mime || '').toLowerCase();
  if (IMAGE_TYPES.includes(t)) return 'photo';
  if (VIDEO_TYPES.includes(t)) return 'video';
  // Some Android pickers hand over an empty type: fall back to the extension.
  const ext = name.toLowerCase().split('.').pop() || '';
  if (!t || t === 'application/octet-stream') {
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) return 'photo';
    if (['mp4', 'm4v', 'mov', 'webm'].includes(ext)) return 'video';
  }
  return null;
}

export function normalizeMime(mime: string, name = ''): string {
  const t = (mime || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  const ext = name.toLowerCase().split('.').pop() || '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' } as Record<string, string>)[ext] || t;
}

/** null = acceptable; otherwise why not. */
export function checkMediaFile(f: { type: string; size: number; name?: string }): string | null {
  const kind = mediaKind(f.type, f.name);
  if (!kind) return 'Only photos (JPEG, PNG, HEIC, WebP) and videos (MP4, MOV, WebM) can go in the pool.';
  if (!(f.size > 0)) return 'This file is empty.';
  if (kind === 'photo' && f.size > IMAGE_MAX_BYTES) return `Photos can be up to ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`;
  if (kind === 'video' && f.size > VIDEO_MAX_BYTES) return `Videos can be up to ${VIDEO_MAX_BYTES / 1024 / 1024} MB. Trim it and try again.`;
  return null;
}

/**
 * Where a participant's files for a pool live: storage.rules `personal/{uid}/**` is owner-only read + write, so nobody
 * can list or fetch someone's private items by path. Public items are served through their tokenized download URL,
 * which the server hands out only while the item is public and not hidden.
 */
export const poolStoragePrefix = (uid: string, poolId: string) => `personal/${uid}/event-pools/${poolId}/`;

/** Decoded object path of a Firebase Storage download URL, or null when it isn't one. */
export function storagePathOf(url: string, bucket?: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com') return null;
    const m = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(u.pathname);
    if (!m) return null;
    if (bucket && decodeURIComponent(m[1]) !== bucket) return null;
    const path = decodeURIComponent(m[2]);
    if (path.includes('..') || path.includes('//')) return null;
    return path;
  } catch { return null; }
}

/** The server only accepts media that the caller uploaded under their own pool folder. */
export function isOwnPoolMediaUrl(url: any, uid: string, poolId: string, bucket?: string): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false;
  const p = storagePathOf(url, bucket);
  return !!p && p.startsWith(poolStoragePrefix(uid, poolId));
}

export const itemIdFor = (poolId: string, uid: string, hash: string) => `${poolId}_${uid}_${hash.slice(0, 24)}`;
export const checkinIdFor = (poolId: string, uid: string) => `${poolId}_${uid}`;

export type CleanResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validate the metadata a client posts after uploading. Everything server-owned (id, owner, hidden state, times) is set here. */
export function cleanItemInput(b: any, ctx: { uid: string; poolId: string; bucket?: string; now: number; ownerName?: string; window: EventWindow | null }): CleanResult<PoolItem> {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Nothing to add.' };
  const hash = String(b.hash || '').toLowerCase();
  if (!isSha256Hex(hash)) return { ok: false, error: 'Missing file fingerprint.' };
  const mime = normalizeMime(clampStr(b.mime, 60), clampStr(b.name, 200));
  const kind = mediaKind(mime);
  if (!kind) return { ok: false, error: 'Only photos and videos can go in the pool.' };
  const bytes = Math.floor(num(b.bytes) || 0);
  const sizeErr = checkMediaFile({ type: mime, size: bytes });
  if (sizeErr) return { ok: false, error: sizeErr };
  const own = (u: any) => isOwnPoolMediaUrl(u, ctx.uid, ctx.poolId, ctx.bucket);
  if (!own(b.url)) return { ok: false, error: 'Upload the file to your pool folder first.' };
  for (const k of ['thumbUrl', 'posterUrl', 'originalUrl']) if (b[k] !== undefined && b[k] !== null && b[k] !== '' && !own(b[k])) return { ok: false, error: 'One of the file links is not yours.' };
  const prefix = poolStoragePrefix(ctx.uid, ctx.poolId);
  const derived = ['url', 'thumbUrl', 'posterUrl', 'originalUrl'].map(k => (b[k] ? storagePathOf(b[k], ctx.bucket) : null)).filter(Boolean) as string[];
  const storagePaths = [...new Set(derived.filter(p => p.startsWith(prefix)))];
  const takenAt = num(b.takenAt);
  const src = ['exif', 'video', 'file', 'none'].includes(b.takenAtSource) ? b.takenAtSource : 'none';
  const st = (v: any): MatchState => (v === 'in' || v === 'out' ? v : 'unknown');
  const wantPublic = b.visibility === 'public';
  const scrubbed = b.locationScrubbed !== false;
  const dim = (v: any) => { const n = Math.floor(num(v) || 0); return n > 0 && n < 100_000 ? n : undefined; };
  const item: PoolItem = {
    id: itemIdFor(ctx.poolId, ctx.uid, hash), poolId: ctx.poolId, ownerUid: ctx.uid, ownerName: clampStr(ctx.ownerName ?? b.ownerName, 60) || undefined,
    kind, mime, bytes, url: b.url,
    thumbUrl: b.thumbUrl || undefined, posterUrl: b.posterUrl || undefined, originalUrl: b.originalUrl || undefined,
    storagePaths, width: dim(b.width), height: dim(b.height),
    durationSec: kind === 'video' && num(b.durationSec) !== undefined && num(b.durationSec)! >= 0 ? Math.min(6 * 3600, Math.round(num(b.durationSec)! * 10) / 10) : undefined,
    takenAt: takenAt && takenAt > Date.UTC(1990, 0, 1) && takenAt < ctx.now + DAY ? Math.round(takenAt) : undefined,
    takenAtSource: takenAt ? src : 'none',
    hash,
    matched: { time: st(b.matched?.time), place: st(b.matched?.place) },
    locationScrubbed: scrubbed,
    // Private is the default. A file that still carries GPS can never start public.
    visibility: wantPublic && scrubbed ? 'public' : 'private',
    hiddenByHost: false,
    createdAt: ctx.now, updatedAt: ctx.now,
  };
  // Re-derive the time verdict server-side when we can (the client's claim is only a hint).
  if (item.takenAt !== undefined && ctx.window) item.matched.time = isInWindow(ctx.window, item.takenAt) ? 'in' : 'out';
  // Strip undefined so Firestore REST never sees them.
  for (const k of Object.keys(item) as (keyof PoolItem)[]) if (item[k] === undefined) delete item[k];
  return { ok: true, value: item };
}

/** Host settings patch. Unknown keys ignored; overrides validated. */
export function cleanPoolSettings(b: any, prev: PoolMeta): CleanResult<Partial<PoolMeta>> {
  const out: Partial<PoolMeta> = {};
  if (b?.visibility !== undefined) { if (b.visibility !== 'guests' && b.visibility !== 'public') return { ok: false, error: 'Pick who can see the pool.' }; out.visibility = b.visibility; }
  if (b?.uploadPolicy !== undefined) { if (b.uploadPolicy !== 'link' && b.uploadPolicy !== 'checked_in') return { ok: false, error: 'Pick who can add photos.' }; out.uploadPolicy = b.uploadPolicy; }
  if (b?.overrides !== undefined) {
    const o = b.overrides || {};
    const next: PoolOverrides = { ...(prev.overrides || {}) };
    if (o.clearPlace) { delete next.lat; delete next.lng; }
    if (o.lat !== undefined || o.lng !== undefined) {
      const p = { lat: num(o.lat)!, lng: num(o.lng)! };
      if (!isLatLng(p)) return { ok: false, error: 'That pin is not a real place.' };
      next.lat = Math.round(p.lat * 1e6) / 1e6; next.lng = Math.round(p.lng * 1e6) / 1e6;
    }
    if (o.radiusM !== undefined) next.radiusM = clampRadius(o.radiusM);
    if (o.clearTime) { delete next.start; delete next.end; }
    if (o.start !== undefined) { const s = num(o.start); if (!s || s < Date.UTC(2000, 0, 1)) return { ok: false, error: 'Pick a start time.' }; next.start = s; }
    if (o.end !== undefined) { const e = num(o.end); if (e !== undefined && next.start && e <= next.start) return { ok: false, error: 'The end has to be after the start.' }; next.end = e; }
    for (const k of Object.keys(next) as (keyof PoolOverrides)[]) if (next[k] === undefined) delete next[k];
    out.overrides = next;
  }
  return { ok: true, value: out };
}

/** Apply host overrides on top of what the linked event says. */
export function applyOverrides(base: { window: EventWindow | null; fence: Geofence | null; fenceSource?: PoolMeta['fenceSource'] }, o?: PoolOverrides): { window: EventWindow | null; fence: Geofence | null; fenceSource?: PoolMeta['fenceSource'] } {
  if (!o) return base;
  let window = base.window;
  if (o.start) window = eventWindow(o.start, o.end ?? (base.window ? base.window.eventEnd - base.window.eventStart + o.start : undefined));
  let fence = base.fence, fenceSource = base.fenceSource;
  if (o.lat !== undefined && o.lng !== undefined) { fence = { lat: o.lat, lng: o.lng, radiusM: clampRadius(o.radiusM ?? base.fence?.radiusM) }; fenceSource = 'host'; }
  else if (fence && o.radiusM !== undefined) fence = { ...fence, radiusM: clampRadius(o.radiusM) };
  return { window, fence, fenceSource };
}

/** Build the page payload for one viewer. The fence centre is withheld when the address is private and the viewer hasn't checked in. */
export function toPoolView(meta: PoolMeta, v: { uid?: string | null; checkedIn: boolean; checkedInAt?: number; now: number; publicItems: number; attendees: number; streams: PoolStreamView[] }): PoolView {
  const host = isHost(meta, v.uid);
  const fenceVisible = !!meta.fence && (!meta.addressPrivate || host || v.checkedIn);
  return {
    id: meta.poolId, title: meta.title, description: meta.description, source: meta.source, timezone: meta.timezone,
    window: meta.window, phase: poolPhase(meta.window, v.now),
    fence: fenceVisible ? meta.fence : null, hasFence: !!meta.fence, fenceRadiusM: meta.fence?.radiusM ?? null,
    placeLabel: meta.placeLabel, visibility: meta.visibility, uploadPolicy: meta.uploadPolicy,
    isHost: host, signedIn: !!v.uid,
    me: v.uid ? { checkedIn: v.checkedIn, ...(v.checkedInAt ? { checkedInAt: v.checkedInAt } : {}) } : null,
    canContribute: canContribute(meta, v.uid, v.checkedIn, v.now) === null,
    uploadsOpen: uploadsOpen(meta.window, v.now, host),
    counts: { publicItems: v.publicItems, attendees: v.attendees },
    streams: v.streams.filter(s => s.isLive || host),
    ...(host ? { overrides: meta.overrides || {}, fenceSource: meta.fenceSource } : {}),
  };
}

/** One-line geocoding query from address parts (empty parts dropped). */
export const geocodeQueryOf = (...parts: Array<string | undefined | null>): string =>
  parts.map(p => clampStr(p, 200)).filter(Boolean).join(', ').slice(0, 300);
