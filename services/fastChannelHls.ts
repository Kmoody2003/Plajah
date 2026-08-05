// Plajah FAST — server-side linear HLS origin (the stream a TV platform / IPTV guide pulls).
//
// A FAST channel plays in-app via the deterministic client player (FastChannelPlayer). For external
// carriage (Samsung TV Plus / LG / Roku / an M3U aggregator) a platform instead pulls a single
// continuous HLS URL. This module builds that URL's playlist on the fly by stitching the channel's
// content programmes — which are already Mux HLS VOD assets — into ONE live-style media playlist:
// it computes the epoch-anchored "now", pulls the current programme's Mux media playlist, emits a
// small sliding window of segments ending at the live edge, and bridges across programme boundaries
// with #EXT-X-DISCONTINUITY. Deterministic, so every puller sees the same live edge.
//
// SCOPE (honest): this is a working PILOT origin for Mux-HLS content. It stitches the content slots
// only — house bumpers/ad-breaks (which have no common-format segments) are not muxed into the HLS
// origin; server-side ad insertion (SSAI) and a hardened 24/7 packager are an operational concern
// (Mux Live / Amagi / Wurl) for at-scale carriage. In-app playback does NOT use this path.

import type { FastChannelSlot } from '../types';
import { linearPosition, resolveSlotMedia, slotDurationSec } from './fastChannelTimeline';

export interface ParsedMedia {
  targetDuration: number;
  version: number;
  mapUri?: string;                                   // #EXT-X-MAP:URI — fMP4 init segment (absolute)
  segments: { uri: string; duration: number }[];     // absolute segment URLs + #EXTINF durations
}

const absUrl = (uri: string, base: string) => { try { return new URL(uri, base).toString(); } catch { return uri; } };

/** Parse an HLS media (segment) playlist. Relative URIs are resolved against baseUrl. */
export function parseMediaPlaylist(text: string, baseUrl: string): ParsedMedia {
  const lines = (text || '').split(/\r?\n/);
  let targetDuration = 6, version = 3, mapUri: string | undefined, pendingDur = 0;
  const segments: { uri: string; duration: number }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-TARGETDURATION:')) targetDuration = parseFloat(line.split(':')[1]) || targetDuration;
    else if (line.startsWith('#EXT-X-VERSION:')) version = parseInt(line.split(':')[1], 10) || version;
    else if (line.startsWith('#EXT-X-MAP:')) { const m = line.match(/URI="([^"]+)"/); if (m) mapUri = absUrl(m[1], baseUrl); }
    else if (line.startsWith('#EXTINF:')) pendingDur = parseFloat(line.split(':')[1]) || 0;
    else if (!line.startsWith('#')) { segments.push({ uri: absUrl(line, baseUrl), duration: pendingDur }); pendingDur = 0; }
  }
  return { targetDuration, version, mapUri, segments };
}

/** From a Mux master (or media) playlist, return the media-playlist URL for the highest-quality
 *  variant. If the text is already a media playlist (has #EXTINF), returns masterUrl unchanged. */
export function pickMediaPlaylistUrl(masterText: string, masterUrl: string): string | null {
  if (/#EXTINF:/.test(masterText)) return masterUrl;
  const lines = (masterText || '').split(/\r?\n/).map(l => l.trim());
  let best: { bw: number; uri: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || '0', 10);
    const uri = lines[i + 1]?.trim();
    if (uri && !uri.startsWith('#') && (!best || bw > best.bw)) best = { bw, uri: absUrl(uri, masterUrl) };
  }
  return best?.uri || null;
}

/** The Mux-HLS content programmes of a schedule, in loop order (bumpers/ads excluded — see scope). */
export function hlsContentSlots(slots: FastChannelSlot[]): FastChannelSlot[] {
  return (slots || []).filter(s => {
    const m = resolveSlotMedia(s);
    return m.kind === 'MEDIA' && !!m.muxPlaybackId;
  });
}

const muxMediaMaster = (playbackId: string) => `https://stream.mux.com/${playbackId}.m3u8`;

interface BuildOpts {
  slots: FastChannelSlot[];
  atMs: number;
  /** Injected fetcher (server passes a cached fetch). Returns the playlist text for a url. */
  fetchText: (url: string) => Promise<string>;
  windowSec?: number;   // how much of a live window to expose (default ~24s)
}

/**
 * Build a live HLS media playlist for the channel at wall-clock `atMs`. Returns null when the channel
 * has no stitchable Mux content (caller should 404 or fall back). The playlist exposes a small window
 * ending at the live edge; when the edge is early in a programme, the previous programme's tail is
 * bridged in with #EXT-X-DISCONTINUITY so the window is always full and continuous.
 */
