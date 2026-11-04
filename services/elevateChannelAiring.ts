// elevateChannelAiring — what actually aired on an org's Live Hub TV channel
// during an Event Intelligence window.
//
// A TV-channel run (sourceKind FAST_CHANNEL, the N.2 sub-channel) has no live
// stream recording: the channel plays videos from its schedule. So instead of
// looking for a stream archive, we replay the channel's own playout resolver
// (services/fastChannelTimeline.playoutPosition — the same one the player and
// the guide use) across the window and add up how long each programme was on
// screen. The programme with the most airtime is the service we transcribe.
//
// Pure: no Firestore here, so it runs in tests and on the server alike.

import type { FastChannelSchedule, FastChannelSlot } from '../types';
import { playoutPosition, resolveSlotMedia } from './fastChannelTimeline';

export interface AiredProgram {
  /** Stable key for the media (Mux playback id or url). */
  key: string;
  kind: 'MEDIA' | 'LIVE';
  title: string;
  muxPlaybackId?: string;
  /** Non-Mux media url (mp4 / HLS). */
  url?: string;
  /** Seconds this programme was on air inside the window. */
  airedSec: number;
  /** Full length of the asset per the schedule (0 when unknown). */
  durationSec: number;
  /** Wall-clock ms the programme was first seen inside the window. */
  firstSeenMs: number;
  /** LIVE slots: where the live picture came from. */
  liveSourceKind?: FastChannelSlot['liveSourceKind'];
  liveSourceId?: string;
}

/** Programmes shorter than this inside the window are filler, not the service. */
export const MIN_SERVICE_AIRTIME_SEC = 5 * 60;

/**
 * Sample the channel every `stepSec` across [windowStart, windowEnd) and total
 * the airtime of each programme. Ads, bumpers, FM blocks and generative filler
 * are ignored. Sorted by airtime, longest first.
 */
export function airedProgramsInWindow(
  schedule: Pick<FastChannelSchedule, 'slots' | 'weeklySlots' | 'midnightAnchored' | 'timezone'> | null | undefined,
  windowStart: number,
  windowEnd: number,
  stepSec = 30,
): AiredProgram[] {
  if (!schedule || !(windowEnd > windowStart)) return [];
  const byKey = new Map<string, AiredProgram>();
  const stepMs = Math.max(1, stepSec) * 1000;
  for (let t = windowStart; t < windowEnd; t += stepMs) {
    const pos = playoutPosition(schedule, t) as { slots: FastChannelSlot[]; offAir: boolean; index?: number };
    if (pos.offAir) continue;
    const slot = pos.slots[pos.index || 0];
    if (!slot) continue;
    const media = resolveSlotMedia(slot);
    const add = Math.min(stepMs, windowEnd - t) / 1000;

    if (media.kind === 'LIVE') {
      const key = `live:${slot.liveSourceKind || ''}:${slot.liveSourceId || slot.liveSourceUrl || slot.id || 'live'}`;
      const prev = byKey.get(key);
      if (prev) { prev.airedSec += add; continue; }
      byKey.set(key, {
        key, kind: 'LIVE', title: media.title, url: slot.liveSourceUrl || undefined,
        airedSec: add, durationSec: media.durationSec, firstSeenMs: t,
        liveSourceKind: slot.liveSourceKind, liveSourceId: slot.liveSourceId,
      });
      continue;
    }
    if (media.kind !== 'MEDIA' || media.isAd || media.isBumper) continue;
    const key = media.muxPlaybackId ? `mux:${media.muxPlaybackId}` : media.url ? `url:${media.url}` : '';
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) { prev.airedSec += add; continue; }
    byKey.set(key, {
      key, kind: 'MEDIA', title: media.title,
      muxPlaybackId: media.muxPlaybackId, url: media.url,
      airedSec: add, durationSec: media.durationSec, firstSeenMs: t,
    });
  }
  return [...byKey.values()].sort((a, b) => b.airedSec - a.airedSec || a.firstSeenMs - b.firstSeenMs);
}

/** The service: the longest-airing programme, if it ran long enough to be one. */
export function pickServiceProgram(aired: AiredProgram[], minSec = MIN_SERVICE_AIRTIME_SEC): AiredProgram | null {
  const top = aired[0];
  return top && top.airedSec >= minSec ? top : null;
}

/** The url the captions route should fetch for a picked programme. */
export function programMediaUrl(p: AiredProgram): string {
  return p.muxPlaybackId ? `https://stream.mux.com/${p.muxPlaybackId}.m3u8` : (p.url || '');
}
