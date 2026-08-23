// Plajah FAST — the ONE linear-timeline resolver, shared by the player and the EPG.
//
// A FAST channel is a looping list of slots (video / bumper / ad / public-domain / scheduled-live).
// Everything about "what is on now" must be computed the SAME way in two places or they drift:
//   • the client player (components/FastChannelPlayer.tsx) — what actually plays on screen, and
//   • the server EPG (services/fastChannelEpg.ts via server.ts) — the guide platforms ingest.
// Before this module the player looped over raw *videos* while the EPG looped over *slots* with a
// different duration floor, so the guide and the screen disagreed the moment a channel had bumpers
// or ads. Both now import slotDurationSec + linearPosition from here, so the loop math is identical.
//
// Deterministic + epoch-anchored: position is `floor(nowMs/1000) mod loopLength`, so every viewer
// (and the guide) lands on the same slot at the same wall-clock — that is what makes it "linear TV"
// rather than everyone starting from slot #0.

import type { FastChannelSlot, FastChannelSchedule, AsRunEntry } from '../types';

// platformClock is import-safe on the server too: nothing at module scope touches window/document.
import { zonedMidnightMs, zonedDayIndex, now as clockNow } from './platformClock';

export const DAY_SEC = 86400;

export const DEFAULT_VIDEO_SEC = 1800; // 30-min fallback when a video carries no probed duration
export const DEFAULT_BUMPER_SEC = 10;
export const DEFAULT_AD_SEC = 60;
export const DEFAULT_LIVE_SEC = 1800;
export const DEFAULT_FM_SEC = 3600;   // an FM programming block defaults to an hour
/** A generative block defaults to two hours. It never runs out of content, so the only thing
 *  deciding the length is how the day should read in a guide. */
export const DEFAULT_GENERATIVE_SEC = 7200;
/** Any non-video hold longer than this automatically becomes a Plajah FM insertion. */
export const FM_FILL_THRESHOLD_SEC = 30;

/** Canonical whole-second duration of a slot. The single source of truth for loop math everywhere. */
export function slotDurationSec(s: FastChannelSlot): number {
  const n = (v: any, d: number) => Math.max(1, Math.round(Number(v) || 0) || d);
  switch (s?.type) {
    case 'VIDEO':
    case 'PUBLIC_DOMAIN': {
      // A real programme is never ≤1s. Older schedules were poisoned with videoDurationSeconds=1 by a
      // writer bug (`Math.max(1,…)` defeated the fallback), which made every asset one second long and
      // collapsed the guide onto a single minute. Treat ≤1 as "unknown" and use the default block.
      const d = Math.round(Number(s.videoDurationSeconds) || 0);
      return d > 1 ? d : DEFAULT_VIDEO_SEC;
    }
    case 'BUMPER':         return n(s.bumperDurationSeconds, DEFAULT_BUMPER_SEC);
    case 'AD_BREAK':       return n(s.adDurationSeconds, DEFAULT_AD_SEC);
    case 'FM_BLOCK':       return n(s.videoDurationSeconds, DEFAULT_FM_SEC);
    // A generative slot is hours long and contains several complete arcs back to back — the arc
    // is how long one SESSION runs, not how long the slot occupies the grid.
    case 'GENERATIVE':     return n(s.videoDurationSeconds, DEFAULT_GENERATIVE_SEC);
    case 'LIVE_INTERRUPT': return n(s.liveInterruptMaxDurationSeconds, DEFAULT_LIVE_SEC);
    default:               return DEFAULT_VIDEO_SEC;
  }
}

/** Total loop length in seconds. */
export function loopTotalSec(slots: FastChannelSlot[]): number {
  return (slots || []).reduce((a, s) => a + slotDurationSec(s), 0);
}

/**
 * Deterministic epoch-anchored position in the looping schedule at a wall-clock. Returns which slot
 * is on now and how many seconds into it to seek. Same input → same output for every viewer/guide.
 */
