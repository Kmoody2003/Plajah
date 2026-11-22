// ═══════════════════════════════════════════════════════════════════════════
// deliver — Fabula's render settings (the Deliver page), planned into real jobs.
//
// A delivery = RENDER (the Pixels engine draws the timeline at the target size + rate into an
// H.264 master) + optional TRANSCODE (ffmpeg turns that master into the requested container /
// codec: ProRes, DNxHR, HEVC, AV1, FFV1, MPEG-2 broadcast specs …). When the target already is
// MP4 / H.264 / AAC the render IS the deliverable — no second generation.
//
// Pure: settings + timeline → plan. tests/fabulaDeliver.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { CONTAINERS, audioCodecsFor, containersFor, extFor, videoCodecsFor } from '../crossover/formats';
import type { Recipe } from '../crossover/types';
import { MPEG2_PRESETS, isInterlacedAt, mpeg2Preset, pickRate, rateValue, type Mpeg2PresetId } from './mpeg2';

export type Quality = 'best' | 'high' | 'medium' | 'low' | 'bitrate';

export interface DeliverSettings {
  presetId: string;
  /** MPEG-2 broadcast spec: when set it owns codec, raster, audio and the allowed rates. */
  broadcast?: Mpeg2PresetId | null;
  kind: 'video' | 'audio';
  container: string;
  videoCodec: string;
  audioCodec: string;
  /** 'timeline' or 'WxH'. */
  resolution: string;
  /** 'timeline' or an ffmpeg rate string ('30000/1001', '25', …). */
  fps: string;
  quality: Quality;
  videoMbps?: number;
  proresProfile?: string;
  dnxProfile?: string;
  audioBitrate?: string;
  sampleRate?: number;
  channels?: number;
}

export interface TimelineFormat { w: number; h: number; fps: number; drop?: boolean }

// ── choices ─────────────────────────────────────────────────────────────────

export const RESOLUTIONS: { id: string; label: string; group: string }[] = [
  { id: 'timeline', label: 'Timeline resolution', group: '' },
  { id: '7680x4320', label: '8K UHD · 7680×4320', group: 'UHD / DCI' },
  { id: '4096x2160', label: 'DCI 4K · 4096×2160', group: 'UHD / DCI' },
  { id: '3840x2160', label: 'UHD 4K · 3840×2160', group: 'UHD / DCI' },
  { id: '2560x1440', label: 'QHD · 2560×1440', group: 'HD' },
  { id: '2048x1080', label: 'DCI 2K · 2048×1080', group: 'HD' },
  { id: '1920x1080', label: 'Full HD · 1920×1080', group: 'HD' },
  { id: '1280x720', label: 'HD · 1280×720', group: 'HD' },
  { id: '1080x1920', label: 'Vertical · 1080×1920', group: 'Social' },
  { id: '1080x1350', label: 'Portrait 4:5 · 1080×1350', group: 'Social' },
  { id: '1080x1080', label: 'Square · 1080×1080', group: 'Social' },
  { id: '720x480', label: 'NTSC SD · 720×480', group: 'SD' },
  { id: '720x576', label: 'PAL SD · 720×576', group: 'SD' },
  { id: 'custom', label: 'Custom…', group: '' },
];

export const FRAME_RATES: { id: string; label: string }[] = [
  { id: 'timeline', label: 'Timeline rate' },
  { id: '24000/1001', label: '23.976' }, { id: '24', label: '24' }, { id: '25', label: '25' },
  { id: '30000/1001', label: '29.97' }, { id: '30', label: '30' }, { id: '48', label: '48' },
  { id: '50', label: '50' }, { id: '60000/1001', label: '59.94' }, { id: '60', label: '60' },
  { id: '120', label: '120' },
];