export async function buildLinearMediaPlaylist(opts: BuildOpts): Promise<string | null> {
  const { slots, atMs, fetchText, windowSec = 24 } = opts;
  const content = hlsContentSlots(slots);
  if (!content.length) return null;

  // Position within the content-only loop (its own deterministic linear clock for the origin).
  const pos = linearPosition(content, atMs);
  const curSlot = content[pos.index];
  const prevSlot = content[(pos.index - 1 + content.length) % content.length];

  const loadMedia = async (slot: FastChannelSlot): Promise<ParsedMedia | null> => {
    const m = resolveSlotMedia(slot);
    if (!m.muxPlaybackId) return null;
    const masterUrl = muxMediaMaster(m.muxPlaybackId);
    const masterText = await fetchText(masterUrl).catch(() => '');
    const mediaUrl = pickMediaPlaylistUrl(masterText, masterUrl);
    if (!mediaUrl) return null;
    const mediaText = mediaUrl === masterUrl ? masterText : await fetchText(mediaUrl).catch(() => '');
    const parsed = parseMediaPlaylist(mediaText, mediaUrl);
    return parsed.segments.length ? parsed : null;
  };

  const cur = await loadMedia(curSlot);
  if (!cur) return null;

  // Cumulative start time of each segment; find the segment containing the live edge (offsetSec).
  const cumStart: number[] = [];
  let acc = 0;
  for (const s of cur.segments) { cumStart.push(acc); acc += s.duration; }
  let edge = cur.segments.length - 1;
  for (let i = 0; i < cur.segments.length; i++) { if (cumStart[i] + cur.segments[i].duration > pos.offsetSec) { edge = i; break; } }

  const targetDuration = Math.max(cur.targetDuration, 6);
  const nWindow = Math.max(2, Math.ceil(windowSec / targetDuration));

  // Collect the window segments ending at `edge`. If not enough precede it in this programme, bridge
  // in the tail of the previous programme with a discontinuity.
  type Seg = { uri: string; duration: number; disc?: boolean; map?: string };
  const win: Seg[] = [];
  const startIdx = edge - nWindow + 1;
  if (startIdx < 0) {
    const prev = await loadMedia(prevSlot).catch(() => null);
    if (prev && prev.segments.length) {
      const need = -startIdx;
      const tail = prev.segments.slice(Math.max(0, prev.segments.length - need));
      tail.forEach((s, k) => win.push(k === 0 ? { ...s, map: prev.mapUri } : s));
      // first current-programme segment gets the discontinuity marker
      cur.segments.slice(0, edge + 1).forEach((s, k) => win.push(k === 0 ? { ...s, disc: true, map: cur.mapUri } : s));
    } else {
      cur.segments.slice(0, edge + 1).forEach(s => win.push(s));
    }
  } else {
    cur.segments.slice(startIdx, edge + 1).forEach(s => win.push(s));
  }
  if (!win.length) return null;

  // Deterministic, monotonically-increasing media sequence anchored to the epoch loop clock.
  const loopTotal = content.reduce((a, s) => a + slotDurationSec(s), 0) || 1;
  const mediaSequence = Math.floor(Math.floor(atMs / 1000) / Math.max(1, targetDuration));

  const out: string[] = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    `#EXT-X-TARGETDURATION:${Math.ceil(targetDuration)}`,
    `#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`,
    '#EXT-X-DISCONTINUITY-SEQUENCE:0',
  ];
  let lastMap = '';
  for (const s of win) {
    if (s.disc) out.push('#EXT-X-DISCONTINUITY');
    if (s.map && s.map !== lastMap) { out.push(`#EXT-X-MAP:URI="${s.map}"`); lastMap = s.map; }
    out.push(`#EXTINF:${s.duration.toFixed(3)},`);
    out.push(s.uri);
  }
  // No #EXT-X-ENDLIST → a live/rolling playlist. void loopTotal (kept for clarity/future DVR sizing).
  void loopTotal;
  return out.join('\n') + '\n';
}

/** Fallback origin: the Mux master URL of whatever content programme is on now (used when stitching
 *  can't run). Not seamless across programmes, but a valid, playable HLS URL for the current show. */
export function currentProgrammeMasterUrl(slots: FastChannelSlot[], atMs: number): string | null {
  const content = hlsContentSlots(slots);
  if (!content.length) return null;
  const pos = linearPosition(content, atMs);
  const m = resolveSlotMedia(content[pos.index]);
  return m.muxPlaybackId ? muxMediaMaster(m.muxPlaybackId) : null;
}

// ── M3U channel lineup (the companion to the XMLTV EPG that IPTV/FAST aggregators ingest) ──────────
export interface M3uChannel { ownerId: string; name: string; number?: number; category?: string; logoUrl?: string; }

/** Standards `#EXTM3U` lineup. tvg-id matches the XMLTV channel id (plajah.<ownerId>) so a guide can
 *  join the two. Each entry points at the channel's linear HLS origin (streamBase/<ownerId>/stream.m3u8). */
export function buildM3uLineup(channels: M3uChannel[], streamBase: string): string {
  const out = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const c of channels) {
    const tvgId = `plajah.${c.ownerId}`;
    const attrs = [
      `tvg-id="${tvgId}"`,
      `tvg-name="${(c.name || 'Channel').replace(/"/g, '')}"`,
      c.number != null ? `tvg-chno="${c.number}"` : '',
      c.logoUrl ? `tvg-logo="${c.logoUrl}"` : '',
      `group-title="${(c.category || 'FAST').replace(/"/g, '')}"`,
    ].filter(Boolean).join(' ');
    out.push(`#EXTINF:-1 ${attrs},${c.name || 'Channel'}`);
    out.push(`${streamBase}/${c.ownerId}/stream.m3u8`);
  }
  return out.join('\n') + '\n';
}