export function linearPosition(slots: FastChannelSlot[], atMs: number): { index: number; offsetSec: number } {
  const total = loopTotalSec(slots);
  if (!slots?.length || total <= 0) return { index: 0, offsetSec: 0 };
  let pos = Math.floor(atMs / 1000) % total;
  if (pos < 0) pos += total;
  for (let i = 0; i < slots.length; i++) {
    const d = slotDurationSec(slots[i]);
    if (pos < d) return { index: i, offsetSec: pos };
    pos -= d;
  }
  return { index: 0, offsetSec: 0 };
}

/** Local-midnight (00:00) unix-ms for the day that contains `atMs`, in the runtime's timezone. */
/**
 * Midnight for scheduling purposes. With a channel timezone this is midnight on the STATION's wall
 * clock, so every viewer worldwide is on the same programme at the same instant; without one it falls
 * back to the viewer's device midnight (legacy behaviour — see platformClock for why that diverges).
 */
export function localMidnightMs(atMs: number, tz?: string): number {
  return zonedMidnightMs(atMs, tz);
}

/** The slots that play on the weekday containing `atMs` — a per-day override if present, else the
 *  default "same every day" loop. Keeps the resolver a pure function of (schedule, time). */
export function activeDaySlots(schedule: Pick<FastChannelSchedule, 'slots' | 'weeklySlots' | 'timezone'> | null | undefined, atMs: number): FastChannelSlot[] {
  if (!schedule) return [];
  // Weekday on the CHANNEL's clock — otherwise a viewer across the date line pulls the wrong day.
  const day = zonedDayIndex(atMs, (schedule as any).timezone); // 0=Sun … 6=Sat
  const perDay = schedule.weeklySlots?.[day];
  return perDay && perDay.length ? perDay : (schedule.slots || []);
}

/**
 * Midnight-anchored position: the day's slots start at local 00:00 and NEVER clip — once the next
 * asset would cross midnight the channel is OFF_AIR (show a "resumes at midnight" card) until 00:00.
 * Returns the on-air slot + seek, or {offAir:true, resumesInSec} when past the day's content.
 */
export function linearPositionMidnight(
  slots: FastChannelSlot[], atMs: number, tz?: string,
): { index: number; offsetSec: number; offAir: false } | { offAir: true; resumesInSec: number } {
  const midnight = localMidnightMs(atMs, tz);
  const elapsed = Math.floor((atMs - midnight) / 1000);
  let acc = 0;
  for (let i = 0; i < (slots?.length || 0); i++) {
    const d = slotDurationSec(slots[i]);
    if (acc + d > DAY_SEC) break;      // would clip past midnight — stop the day here (no-clip rule)
    if (elapsed < acc + d) return { index: i, offsetSec: elapsed - acc, offAir: false };
    acc += d;
  }
  return { offAir: true, resumesInSec: Math.max(0, DAY_SEC - elapsed) };
}

/**
 * As-run log: exactly what plays and when across a midnight-anchored day, starting at `dayStartMs`
 * (defaults to local midnight). Never clips an asset; a trailing OFF_AIR entry marks the gap to the
 * next midnight when the last asset would have crossed it. Deterministic → this IS the proof/report.
 */
export function buildAsRunLog(slots: FastChannelSlot[], dayStartMs?: number, tz?: string): AsRunEntry[] {
  const start = dayStartMs ?? localMidnightMs(clockNow(), tz);
  const out: AsRunEntry[] = [];
  let acc = 0;
  for (let i = 0; i < (slots?.length || 0); i++) {
    const s = slots[i];
    const d = slotDurationSec(s);
    if (acc + d > DAY_SEC) break; // no-clip: this asset would cross midnight, so it doesn't air today
    const m = resolveSlotMedia(s);
    out.push({
      slotId: s.id,
      type: s.type,
      title: m.title,
      startMs: start + acc * 1000,
      endMs: start + (acc + d) * 1000,
      durationSec: d,
      isAd: m.isAd,
      isReplay: s.isReplay,
      isPromo: s.isPromo,
    });
    acc += d;
  }
  if (acc < DAY_SEC && out.length) {
    out.push({
      slotId: 'off_air', type: 'OFF_AIR', title: 'Schedule resumes at midnight',
      startMs: start + acc * 1000, endMs: start + DAY_SEC * 1000, durationSec: DAY_SEC - acc, isAd: false,
    });
  }
  return out;
}