/** Bits per pixel per frame for the H.264 render at each quality (≈ 18 / 12 / 8 / 4.5 Mb/s at 1080p30). */
const BPP: Record<Exclude<Quality, 'bitrate'>, number> = { best: 0.3, high: 0.2, medium: 0.13, low: 0.07 };
/** CRF handed to ffmpeg encoders that take one (x264/x265/VP9/AV1 scale it themselves). */
const CRF: Record<Exclude<Quality, 'bitrate'>, number> = { best: 16, high: 20, medium: 24, low: 28 };

// ── presets ─────────────────────────────────────────────────────────────────

export interface DeliverPreset { id: string; group: string; label: string; note: string; settings: Partial<DeliverSettings> }

const V = (container: string, videoCodec: string, audioCodec: string, extra: Partial<DeliverSettings> = {}): Partial<DeliverSettings> =>
  ({ kind: 'video', broadcast: null, container, videoCodec, audioCodec, resolution: 'timeline', fps: 'timeline', quality: 'high', ...extra });

export const DELIVER_PRESETS: DeliverPreset[] = [
  { id: 'custom', group: 'Custom', label: 'Custom export', note: 'Your own format, codec, size and rate.', settings: {} },
  // Web
  { id: 'h264-master', group: 'Web & streaming', label: 'H.264 Master', note: 'MP4 / H.264 / AAC at the timeline size — plays everywhere.', settings: V('mp4', 'h264', 'aac', { quality: 'best', audioBitrate: '320k' }) },
  { id: 'youtube-1080', group: 'Web & streaming', label: 'YouTube 1080p', note: 'YouTube recommended: H.264 high profile, AAC 384k.', settings: V('mp4', 'h264', 'aac', { resolution: '1920x1080', quality: 'high', audioBitrate: '384k' }) },
  { id: 'youtube-4k', group: 'Web & streaming', label: 'YouTube 4K', note: 'UHD 3840×2160 H.264, high bitrate.', settings: V('mp4', 'h264', 'aac', { resolution: '3840x2160', quality: 'high', audioBitrate: '384k' }) },
  { id: 'vimeo-1080', group: 'Web & streaming', label: 'Vimeo 1080p', note: 'High-bitrate H.264 for Vimeo re-encoding.', settings: V('mp4', 'h264', 'aac', { resolution: '1920x1080', quality: 'best', audioBitrate: '320k' }) },
  { id: 'social-vertical', group: 'Web & streaming', label: 'Vertical 9:16', note: 'Reels / Shorts / TikTok 1080×1920.', settings: V('mp4', 'h264', 'aac', { resolution: '1080x1920', quality: 'high', audioBitrate: '256k' }) },
  { id: 'hevc-small', group: 'Web & streaming', label: 'H.265 / HEVC', note: 'Half the size of H.264 for newer players.', settings: V('mp4', 'h265', 'aac', { quality: 'high', audioBitrate: '256k' }) },
  { id: 'av1-web', group: 'Web & streaming', label: 'AV1 (WebM)', note: 'Royalty-free next-gen web video.', settings: V('webm', 'av1', 'opus', { quality: 'high', audioBitrate: '192k' }) },
  { id: 'vp9-web', group: 'Web & streaming', label: 'VP9 (WebM)', note: 'Royalty-free web video.', settings: V('webm', 'vp9', 'opus', { quality: 'high', audioBitrate: '192k' }) },
  // Mastering
  { id: 'prores-hq', group: 'Mastering & finishing', label: 'ProRes 422 HQ', note: 'MOV mastering intermediate, 24-bit PCM.', settings: V('mov', 'prores', 'pcm_s24le', { proresProfile: '3' }) },
  { id: 'prores-422', group: 'Mastering & finishing', label: 'ProRes 422', note: 'Standard ProRes for editorial.', settings: V('mov', 'prores', 'pcm_s24le', { proresProfile: '2' }) },
  { id: 'prores-lt', group: 'Mastering & finishing', label: 'ProRes 422 LT', note: 'Lighter ProRes.', settings: V('mov', 'prores', 'pcm_s24le', { proresProfile: '1' }) },
  { id: 'prores-proxy', group: 'Mastering & finishing', label: 'ProRes Proxy', note: 'Offline editing copies.', settings: V('mov', 'prores', 'pcm_s16le', { proresProfile: '0' }) },
  { id: 'prores-4444', group: 'Mastering & finishing', label: 'ProRes 4444', note: 'Highest ProRes, keeps alpha.', settings: V('mov', 'prores', 'pcm_s24le', { proresProfile: '4' }) },
  { id: 'dnxhr-hq', group: 'Mastering & finishing', label: 'DNxHR HQ (MOV)', note: 'Avid-friendly 8-bit intermediate.', settings: V('mov', 'dnxhr', 'pcm_s24le', { dnxProfile: 'dnxhr_hq' }) },
  { id: 'dnxhr-hqx-mxf', group: 'Mastering & finishing', label: 'DNxHR HQX (MXF)', note: '10-bit DNxHR in MXF for Avid and servers.', settings: V('mxf', 'dnxhr', 'pcm_s24le', { dnxProfile: 'dnxhr_hqx' }) },
  { id: 'cineform', group: 'Mastering & finishing', label: 'GoPro CineForm', note: '10-bit editing intermediate.', settings: V('mov', 'cfhd', 'pcm_s24le') },
  { id: 'ffv1-archive', group: 'Mastering & finishing', label: 'FFV1 lossless archive', note: 'Matroska FFV1 + FLAC — preservation master.', settings: V('mkv', 'ffv1', 'flac') },
  // Broadcast (MPEG-2 specs)
  ...MPEG2_PRESETS.map((p) => ({
    id: 'm2:' + p.id, group: p.group === 'DVD / SD' ? 'DVD / SD' : p.group === 'Master' ? 'Mastering & finishing' : `Broadcast · ${p.group.replace('Broadcast ', '')}`,
    label: p.label, note: p.note,
    settings: { kind: 'video' as const, broadcast: p.id, container: p.ext === 'mxf' ? 'mxf' : p.ext === 'mpg' ? 'mpeg' : 'mpegts', videoCodec: 'mpeg2', audioCodec: p.audio?.codec || (p.id.startsWith('dvd') ? 'ac3' : 'mp2'), resolution: p.size ? `${p.size.w}x${p.size.h}` : 'timeline', fps: p.rates[0] || 'timeline', quality: 'best' as Quality },
  })),
  // Audio only
  { id: 'wav-24', group: 'Audio only', label: 'WAV 48 kHz 24-bit', note: 'Broadcast-quality mix.', settings: { kind: 'audio', broadcast: null, container: 'wav', audioCodec: 'pcm_s24le', sampleRate: 48000 } },
  { id: 'mp3-320', group: 'Audio only', label: 'MP3 320', note: 'Everyday audio.', settings: { kind: 'audio', broadcast: null, container: 'mp3', audioCodec: 'mp3', audioBitrate: '320k' } },
  { id: 'aac-m4a', group: 'Audio only', label: 'AAC (M4A)', note: 'Podcast / streaming audio.', settings: { kind: 'audio', broadcast: null, container: 'm4a', audioCodec: 'aac', audioBitrate: '256k' } },
];

