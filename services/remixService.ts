// remixService — "Reprise", Plajah's answer to duet/stitch.
//
// TikTok's stitch drops a borrowed clip into a toy editor. Reprise drops it into FABULA — a real
// NLE — as a PRE-LICENSED media-pool item with its attribution baked in, then hands off so Fabula
// opens the new production. The published result carries `remixOfVideoId` + `remixStartSec` /
// `remixEndSec`, which renders a source-credit chip on the player (SourceCreditChip.tsx).
//
// Mirrors the Pixels→Fabula bridge (services/fabulaBridge.ts): write a production into Fabula's own
// IndexedDB store, set `studio:handoff`, then the caller dispatches `OPEN_FABULA`.

import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { Video } from '../types';
import {
  getLicense, DEFAULT_LICENSE, type ContentLicenseId, type LicenseDef,
} from './licensingService';

const uid = () => Math.random().toString(36).slice(2, 10);

/** Max borrowable span, in seconds — the stitch-length ceiling. */
export const REPRISE_MAX_SEC = 60;
/** Minimum usable span. */
export const REPRISE_MIN_SEC = 1;

export interface RepriseRange {
  startSec: number;
  endSec: number;
}

export interface RepriseClip {
  /** The video being borrowed from. */
  sourceVideoId: string;
  sourceTitle: string;
  sourceOwnerId: string;
  sourceOwnerName?: string;
  /** Playable source: a direct URL, or a Mux playback id (HLS). */
  url?: string;
  muxPlaybackId?: string;
  thumbnailUrl?: string;
  startSec: number;
  endSec: number;
  license: ContentLicenseId;
}

export interface RepriseEligibility {
  ok: boolean;
  license: LicenseDef;
  /** Human-facing reason when `ok` is false. */
  reason?: string;
  /** Attribution string the remixer is obliged to carry, when the license requires it. */
  attribution?: string;
}

/** A `<video>`-playable URL for a Reello video, if one exists. */
export function playableSourceUrl(video: Video): string | undefined {
  if (video?.url) return video.url;
  if (video?.muxPlaybackId) return `https://stream.mux.com/${video.muxPlaybackId}.m3u8`;
  return undefined;
}

/**
 * Can this video be Reprised, and under what terms? Reprise is a LICENSE-RESPECTING feature:
 * All Rights Reserved and No-Derivatives work is not borrowable.
 */
export function checkRepriseEligibility(video: Video, ownerName?: string): RepriseEligibility {
  const license = getLicense((video?.license as ContentLicenseId) || DEFAULT_LICENSE);

  if (!video?.id) {
    return { ok: false, license, reason: 'This video cannot be identified.' };
  }
  if (!playableSourceUrl(video)) {
    return { ok: false, license, reason: 'This video has no playable source yet.' };
  }
  if (!license.isOpen) {
    return {
      ok: false, license,
      reason: `This video is ${license.label}. The creator has not licensed it for reuse.`,
    };
  }
  if (!license.allowsDerivatives) {
    return {
      ok: false, license,
      reason: `${license.label} does not permit derivative works, so it cannot be Reprised.`,
    };
  }

  const credit = ownerName || video.artist || 'the original creator';
  return {
    ok: true,
    license,
    attribution: license.requiresAttribution
      ? `"${video.title}" by ${credit} — licensed ${license.label}`
      : undefined,
  };
}

/** Clamp a requested in/out range to the video's duration and the Reprise ceiling. */
export function clampRepriseRange(range: RepriseRange, durationSec?: number): RepriseRange {
  const max = durationSec && durationSec > 0 ? durationSec : Number.MAX_SAFE_INTEGER;
  let start = Math.max(0, Math.min(range.startSec, max));
  let end = Math.max(0, Math.min(range.endSec, max));
  if (end < start) [start, end] = [end, start];
  if (end - start < REPRISE_MIN_SEC) end = Math.min(max, start + REPRISE_MIN_SEC);
  if (end - start > REPRISE_MAX_SEC) end = start + REPRISE_MAX_SEC;
  return { startSec: start, endSec: end };
}

/** Build the clip descriptor for a chosen range. Returns null when the video is not eligible. */
export function buildRepriseClip(
  video: Video,
  range: RepriseRange,
  opts?: { durationSec?: number; ownerName?: string },
): RepriseClip | null {
  const eligibility = checkRepriseEligibility(video, opts?.ownerName);
  if (!eligibility.ok) return null;
  const { startSec, endSec } = clampRepriseRange(range, opts?.durationSec);

  // Never put `undefined` into an object destined for Firestore — omit the key instead.
  const clip: RepriseClip = {
    sourceVideoId: video.id,
    sourceTitle: video.title || 'Untitled',
    sourceOwnerId: video.ownerId,
    startSec,
    endSec,
    license: (video.license as ContentLicenseId) || DEFAULT_LICENSE,
  };
  const ownerName = opts?.ownerName || video.artist;
  if (ownerName) clip.sourceOwnerName = ownerName;
  if (video.url) clip.url = video.url;
  if (video.muxPlaybackId) clip.muxPlaybackId = video.muxPlaybackId;
  const thumb = video.thumbnailUrl || video.coverImageUrl;
  if (thumb) clip.thumbnailUrl = thumb;
  return clip;
}

// ── Fabula hand-off ───────────────────────────────────────────────────────────