/**
 * TIME-OF-DAY anchored position — the terrestrial-broadcast join. The schedule is anchored to LOCAL
 * midnight and loops within the day, so tuning in at any wall-clock lands you on whatever is "on now"
 * AND how far into it to seek (you join mid-programme, never at the top), and the day resets at
 * midnight — matching per-day (weeklySlots) schedules. Use this for live playout instead of the
 * epoch-anchored linearPosition so 3pm always means the 3pm programme.
 */
export function dayAnchoredPosition(slots: FastChannelSlot[], atMs: number, tz?: string): { index: number; offsetSec: number } {
  const total = loopTotalSec(slots);
  if (!slots?.length || total <= 0) return { index: 0, offsetSec: 0 };
  let pos = Math.floor((atMs - localMidnightMs(atMs, tz)) / 1000) % total;
  if (pos < 0) pos += total;
  for (let i = 0; i < slots.length; i++) {
    const d = slotDurationSec(slots[i]);
    if (pos < d) return { index: i, offsetSec: pos };
    pos -= d;
  }
  return { index: 0, offsetSec: 0 };
}

/**
 * The single "what's on this channel right now" resolver for live playout. Picks the current weekday's
 * slots, then: a midnight-anchored channel uses the no-clip / off-air-until-midnight model; every other
 * channel uses the day-anchored loop. Returns the slots plus either {index, offsetSec} or {offAir}.
 */
export function playoutPosition(
  schedule: Pick<FastChannelSchedule, 'slots' | 'weeklySlots' | 'midnightAnchored' | 'timezone'> | null | undefined,
  atMs: number,
): { slots: FastChannelSlot[]; offAir: false; index: number; offsetSec: number } | { slots: FastChannelSlot[]; offAir: true; resumesInSec: number } {
  const slots = activeDaySlots(schedule, atMs);
  const tz = (schedule as any)?.timezone as string | undefined;
  if (schedule?.midnightAnchored) {
    const p = linearPositionMidnight(slots, atMs, tz);
    return p.offAir ? { slots, offAir: true, resumesInSec: p.resumesInSec } : { slots, offAir: false, index: p.index, offsetSec: p.offsetSec };
  }
  return { slots, offAir: false, ...dayAnchoredPosition(slots, atMs, tz) };
}

/** Restore real per-asset durations on a schedule from an id→seconds map (the owner's video library).
 *  Repairs the two PLACEHOLDER durations, never a real one:
 *   - ≤1  — older schedules poisoned by a writer bug, which collapsed the guide onto a single minute.
 *   - exactly DEFAULT_VIDEO_SEC — the "duration unknown" 30-min block written when an asset was never
 *     probed. Left unrepaired this is far worse than the ≤1 case: the slot claims 30 minutes for what
 *     may be a 100-second teaser, playout seeks past the asset's end, it ends instantly, and the rest
 *     of the half hour becomes FM/bumper filler — indistinguishable from a stuck ad break.
 *  FastChannelManager.retimeSchedule already treats both as "unknown / default-block"; this is the
 *  viewer-side path (LiveTvPlus / the EPG) and must agree with it, or a channel never self-heals. */
export function backfillScheduleDurations(sched: FastChannelSchedule, durMap: Map<string, number>): FastChannelSchedule {
  const fix = (slots?: FastChannelSlot[]) => (slots || []).map(s => {
    if ((s.type === 'VIDEO' || s.type === 'PUBLIC_DOMAIN') && s.videoId) {
      const stored = Math.round(Number(s.videoDurationSeconds) || 0);
      const real = durMap.get(s.videoId) || 0;
      const isPlaceholder = stored <= 1 || stored === DEFAULT_VIDEO_SEC;
      if (isPlaceholder && real > 0 && real !== stored) return { ...s, videoDurationSeconds: real };
    }
    return s;
  });
  const wk = sched.weeklySlots
    ? Object.fromEntries(Object.entries(sched.weeklySlots).map(([k, v]) => [k, fix(v as FastChannelSlot[])]))
    : undefined;
  return { ...sched, slots: fix(sched.slots), ...(wk ? { weeklySlots: wk as any } : {}) };
}