export const DEFAULT_DELIVER: DeliverSettings = {
  presetId: 'h264-master', broadcast: null, kind: 'video', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac',
  resolution: 'timeline', fps: 'timeline', quality: 'best', audioBitrate: '320k', sampleRate: 48000, channels: 2,
};

export function applyPreset(cur: DeliverSettings, presetId: string): DeliverSettings {
  const p = DELIVER_PRESETS.find((x) => x.id === presetId);
  if (!p || presetId === 'custom') return { ...cur, presetId: 'custom' };
  return { ...DEFAULT_DELIVER, ...p.settings, presetId } as DeliverSettings;
}

/** Keep settings coherent after a manual change (container ⇒ codecs it can hold, etc.). */
export function normalize(s: DeliverSettings): DeliverSettings {
  const n = { ...s };
  if (n.broadcast) return n;
  const containers = containersFor(n.kind).map((c) => c.id).filter((id) => id !== 'gif');
  if (!containers.includes(n.container)) n.container = n.kind === 'audio' ? 'wav' : 'mp4';
  if (n.kind === 'video') {
    const vc = videoCodecsFor(n.container).map((c) => c.id);
    if (!vc.includes(n.videoCodec)) n.videoCodec = vc[0] || 'h264';
  }
  const ac = audioCodecsFor(n.container).map((c) => c.id);
  if (ac.length && !ac.includes(n.audioCodec)) n.audioCodec = ac[0];
  return n;
}

