/**
 * The canonical list of an account's broadcast OUTPUTS — the single source of truth shared by the
 * Master Control multiview (what's on the wall) and the routing matrix (what you can route out).
 *
 * Merges configured outputs (live feeds, FAST channel, Plajah FM station, linked stations) with the
 * REAL live signals from broadcastTelemetry (live_feeds status, hosted Live Talk audience). Live
 * state is real where telemetry exists (video, talk); an enabled 24/7 FAST channel or satellite radio
 * station is genuinely on air whenever enabled, so those are `live` by enablement — but they carry no
 * fake audience. `audience` is set ONLY where a real count exists.
 */
import type { UserProfile, LinkedRadioStation } from '../types';
import type { BroadcastTelemetry } from './broadcastTelemetry';

export type OutputKind = 'video' | 'fast' | 'radio' | 'linked' | 'talk';

export interface BroadcastOutput {
  /** Stable id: feed:<id>, fast, plajahfm, linked:<id>, talk:<id>. Used as the routing key. */
  id: string;
  kind: OutputKind;
  name: string;
  sub: string;
  /** Actually on air — real where telemetry exists (video/talk), by enablement for FAST/radio/linked. */
  live: boolean;
  /** Broadcasting off-platform (a linked internet station). */
  external?: boolean;
  /** Real concurrent audience — set ONLY where a genuine count exists (never invented). */
  audience?: number;
}

export function buildOutputs(
  profile: Pick<UserProfile, 'liveStreamConfig' | 'fastChannelEnabled' | 'radioSettings' | 'displayName'>,
  linked: LinkedRadioStation[],
  telemetry: BroadcastTelemetry,
): BroadcastOutput[] {
  const out: BroadcastOutput[] = [];

  // ── Video: real live_feeds that are LIVE now, then configured feeds not currently live. ──
  const liveUrls = new Set(telemetry.liveFeeds.map(f => f.url).filter(Boolean));
  for (const f of telemetry.liveFeeds) {
    out.push({ id: `feed:${f.id}`, kind: 'video', name: f.title || 'Live feed', sub: 'Live stream · on air', live: true });
  }
  for (const f of profile.liveStreamConfig?.liveFeeds || []) {
    if (f.url && liveUrls.has(f.url)) continue; // already shown as a real live feed
    out.push({ id: `cfgfeed:${f.id}`, kind: 'video', name: f.name || 'Live feed', sub: f.source || 'Live stream', live: false });
  }

  // ── FAST channel: enabled = on air (24/7 linear). No per-viewer telemetry. ──
  if (profile.fastChannelEnabled) {
    out.push({ id: 'fast', kind: 'fast', name: 'FAST Channel', sub: 'Linear · 24/7', live: true });
  }

  // ── Plajah FM station: enabled = on air (satellite model). ──
  if (profile.radioSettings?.enabled) {
    out.push({
      id: 'plajahfm', kind: 'radio',
      name: profile.radioSettings.stationName || `${profile.displayName} Radio`,
      sub: 'Plajah FM station', live: true,
    });
  }

  // ── Live Talk: real audience count. ──
  if (telemetry.liveTalk) {
    out.push({
      id: `talk:${telemetry.liveTalk.id}`, kind: 'talk',
      name: telemetry.liveTalk.title, sub: 'Live Talk · on air',
      live: true, audience: telemetry.liveTalk.listeners,
    });
  }

  // ── Linked internet stations: external, broadcasting off-platform. ──
  for (const s of linked) {
    out.push({
      id: `linked:${s.id}`, kind: 'linked', name: s.name,
      sub: [s.genre, s.country].filter(Boolean).join(' · ') || 'Internet radio',
      live: true, external: true,
    });
  }

  return out;
}

/** Total real audience across outputs (only outputs with a genuine count contribute). */
export function totalAudience(outputs: BroadcastOutput[]): number {
  return outputs.reduce((sum, o) => sum + (o.audience || 0), 0);
}

/** True when at least one output reports a real audience number. */
export function hasAudienceData(outputs: BroadcastOutput[]): boolean {
  return outputs.some(o => typeof o.audience === 'number');
}