/** Repair placeholder programme lengths from URL→seconds probe results. This is the viewer-side
 * fallback for older Mux assets whose video document never received duration metadata. */
export function backfillScheduleDurationsByUrl(sched: FastChannelSchedule, durMap: Map<string, number>): FastChannelSchedule {
  const fix = (slots?: FastChannelSlot[]) => (slots || []).map(s => {
    if ((s.type === 'VIDEO' || s.type === 'PUBLIC_DOMAIN') && s.videoUrl) {
      const stored = Math.round(Number(s.videoDurationSeconds) || 0);
      const real = Math.round(durMap.get(s.videoUrl) || 0);
      const isPlaceholder = stored <= 1 || stored === DEFAULT_VIDEO_SEC;
      if (isPlaceholder && real > 1 && real !== stored) return { ...s, videoDurationSeconds: real };
    }
    return s;
  });
  const wk = sched.weeklySlots
    ? Object.fromEntries(Object.entries(sched.weeklySlots).map(([k, v]) => [k, fix(v as FastChannelSlot[])]))
    : undefined;
  return { ...sched, slots: fix(sched.slots), ...(wk ? { weeklySlots: wk as any } : {}) };
}

/** Unique media URLs whose stored length is still the known unknown-duration placeholder. */
export function unresolvedDurationUrls(sched: FastChannelSchedule): string[] {
  const urls = new Set<string>();
  const scan = (slots?: FastChannelSlot[]) => (slots || []).forEach(s => {
    if ((s.type !== 'VIDEO' && s.type !== 'PUBLIC_DOMAIN') || !s.videoUrl) return;
    const stored = Math.round(Number(s.videoDurationSeconds) || 0);
    if (stored <= 1 || stored === DEFAULT_VIDEO_SEC) urls.add(s.videoUrl);
  });
  scan(sched.slots);
  Object.values(sched.weeklySlots || {}).forEach(scan as any);
  return [...urls];
}

export type SlotMediaKind = 'MEDIA' | 'AD' | 'LIVE' | 'FM' | 'GENERATIVE';
export interface SlotMedia {
  kind: SlotMediaKind;
  muxPlaybackId?: string; // play via MuxPlayer
  url?: string;           // raw mp4 OR a non-Mux HLS .m3u8 (play via <video> + hls.js)
  isHls: boolean;
  title: string;
  thumbnail?: string;
  durationSec: number;
  isAd: boolean;
  isBumper: boolean;
  isPublicDomain: boolean;
  /** GENERATIVE only — what the device needs to render the programme itself. There is no url
   *  and no playback id, because there is no file. */
  generative?: { formId: string; seed: number; arcSec: number; offsetSec: number };
}