export const containerChoices = (kind: 'video' | 'audio') => containersFor(kind).filter((c) => c.id !== 'gif' && c.id !== 'm2t' && c.id !== 'gxf');

// ── plan ────────────────────────────────────────────────────────────────────

export interface DeliverPlan {
  /** What the Pixels renderer draws. */
  render: { w: number; h: number; fps: number; bitrate: number; quality: boolean };
  /** null = the render is the deliverable. */
  transcode: null | { type: 'mpeg2'; presetId: Mpeg2PresetId; fps: number } | { type: 'recipe'; recipe: Recipe; kind: 'video' | 'audio' };
  ext: string;
  /** One line for the queue row: "ProRes 422 HQ · 1920×1080 · 23.976". */
  summary: string;
  /** Codecs the in-browser pack can't encode; the desktop app can. */
  desktopOnly: boolean;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const PACK_CANT = new Set(['h265', 'av1', 'vp9', 'vvc', 'xvid', 'hap', 'jpeg2000', 'mjpeg']);
const fpsLabel = (f: number) => (Math.abs(f - 24000 / 1001) < 0.01 ? '23.976' : Math.abs(f - 30000 / 1001) < 0.01 ? '29.97' : Math.abs(f - 60000 / 1001) < 0.01 ? '59.94' : String(+f.toFixed(3)));

export function targetSize(s: DeliverSettings, tl: TimelineFormat, custom?: { w: number; h: number }): { w: number; h: number } {
  if (s.resolution === 'custom' && custom?.w && custom?.h) return { w: even(custom.w), h: even(custom.h) };
  const m = /^(\d+)x(\d+)$/.exec(s.resolution);
  return m ? { w: +m[1], h: +m[2] } : { w: even(tl.w), h: even(tl.h) };
}
export const targetFps = (s: DeliverSettings, tl: TimelineFormat) => (s.fps === 'timeline' ? tl.fps : rateValue(s.fps));

export function planDelivery(s: DeliverSettings, tl: TimelineFormat, custom?: { w: number; h: number }): DeliverPlan {
  if (s.broadcast) {
    const p = mpeg2Preset(s.broadcast);
    const rate = pickRate(p, s.fps === 'timeline' ? tl.fps : rateValue(s.fps));
    const fps = rateValue(rate);
    // Render a square-pixel 16:9 master at the spec rate; the spec builder squeezes / fields it.
    const size = p.size ? (p.anamorphic ? { w: 1920, h: 1080 } : p.size) : { w: even(tl.w), h: even(tl.h) };
    const render = { w: size.w <= 720 ? 1280 : size.w, h: size.w <= 720 ? 720 : size.h, fps, bitrate: masterBitrate(size.w <= 720 ? 1280 : size.w, size.w <= 720 ? 720 : size.h, fps), quality: true };
    const scan = p.size ? (isInterlacedAt(p, rate) ? 'i' : 'p') : '';
    return {
      render, transcode: { type: 'mpeg2', presetId: p.id, fps }, ext: p.ext, desktopOnly: false,
      summary: `${p.label} · ${p.size ? `${p.size.w}×${p.size.h}${scan}` : `${render.w}×${render.h}`} · ${fpsLabel(fps)}`,
    };
  }
  const { w, h } = targetSize(s, tl, custom);
  const fps = targetFps(s, tl);
  const direct = s.kind === 'video' && s.container === 'mp4' && s.videoCodec === 'h264' && s.audioCodec === 'aac';
  const bitrate = s.quality === 'bitrate' && s.videoMbps ? s.videoMbps * 1e6 : Math.round(w * h * fps * BPP[s.quality === 'bitrate' ? 'high' : s.quality]);
  if (direct) {
    return { render: { w, h, fps, bitrate: Math.min(bitrate, 160e6), quality: s.quality === 'best' }, transcode: null, ext: 'mp4', desktopOnly: false,
      summary: `H.264 · ${w}×${h} · ${fpsLabel(fps)} · ${(Math.min(bitrate, 160e6) / 1e6).toFixed(0)} Mb/s` };
  }
  const recipe: Recipe = {
    containerId: s.container, videoCodecId: s.kind === 'video' ? s.videoCodec : undefined, audioCodecId: s.audioCodec,
    hwAccel: 'auto', qualityMode: s.videoCodec === 'ffv1' ? 'lossless' : s.quality === 'bitrate' ? 'bitrate' : 'crf',
    crf: CRF[s.quality === 'bitrate' ? 'high' : s.quality], videoBitrate: s.quality === 'bitrate' && s.videoMbps ? `${s.videoMbps}M` : undefined,
    audioBitrate: s.audioBitrate, sampleRate: s.sampleRate, channels: s.channels,
    proresProfile: s.proresProfile, dnxProfile: s.dnxProfile,
  };
  const codecLabel = s.kind === 'audio' ? (s.audioCodec || '').toUpperCase() : `${s.videoCodec === 'prores' ? `ProRes ${({ '0': 'Proxy', '1': 'LT', '2': '422', '3': '422 HQ', '4': '4444' } as any)[s.proresProfile || '3']}` : s.videoCodec.toUpperCase()}`;
  const containerLabel = CONTAINERS.find((c) => c.id === s.container)?.label || s.container;
  return {
    render: { w, h, fps, bitrate: masterBitrate(w, h, fps), quality: true },
    transcode: { type: 'recipe', recipe, kind: s.kind }, ext: extFor(recipe, s.kind),
    desktopOnly: s.kind === 'video' && PACK_CANT.has(s.videoCodec),
    summary: s.kind === 'audio' ? `${containerLabel} · ${codecLabel}${s.sampleRate ? ` · ${s.sampleRate / 1000} kHz` : ''}` : `${codecLabel} · ${containerLabel} · ${w}×${h} · ${fpsLabel(fps)}`,
  };
}

/** The intermediate master feeding a transcode: generous, so the second generation stays clean. */
export function masterBitrate(w: number, h: number, fps: number): number {
  return Math.round(Math.min(120e6, Math.max(20e6, w * h * fps * 0.45)));
}

// ── ranges ──────────────────────────────────────────────────────────────────

export type DeliverRange = 'all' | 'inout' | 'markers';
export function spansFor(range: DeliverRange, end: number, markIn?: number | null, markOut?: number | null, markers: { t: number }[] = []): { t0: number; t1: number; tag: string }[] {
  if (range === 'inout' && markIn != null && markOut != null && markOut > markIn) return [{ t0: markIn, t1: markOut, tag: 'IN→OUT' }];
  if (range === 'markers' && markers.length) {
    const pts = [...markers.map((m) => m.t), end].sort((a, b) => a - b);
    const spans: { t0: number; t1: number; tag: string }[] = [];
    let prev = 0;
    for (const p of pts) { if (p - prev > 0.05) spans.push({ t0: prev, t1: p, tag: `SEG ${spans.length + 1}` }); prev = p; }
    if (spans.length) return spans;
  }
  return [{ t0: 0, t1: end, tag: 'ALL' }];
}
