// services/livewire/manifest.ts — the HLS master playlist viewers open.
//
// MediaMTX serves one media playlist per path (one path per rung). The master playlist that ties
// the rungs into one adaptive stream is ours: it lists each rung with honest BANDWIDTH and RFC 6381
// CODECS strings so players (hls.js, Safari, ExoPlayer) can skip rungs they can't decode — that is
// how AV1 rungs reach capable devices while everyone else stays on H.264.

import type { Rung } from './types';

/** H.264 High profile level by picture size and frame rate. */
export function avcCodec(r: Pick<Rung, 'width' | 'height' | 'fps'>): string {
  const px = r.width * r.height;
  let level: number;
  if (px > 1280 * 720) level = r.fps > 30 ? 0x2a : 0x28;      // 4.2 / 4.0
  else if (px > 854 * 480) level = r.fps > 30 ? 0x20 : 0x1f;  // 3.2 / 3.1
  else level = 0x1e;                                          // 3.0
  return `avc1.6400${level.toString(16).padStart(2, '0')}`;
}

/** AV1 Main profile, 8-bit, by seq_level_idx. */
export function av1Codec(r: Pick<Rung, 'width' | 'height' | 'fps'>): string {
  const px = r.width * r.height;
  let idx: number;
  if (px > 1280 * 720) idx = r.fps > 30 ? 9 : 8;   // 4.1 / 4.0
  else if (px > 854 * 480) idx = 5;                // 3.1
  else idx = 4;                                    // 3.0
  return `av01.0.${String(idx).padStart(2, '0')}M.08`;
}

export const AAC_LC = 'mp4a.40.2';

export function codecsFor(r: Rung): string {
  if (r.codec === 'none') return AAC_LC;
  return `${r.codec === 'av1' ? av1Codec(r) : avcCodec(r)},${AAC_LC}`;
}

/** Container + packet overhead on top of the encoder's peak rate. */
const OVERHEAD = 1.1;

export interface MasterOptions {
  /** Media playlist URL for a rung, relative to the master. Default `<rung>/index.m3u8`. */
  uriFor?: (r: Rung) => string;
}

export function buildMasterPlaylist(rungs: Rung[], opts: MasterOptions = {}): string {
  const uri = opts.uriFor ?? ((r: Rung) => `${r.name}/index.m3u8`);
  const lines = ['#EXTM3U', '#EXT-X-VERSION:6', '#EXT-X-INDEPENDENT-SEGMENTS'];
  // Highest quality first: some players start on the first listed variant.
  const ordered = [...rungs].sort((a, b) => (b.maxKbps + b.audioKbps) - (a.maxKbps + a.audioKbps));
  for (const r of ordered) {
    const peak = Math.round((r.maxKbps + r.audioKbps) * 1000 * OVERHEAD);
    const avg = Math.round((r.videoKbps + r.audioKbps) * 1000 * OVERHEAD);
    const attrs = [`BANDWIDTH=${peak}`, `AVERAGE-BANDWIDTH=${avg}`, `CODECS="${codecsFor(r)}"`];
    if (r.codec !== 'none') attrs.push(`RESOLUTION=${r.width}x${r.height}`, `FRAME-RATE=${r.fps.toFixed(3)}`);
    lines.push(`#EXT-X-STREAM-INF:${attrs.join(',')}`, uri(r));
  }
  return lines.join('\n') + '\n';
}

export interface ParsedVariant { bandwidth: number; codecs?: string; resolution?: string; uri: string }

/** Minimal master playlist reader (tests + player diagnostics). */
export function parseMasterPlaylist(text: string): ParsedVariant[] {
  const out: ParsedVariant[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('#EXT-X-STREAM-INF:')) continue;
    const attr = (k: string) => {
      const m = l.match(new RegExp(`[:,]${k}=(?:"([^"]*)"|([^,]*))`));
      return m ? (m[1] ?? m[2]) : undefined;
    };
    const uri = (lines.slice(i + 1).find(x => x && !x.startsWith('#')) ?? '').trim();
    out.push({ bandwidth: Number(attr('BANDWIDTH')), codecs: attr('CODECS'), resolution: attr('RESOLUTION'), uri });
  }
  return out;
}