const MUX_M3U8 = /stream\.mux\.com\/([^./?#]+)\.m3u8/i;
const isHlsUrl = (u = '') => /\.m3u8($|[?#])/i.test(u);

/**
 * A URL that can only play inside a third-party iframe embed (YouTube/Twitch/Vimeo/…). FAST channels
 * must NOT play these — embeds break too easily (autoplay gates, TV iframe limits) and aren't real
 * platform/stream media. Used to drop such slots from FAST playout.
 */
export const isEmbedUrl = (u = ''): boolean =>
  /youtube\.com|youtu\.be|twitch\.tv|vimeo\.com|dailymotion\.com|facebook\.com\/plugins/i.test(u);

/**
 * Resolve a slot to something playable. Mux ids are extracted from the stored stream url so old
 * schedules (which stored videoUrl = https://stream.mux.com/<id>.m3u8) still play via MuxPlayer.
 */
export function resolveSlotMedia(s: FastChannelSlot): SlotMedia {
  const durationSec = slotDurationSec(s);
  if (s.type === 'GENERATIVE') {
    // Resolved against the wall clock by the caller (resolveGenerativeSlot) — this path only
    // reports the shape, because a seed derived here would not match the one every other
    // consumer computes.
    return {
      kind: 'GENERATIVE', isHls: false, title: s.videoTitle || 'Generative', durationSec,
      isAd: false, isBumper: false, isPublicDomain: false,
    };
  }
  if (s.type === 'AD_BREAK') {
    return { kind: 'AD', isHls: false, title: 'Commercial Break', durationSec, isAd: true, isBumper: false, isPublicDomain: false };
  }
  if (s.type === 'FM_BLOCK') {
    // Plajah FM as scheduled programming — the player renders the FM surface for the block's window.
    return { kind: 'FM', isHls: false, title: s.videoTitle || 'Plajah FM', durationSec, isAd: false, isBumper: false, isPublicDomain: false };
  }
  if (s.type === 'LIVE_INTERRUPT') {
    return { kind: 'LIVE', isHls: false, title: s.videoTitle || 'Live', durationSec, isAd: false, isBumper: false, isPublicDomain: false };
  }
  if (s.type === 'BUMPER') {
    const url = s.bumperUrl || '';
    const m = url.match(MUX_M3U8);
    return { kind: 'MEDIA', muxPlaybackId: m?.[1], url: m ? undefined : url, isHls: isHlsUrl(url), title: s.bumperTitle || 'Bumper', durationSec, isAd: false, isBumper: true, isPublicDomain: false };
  }
  // VIDEO / PUBLIC_DOMAIN
  const url = s.videoUrl || '';
  const m = url.match(MUX_M3U8);
  return {
    kind: 'MEDIA',
    muxPlaybackId: m?.[1],
    url: m ? undefined : url,
    isHls: isHlsUrl(url),
    title: s.videoTitle || 'Program',
    thumbnail: s.videoThumbnail,
    durationSec,
    isAd: false,
    isBumper: false,
    isPublicDomain: s.type === 'PUBLIC_DOMAIN',
  };
}

/** True when a slot has something to render (media url/mux, an ad interstitial, or a live slot). */
export function slotIsPlayable(s: FastChannelSlot): boolean {
  if (s.type === 'AD_BREAK' || s.type === 'LIVE_INTERRUPT' || s.type === 'FM_BLOCK') return true;
  const m = resolveSlotMedia(s);
  // FAST plays platform/stream media only — an iframe-only embed (YouTube/etc.) is NOT playable here.
  if (m.url && !m.muxPlaybackId && isEmbedUrl(m.url)) return false;
  return Boolean(m.muxPlaybackId || m.url);
}

interface RawVideoish { id?: string; title?: string; url?: string; muxPlaybackId?: string; thumbnailUrl?: string; coverImageUrl?: string; duration?: number; }

/**
 * Build an ephemeral VIDEO-only slot list from a raw video array — the fallback used when a channel
 * has no generated schedule yet, so it still plays linearly and matches a guide built the same way.
 */
export function slotsFromVideos(videos: RawVideoish[]): FastChannelSlot[] {
  return (videos || []).map((v, i) => ({
    id: `v_${v.id || i}`,
    type: 'VIDEO' as const,
    order: i,
    videoId: v.id,
    videoUrl: v.muxPlaybackId ? `https://stream.mux.com/${v.muxPlaybackId}.m3u8` : (v.url || ''),
    videoTitle: v.title,
    videoThumbnail: v.thumbnailUrl || v.coverImageUrl,
    // Use the real length only when known (>0); otherwise the default block. (The old
    // `Math.max(1,…) || DEFAULT` stored 1 second for unknown durations — never fall into that trap.)
    videoDurationSeconds: Math.round(Number(v.duration) || 0) > 0 ? Math.round(Number(v.duration)) : DEFAULT_VIDEO_SEC,
  }));
}