interface FabulaMediaItem {
  id: string; name: string; type: string; url?: string; duration?: number;
  bin: string; tags: string[]; offline?: boolean;
  /** Reprise attribution rides on the media item so it survives the whole edit. */
  reprise?: {
    sourceVideoId: string; sourceTitle: string; sourceOwnerId: string; sourceOwnerName?: string;
    startSec: number; endSec: number; license: ContentLicenseId; attribution?: string;
  };
}

interface FabulaClip {
  id: string; trackId: string; start: number; duration: number; kind: string;
  label: string; assetId?: string; srcIn?: number;
}

function buildRepriseProduction(clip: RepriseClip, attribution?: string) {
  const editId = uid();
  const now = Date.now();
  const duration = Math.max(0.1, clip.endSec - clip.startSec);
  const src = clip.url || (clip.muxPlaybackId ? `https://stream.mux.com/${clip.muxPlaybackId}.m3u8` : undefined);

  const item: FabulaMediaItem = {
    id: uid(),
    name: `${clip.sourceTitle} — Reprise`,
    type: 'video',
    bin: 'Reprise · Licensed',
    tags: ['reprise', 'licensed'],
    duration,
    reprise: {
      sourceVideoId: clip.sourceVideoId,
      sourceTitle: clip.sourceTitle,
      sourceOwnerId: clip.sourceOwnerId,
      startSec: clip.startSec,
      endSec: clip.endSec,
      license: clip.license,
    },
  };
  if (src) item.url = src; else item.offline = true;
  if (clip.sourceOwnerName) item.reprise!.sourceOwnerName = clip.sourceOwnerName;
  if (attribution) item.reprise!.attribution = attribution;

  const timelineClip: FabulaClip = {
    id: uid(), trackId: 'v1', start: 0, duration, kind: 'media',
    label: clip.sourceTitle, assetId: item.id,
    // The borrowed range starts at `startSec` INSIDE the source asset.
    srcIn: clip.startSec,
  };

  const title = `Reprise — ${clip.sourceTitle}`;
  const prod = {
    id: uid(), title, type: 'film',
    description: attribution
      ? `Reprise of "${clip.sourceTitle}". ${attribution}`
      : `Reprise of "${clip.sourceTitle}".`,
    themes: '', world: '', cast: [],
    mediaPool: [item],
    defaults: {
      style: '', aspect: '16:9', service: 'kling', stillTarget: 'mj_magnific',
      format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: 30, drop: false },
    },
    acts: [1, 2, 3].map(n => ({ id: uid(), number: n, title: 'ACT ' + ['I', 'II', 'III'][n - 1], scenes: [] })),
    edits: [{ id: editId, title, timeline: { clips: [timelineClip], trackSettings: {} }, updatedAt: now }],
    worldCats: {}, design: {},
    // The origin record — a published export can read this back to stamp remixOfVideoId.
    reprise: {
      sourceVideoId: clip.sourceVideoId,
      sourceOwnerId: clip.sourceOwnerId,
      startSec: clip.startSec,
      endSec: clip.endSec,
      license: clip.license,
    },
    createdAt: now, updatedAt: now,
  };
  return { prod, editId };
}

/**
 * Create the Reprise hand-off: write a Fabula production containing the licensed clip and set
 * `studio:handoff` so Fabula opens it on next boot. The caller then dispatches `OPEN_FABULA`.
 * Throws only on a hard IndexedDB failure.
 */
export async function exportRepriseToFabula(
  clip: RepriseClip,
  attribution?: string,
): Promise<{ prodId: string; editId: string }> {
  const { prod, editId } = buildRepriseProduction(clip, attribution);
  await idbSet('studio:prod:' + prod.id, prod);
  const idx = (await idbGet('studio:index')) as { list?: any[] } | undefined;
  const entry = { id: prod.id, title: prod.title, type: prod.type, updated: Date.now(), sceneCount: 0 };
  const list = [entry, ...((idx?.list || []).filter((x: any) => x.id !== prod.id))];
  await idbSet('studio:index', { list });
  await idbSet('studio:handoff', { prodId: prod.id, editId });
  return { prodId: prod.id, editId };
}

/**
 * One-call Reprise: validate, build, write the hand-off, open Fabula.
 * Returns null (and opens nothing) when the source is not licensed for reuse.
 */
export async function startReprise(
  video: Video,
  range: RepriseRange,
  opts?: { durationSec?: number; ownerName?: string },
): Promise<{ prodId: string; editId: string } | null> {
  const eligibility = checkRepriseEligibility(video, opts?.ownerName);
  if (!eligibility.ok) return null;
  const clip = buildRepriseClip(video, range, opts);
  if (!clip) return null;
  const result = await exportRepriseToFabula(clip, eligibility.attribution);
  try { window.dispatchEvent(new CustomEvent('OPEN_FABULA')); } catch { /* non-browser */ }
  return result;
}

/**
 * The fields a published Reprise must carry so the player can render its source credit.
 * Firestore-safe: only defined keys are ever returned.
 */
export function buildRemixMetadata(clip: RepriseClip): Partial<Video> {
  const meta: Partial<Video> = {
    remixOfVideoId: clip.sourceVideoId,
    remixStartSec: clip.startSec,
    remixEndSec: clip.endSec,
  };
  meta.provenance = {
    originVideoId: clip.sourceVideoId,
    originOwnerId: clip.sourceOwnerId,
    stampedAt: Date.now(),
  };
  return meta;
}
